import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { recordAuditEvent } from "../auth/repository";
import { mutateProject } from "./repository";
import {
  compositionRevealPositions,
  narrationSegmentSchema,
  presentationTemplateSchema,
  projectSlideSchema,
  projectStageSchema,
  researchLogEntrySchema,
  slideBlockSchema,
  slideSceneDataNodeSchema,
  slideSceneInfoNodeSchema,
  slideSceneLayoutNodeSchema,
  slideSceneMediaNodeSchema,
  slideSceneTextNodeSchema,
  voicevoxProfileSchema,
  type ProjectDocument,
  type ProjectRecord,
  type SlideSceneNode
} from "./schema";
import {
  normalizeProjectToolError,
  projectErrorSchema,
  ProjectToolError,
  requireSubject,
  toolResult
} from "./tools";

const projectIdInput = {
  project_id: z.string().uuid(),
  expected_version: z.number().int().positive()
};

const mutationOutput = {
  ok: z.boolean(),
  request_id: z.string().uuid(),
  project_id: z.string().uuid().nullable(),
  version: z.number().int().positive().nullable(),
  updated_at: z.string().datetime().nullable(),
  changed: z
    .object({ kind: z.string(), id: z.string().nullable() })
    .nullable(),
  current_version: z.number().int().positive().nullable(),
  error: projectErrorSchema.nullable()
};

type MutationContext = {
  projectId: string;
  expectedVersion: number;
  changedKind: string;
  changedId?: string | null;
  mutate: (document: ProjectDocument) => void;
};

async function executeMutation(
  db: D1Database,
  getAuthProps: () => Record<string, unknown> | undefined,
  context: MutationContext
) {
  const requestId = crypto.randomUUID();
  try {
    const ownerUserId = requireSubject(getAuthProps, "research:write");
    const project = await mutateProject(db, {
      ownerUserId,
      projectId: context.projectId,
      expectedVersion: context.expectedVersion,
      mutate: context.mutate
    });
    await recordAuditEvent(db, {
      userId: ownerUserId,
      eventType: `project.${context.changedKind}`,
      outcome: "succeeded",
      details: {
        project_id: context.projectId,
        changed_id: context.changedId ?? null,
        version: project.version
      },
      createdAt: new Date().toISOString()
    });
    return mutationSuccess(requestId, project, context);
  } catch (error) {
    const normalized = normalizeProjectToolError(error);
    return toolResult(
      {
        ok: false,
        request_id: requestId,
        project_id: context.projectId,
        version: null,
        updated_at: null,
        changed: null,
        current_version: normalized.currentVersion,
        error: { code: normalized.code, message: normalized.message }
      },
      true
    );
  }
}

function mutationSuccess(
  requestId: string,
  project: ProjectRecord,
  context: MutationContext
) {
  return toolResult({
    ok: true,
    request_id: requestId,
    project_id: project.project_id,
    version: project.version,
    updated_at: project.updated_at,
    changed: {
      kind: context.changedKind,
      id: context.changedId ?? null
    },
    current_version: project.version,
    error: null
  });
}

function requireDeck(document: ProjectDocument) {
  if (document.deck === null) {
    throw new ProjectToolError(
      "DECK_REQUIRED",
      "Configure the presentation deck before editing slides or templates."
    );
  }
  return document.deck;
}

function findSlide(document: ProjectDocument, slideId: string) {
  const slide = requireDeck(document).slides.find((item) => item.id === slideId);
  if (slide === undefined) {
    throw new ProjectToolError("SLIDE_NOT_FOUND", "The slide does not exist.");
  }
  return slide;
}

function recalculateSlideRevealSteps(
  slide: ReturnType<typeof findSlide>
): void {
  slide.reveal_steps = Math.max(
    ...slide.reveal_blocks.map((block) => block.at),
    ...(slide.narration?.segments.map((segment) => segment.at) ?? []),
    ...compositionRevealPositions(slide.composition),
    0
  );
}

function upsertSceneComponent(
  document: ProjectDocument,
  slideId: string,
  component: SlideSceneNode
): void {
  const slide = findSlide(document, slideId);
  if (slide.composition?.mode === "canvas") {
    throw new ProjectToolError(
      "INVALID_COMPOSITION_MODE",
      "This slide uses the flat canvas. Enable the component scene first."
    );
  }
  slide.composition ??= {
    mode: "scene",
    runtime_version: "uf-runtime@1",
    background: "#11100e",
    clip_content: true,
    nodes: []
  };
  const index = slide.composition.nodes.findIndex(
    (node) => node.id === component.id
  );
  if (index === -1) slide.composition.nodes.push(component);
  else slide.composition.nodes[index] = component;
  slide.composition.nodes.sort(
    (left, right) =>
      left.order - right.order || left.id.localeCompare(right.id)
  );
  recalculateSlideRevealSteps(slide);
}

export function registerProjectMutationTools(
  server: McpServer,
  db: D1Database,
  getAuthProps: () => Record<string, unknown> | undefined
): void {
  server.registerTool(
    "update_project_fields",
    {
      title: "研究の基本項目だけを更新",
      description:
        "指定した基本項目だけを変更します。研究全体やdeckを送り直す必要はありません。少なくとも一項目を指定してください。",
      inputSchema: {
        ...projectIdInput,
        stage: projectStageSchema.optional(),
        title: z.string().min(1).max(120).optional(),
        summary: z.string().max(2_000).optional(),
        question: z.string().max(2_000).nullable().optional(),
        hypothesis: z.string().max(4_000).nullable().optional(),
        method: z.string().max(20_000).nullable().optional()
      },
      outputSchema: mutationOutput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async ({ project_id, expected_version, ...fields }) => {
      if (Object.values(fields).every((value) => value === undefined)) {
        return executeMutation(db, getAuthProps, {
          projectId: project_id,
          expectedVersion: expected_version,
          changedKind: "fields_updated",
          mutate: () => {
            throw new ProjectToolError(
              "INVALID_CHANGE",
              "At least one field must be supplied."
            );
          }
        });
      }
      return executeMutation(db, getAuthProps, {
        projectId: project_id,
        expectedVersion: expected_version,
        changedKind: "fields_updated",
        mutate: (document) => {
          Object.assign(document, fields);
        }
      });
    }
  );

  server.registerTool(
    "set_project_list_item",
    {
      title: "研究の箇条書きを一件編集",
      description:
        "findingsまたはlimitationsの一件を追加・置換・削除します。追加はindexを省略、削除はvalueをnullにします。",
      inputSchema: {
        ...projectIdInput,
        list: z.enum(["findings", "limitations"]),
        index: z.number().int().nonnegative().max(99).optional(),
        value: z.string().min(1).max(4_000).nullable()
      },
      outputSchema: mutationOutput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async ({ project_id, expected_version, list, index, value }) =>
      executeMutation(db, getAuthProps, {
        projectId: project_id,
        expectedVersion: expected_version,
        changedKind: `${list}_item_updated`,
        changedId: index === undefined ? null : String(index),
        mutate: (document) => {
          const values = document[list];
          if (index === undefined) {
            if (value === null) {
              throw new ProjectToolError(
                "INVALID_CHANGE",
                "An index is required when deleting an item."
              );
            }
            values.push(value);
            return;
          }
          if (index >= values.length) {
            throw new ProjectToolError(
              "INVALID_POSITION",
              "The list index does not exist."
            );
          }
          if (value === null) values.splice(index, 1);
          else values[index] = value;
        }
      })
  );

  server.registerTool(
    "append_research_log",
    {
      title: "研究ログを一件追加",
      description: "観察、実験、判断、出典、メモを一件だけ追記します。",
      inputSchema: {
        ...projectIdInput,
        entry: researchLogEntrySchema
      },
      outputSchema: mutationOutput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async ({ project_id, expected_version, entry }) =>
      executeMutation(db, getAuthProps, {
        projectId: project_id,
        expectedVersion: expected_version,
        changedKind: "log_appended",
        changedId: entry.id,
        mutate: (document) => {
          if (document.logs.some((item) => item.id === entry.id)) {
            throw new ProjectToolError(
              "LOG_ENTRY_EXISTS",
              "A log entry with this ID already exists."
            );
          }
          document.logs.push(entry);
        }
      })
  );

  server.registerTool(
    "configure_deck",
    {
      title: "発表全体の設定を編集",
      description:
        "発表がなければ既定値で作成し、指定した全体設定だけを変更します。slideやtemplateは別toolで編集します。",
      inputSchema: {
        ...projectIdInput,
        short_title: z.string().min(1).max(60).optional(),
        description: z.string().max(500).optional(),
        author: z.string().max(120).optional(),
        year: z.number().int().min(2021).max(2100).optional(),
        accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
        layout: z.enum(["cinematic", "biim", "minimal"]).optional(),
        default_template_id: z
          .string()
          .regex(/^[a-z0-9][a-z0-9-]{0,63}$/)
          .nullable()
          .optional()
      },
      outputSchema: mutationOutput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async ({ project_id, expected_version, ...fields }) =>
      executeMutation(db, getAuthProps, {
        projectId: project_id,
        expectedVersion: expected_version,
        changedKind: "deck_configured",
        mutate: (document) => {
          document.deck ??= {
            short_title: document.title.slice(0, 60),
            description: "",
            author: "",
            year: new Date().getUTCFullYear(),
            accent: "#9d7bff",
            layout: "minimal",
            narration_defaults: null,
            templates: [],
            default_template_id: null,
            slides: []
          };
          Object.assign(document.deck, fields);
        }
      })
  );

  server.registerTool(
    "upsert_presentation_template",
    {
      title: "発表テンプレートを作成・更新",
      description:
        "安全な色・配置・余白・animation presetだけからなるtemplateを一件保存します。HTML/CSS/JavaScriptは受け付けません。",
      inputSchema: {
        ...projectIdInput,
        template: presentationTemplateSchema
      },
      outputSchema: mutationOutput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async ({ project_id, expected_version, template }) =>
      executeMutation(db, getAuthProps, {
        projectId: project_id,
        expectedVersion: expected_version,
        changedKind: "template_upserted",
        changedId: template.id,
        mutate: (document) => {
          const deck = requireDeck(document);
          deck.templates ??= [];
          const index = deck.templates.findIndex((item) => item.id === template.id);
          if (index === -1) deck.templates.push(template);
          else deck.templates[index] = template;
        }
      })
  );

  server.registerTool(
    "upsert_voicevox_profile",
    {
      title: "VOICEVOX音声profileを作成・更新",
      description:
        "話者・style・調声値をprofile一件として保存します。既存IDは更新され、segmentからはprofile IDだけを参照します。",
      inputSchema: {
        ...projectIdInput,
        catalog_revision: z.string().min(1).max(128),
        profile: voicevoxProfileSchema,
        make_default: z.boolean().optional()
      },
      outputSchema: mutationOutput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async ({ project_id, expected_version, catalog_revision, profile, make_default }) =>
      executeMutation(db, getAuthProps, {
        projectId: project_id,
        expectedVersion: expected_version,
        changedKind: "voicevox_profile_upserted",
        changedId: profile.id,
        mutate: (document) => {
          const deck = requireDeck(document);
          deck.voicevox ??= {
            catalog_revision,
            default_profile_id: profile.id,
            profiles: []
          };
          deck.voicevox.catalog_revision = catalog_revision;
          const index = deck.voicevox.profiles.findIndex(
            (item) => item.id === profile.id
          );
          if (index === -1) deck.voicevox.profiles.push(profile);
          else deck.voicevox.profiles[index] = profile;
          if (make_default === true || deck.voicevox.profiles.length === 1) {
            deck.voicevox.default_profile_id = profile.id;
          }
        }
      })
  );

  server.registerTool(
    "create_slide",
    {
      title: "スライドを一枚追加",
      description:
        "最小限の内容でスライドを追加します。本文、reveal、読み上げは追加後に個別toolで編集できます。",
      inputSchema: {
        ...projectIdInput,
        slide_id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
        title: z.string().min(1).max(120),
        position: z.number().int().nonnegative().max(99).optional()
      },
      outputSchema: mutationOutput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async ({ project_id, expected_version, slide_id, title, position }) =>
      executeMutation(db, getAuthProps, {
        projectId: project_id,
        expectedVersion: expected_version,
        changedKind: "slide_created",
        changedId: slide_id,
        mutate: (document) => {
          const deck = requireDeck(document);
          if (deck.slides.some((slide) => slide.id === slide_id)) {
            throw new ProjectToolError(
              "SLIDE_EXISTS",
              "A slide with this ID already exists."
            );
          }
          const slide = projectSlideSchema.parse({
            id: slide_id,
            title,
            duration_seconds: 60,
            reveal_steps: 0,
            tone: "dark",
            template_id: deck.default_template_id ?? null,
            enter_animation: null,
            content_markdown: title,
            reveal_blocks: [],
            sidebar_markdown: null,
            narration: null
          });
          deck.slides.splice(Math.min(position ?? deck.slides.length, deck.slides.length), 0, slide);
        }
      })
  );

  server.registerTool(
    "update_slide_fields",
    {
      title: "スライドの項目だけを更新",
      description:
        "指定したスライドのタイトル、本文、時間、見た目、補足欄だけを変更します。revealと読み上げは別toolです。",
      inputSchema: {
        ...projectIdInput,
        slide_id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
        title: z.string().min(1).max(120).optional(),
        duration_seconds: z.number().int().positive().max(1_200).optional(),
        tone: z.enum(["dark", "light", "signal", "quiet"]).optional(),
        template_id: z
          .string()
          .regex(/^[a-z0-9][a-z0-9-]{0,63}$/)
          .nullable()
          .optional(),
        enter_animation: z
          .enum(["none", "fade", "rise", "zoom", "wipe"])
          .nullable()
          .optional(),
        content_markdown: z.string().min(1).max(20_000).optional(),
        sidebar_markdown: z.string().max(10_000).nullable().optional()
      },
      outputSchema: mutationOutput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async ({ project_id, expected_version, slide_id, ...fields }) =>
      executeMutation(db, getAuthProps, {
        projectId: project_id,
        expectedVersion: expected_version,
        changedKind: "slide_fields_updated",
        changedId: slide_id,
        mutate: (document) => {
          if (Object.values(fields).every((value) => value === undefined)) {
            throw new ProjectToolError(
              "INVALID_CHANGE",
              "At least one slide field must be supplied."
            );
          }
          Object.assign(findSlide(document, slide_id), fields);
        }
      })
  );

  server.registerTool(
    "set_slide_canvas",
    {
      title: "スライドの自由配置canvasを設定",
      description:
        "一枚のslideを自由配置canvasへ切り替え、背景色と領域外clipを設定します。無効化すると従来の定型flow表示へ戻ります。",
      inputSchema: {
        ...projectIdInput,
        slide_id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
        enabled: z.boolean(),
        background: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
        clip_content: z.boolean().optional()
      },
      outputSchema: mutationOutput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async ({ project_id, expected_version, slide_id, enabled, background, clip_content }) =>
      executeMutation(db, getAuthProps, {
        projectId: project_id,
        expectedVersion: expected_version,
        changedKind: "slide_canvas_updated",
        changedId: slide_id,
        mutate: (document) => {
          const slide = findSlide(document, slide_id);
          if (!enabled) {
            slide.composition = null;
            recalculateSlideRevealSteps(slide);
            return;
          }
          if (slide.composition?.mode === "scene") {
            slide.composition = {
              mode: "canvas",
              background: background ?? slide.composition.background,
              clip_content:
                clip_content ?? slide.composition.clip_content,
              blocks: []
            };
          } else {
            slide.composition ??= {
              mode: "canvas",
              background: background ?? "#111827",
              clip_content: clip_content ?? true,
              blocks: []
            };
          }
          if (background !== undefined) {
            slide.composition.background = background;
          }
          if (clip_content !== undefined) {
            slide.composition.clip_content = clip_content;
          }
        }
      })
  );

  server.registerTool(
    "upsert_slide_block",
    {
      title: "自由配置blockを作成・更新",
      description:
        "markdown、project画像、図形のblockを一件だけ追加または置換します。frameは16:9 canvas内の百分率座標です。",
      inputSchema: {
        ...projectIdInput,
        slide_id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
        block: slideBlockSchema
      },
      outputSchema: mutationOutput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async ({ project_id, expected_version, slide_id, block }) =>
      executeMutation(db, getAuthProps, {
        projectId: project_id,
        expectedVersion: expected_version,
        changedKind: "slide_block_upserted",
        changedId: `${slide_id}:${block.id}`,
        mutate: (document) => {
          const slide = findSlide(document, slide_id);
          if (slide.composition?.mode === "scene") {
            throw new ProjectToolError(
              "INVALID_COMPOSITION_MODE",
              "This slide uses a component scene. Use the matching upsert_slide_*_component tool."
            );
          }
          slide.composition ??= {
            mode: "canvas",
            background: "#111827",
            clip_content: true,
            blocks: []
          };
          const index = slide.composition.blocks.findIndex(
            (item) => item.id === block.id
          );
          if (index === -1) slide.composition.blocks.push(block);
          else slide.composition.blocks[index] = block;
          slide.composition.blocks.sort(
            (a, b) => a.z_index - b.z_index || a.id.localeCompare(b.id)
          );
          recalculateSlideRevealSteps(slide);
        }
      })
  );

  server.registerTool(
    "delete_slide_block",
    {
      title: "自由配置blockを削除",
      description: "指定したslideからblockを一件だけ削除します。",
      inputSchema: {
        ...projectIdInput,
        slide_id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
        block_id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/)
      },
      outputSchema: mutationOutput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async ({ project_id, expected_version, slide_id, block_id }) =>
      executeMutation(db, getAuthProps, {
        projectId: project_id,
        expectedVersion: expected_version,
        changedKind: "slide_block_deleted",
        changedId: `${slide_id}:${block_id}`,
        mutate: (document) => {
          const slide = findSlide(document, slide_id);
          if (slide.composition?.mode !== "canvas") {
            throw new ProjectToolError(
              "INVALID_COMPOSITION_MODE",
              "This slide does not use the flat canvas."
            );
          }
          const index = slide.composition.blocks.findIndex(
            (block) => block.id === block_id
          );
          if (index === -1) {
            throw new ProjectToolError(
              "BLOCK_NOT_FOUND",
              "The slide block does not exist."
            );
          }
          slide.composition.blocks.splice(index, 1);
          recalculateSlideRevealSteps(slide);
        }
      })
  );

  server.registerTool(
    "set_slide_scene",
    {
      title: "スライドのcomponent sceneを設定",
      description:
        "一枚を登録済みWeb Componentsのsceneへ切り替えます。layer、stack、gridを親にしてリッチな部品をネストできます。",
      inputSchema: {
        ...projectIdInput,
        slide_id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
        enabled: z.boolean(),
        background: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
        clip_content: z.boolean().optional()
      },
      outputSchema: mutationOutput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async ({ project_id, expected_version, slide_id, enabled, background, clip_content }) =>
      executeMutation(db, getAuthProps, {
        projectId: project_id,
        expectedVersion: expected_version,
        changedKind: "slide_scene_updated",
        changedId: slide_id,
        mutate: (document) => {
          const slide = findSlide(document, slide_id);
          if (!enabled) {
            slide.composition = null;
            recalculateSlideRevealSteps(slide);
            return;
          }
          if (slide.composition?.mode !== "scene") {
            slide.composition = {
              mode: "scene",
              runtime_version: "uf-runtime@1",
              background: background ?? slide.composition?.background ?? "#11100e",
              clip_content:
                clip_content ?? slide.composition?.clip_content ?? true,
              nodes: []
            };
          }
          if (background !== undefined) {
            slide.composition.background = background;
          }
          if (clip_content !== undefined) {
            slide.composition.clip_content = clip_content;
          }
          recalculateSlideRevealSteps(slide);
        }
      })
  );

  server.registerTool(
    "upsert_slide_layout_component",
    {
      title: "sceneのlayout componentを作成・更新",
      description:
        "layer、stack、gridを一件だけ追加または置換します。子componentはparent_idでこのlayoutへ入れます。",
      inputSchema: {
        ...projectIdInput,
        slide_id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
        component: slideSceneLayoutNodeSchema
      },
      outputSchema: mutationOutput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async ({ project_id, expected_version, slide_id, component }) =>
      executeMutation(db, getAuthProps, {
        projectId: project_id,
        expectedVersion: expected_version,
        changedKind: "slide_component_upserted",
        changedId: `${slide_id}:${component.id}`,
        mutate: (document) => upsertSceneComponent(document, slide_id, component)
      })
  );

  server.registerTool(
    "upsert_slide_text_component",
    {
      title: "sceneの文章componentを作成・更新",
      description:
        "hero、markdown、quoteを一件だけ追加または置換します。",
      inputSchema: {
        ...projectIdInput,
        slide_id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
        component: slideSceneTextNodeSchema
      },
      outputSchema: mutationOutput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async ({ project_id, expected_version, slide_id, component }) =>
      executeMutation(db, getAuthProps, {
        projectId: project_id,
        expectedVersion: expected_version,
        changedKind: "slide_component_upserted",
        changedId: `${slide_id}:${component.id}`,
        mutate: (document) => upsertSceneComponent(document, slide_id, component)
      })
  );

  server.registerTool(
    "upsert_slide_info_component",
    {
      title: "sceneの情報componentを作成・更新",
      description:
        "card、metric、calloutを一件だけ追加または置換します。",
      inputSchema: {
        ...projectIdInput,
        slide_id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
        component: slideSceneInfoNodeSchema
      },
      outputSchema: mutationOutput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async ({ project_id, expected_version, slide_id, component }) =>
      executeMutation(db, getAuthProps, {
        projectId: project_id,
        expectedVersion: expected_version,
        changedKind: "slide_component_upserted",
        changedId: `${slide_id}:${component.id}`,
        mutate: (document) => upsertSceneComponent(document, slide_id, component)
      })
  );

  server.registerTool(
    "upsert_slide_data_component",
    {
      title: "sceneのデータcomponentを作成・更新",
      description:
        "bar chartまたはtimelineを一件だけ追加または置換します。itemごとに表示stepを指定できます。",
      inputSchema: {
        ...projectIdInput,
        slide_id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
        component: slideSceneDataNodeSchema
      },
      outputSchema: mutationOutput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async ({ project_id, expected_version, slide_id, component }) =>
      executeMutation(db, getAuthProps, {
        projectId: project_id,
        expectedVersion: expected_version,
        changedKind: "slide_component_upserted",
        changedId: `${slide_id}:${component.id}`,
        mutate: (document) => upsertSceneComponent(document, slide_id, component)
      })
  );

  server.registerTool(
    "upsert_slide_media_component",
    {
      title: "sceneの画像・装飾componentを作成・更新",
      description:
        "project画像またはshapeを一件だけ追加または置換します。外部URLは受け付けません。",
      inputSchema: {
        ...projectIdInput,
        slide_id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
        component: slideSceneMediaNodeSchema
      },
      outputSchema: mutationOutput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async ({ project_id, expected_version, slide_id, component }) =>
      executeMutation(db, getAuthProps, {
        projectId: project_id,
        expectedVersion: expected_version,
        changedKind: "slide_component_upserted",
        changedId: `${slide_id}:${component.id}`,
        mutate: (document) => upsertSceneComponent(document, slide_id, component)
      })
  );

  server.registerTool(
    "delete_slide_component",
    {
      title: "scene componentを削除",
      description:
        "指定componentと、そのcomponentを親にする子孫を一件の操作で削除します。",
      inputSchema: {
        ...projectIdInput,
        slide_id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
        component_id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/)
      },
      outputSchema: mutationOutput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async ({ project_id, expected_version, slide_id, component_id }) =>
      executeMutation(db, getAuthProps, {
        projectId: project_id,
        expectedVersion: expected_version,
        changedKind: "slide_component_deleted",
        changedId: `${slide_id}:${component_id}`,
        mutate: (document) => {
          const slide = findSlide(document, slide_id);
          if (slide.composition?.mode !== "scene") {
            throw new ProjectToolError(
              "INVALID_COMPOSITION_MODE",
              "This slide does not use a component scene."
            );
          }
          if (!slide.composition.nodes.some((node) => node.id === component_id)) {
            throw new ProjectToolError(
              "COMPONENT_NOT_FOUND",
              "The slide component does not exist."
            );
          }
          const removing = new Set([component_id]);
          let changed = true;
          while (changed) {
            changed = false;
            for (const node of slide.composition.nodes) {
              if (node.parent_id !== null && removing.has(node.parent_id) && !removing.has(node.id)) {
                removing.add(node.id);
                changed = true;
              }
            }
          }
          slide.composition.nodes = slide.composition.nodes.filter(
            (node) => !removing.has(node.id)
          );
          recalculateSlideRevealSteps(slide);
        }
      })
  );

  server.registerTool(
    "set_slide_reveal",
    {
      title: "段階表示を一件編集",
      description:
        "スライドの指定stepへ表示内容を追加・置換します。markdownをnullにすると削除します。reveal_stepsは必要に応じて自動で増えます。",
      inputSchema: {
        ...projectIdInput,
        slide_id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
        at: z.number().int().positive().max(100),
        markdown: z.string().min(1).max(10_000).nullable()
      },
      outputSchema: mutationOutput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async ({ project_id, expected_version, slide_id, at, markdown }) =>
      executeMutation(db, getAuthProps, {
        projectId: project_id,
        expectedVersion: expected_version,
        changedKind: "slide_reveal_updated",
        changedId: `${slide_id}:${at}`,
        mutate: (document) => {
          const slide = findSlide(document, slide_id);
          const index = slide.reveal_blocks.findIndex((block) => block.at === at);
          if (markdown === null) {
            if (index !== -1) slide.reveal_blocks.splice(index, 1);
          } else if (index === -1) {
            slide.reveal_blocks.push({ at, markdown });
          } else {
            slide.reveal_blocks[index] = { at, markdown };
          }
          recalculateSlideRevealSteps(slide);
          slide.reveal_blocks.sort((a, b) => a.at - b.at);
        }
      })
  );

  server.registerTool(
    "set_slide_narration",
    {
      title: "読み上げを一件編集",
      description:
        "指定stepの表示・読み上げ文を追加・置換します。textをnullにすると削除します。VOICEVOX profileと調声値も一件単位で指定できます。",
      inputSchema: {
        ...projectIdInput,
        slide_id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
        at: z.number().int().nonnegative().max(100),
        text: z.string().min(1).max(2_000).nullable(),
        display: z.enum(["dialogue", "commentary", "inline"]).optional(),
        speaker: z.string().max(80).nullable().optional(),
        audio_src: z.string().max(500).nullable().optional(),
        voice_profile_id:
          narrationSegmentSchema.shape.voice_profile_id.optional(),
        voice_tuning: narrationSegmentSchema.shape.voice_tuning.optional()
      },
      outputSchema: mutationOutput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async ({ project_id, expected_version, slide_id, at, text, display, speaker, ...voice }) =>
      executeMutation(db, getAuthProps, {
        projectId: project_id,
        expectedVersion: expected_version,
        changedKind: "slide_narration_updated",
        changedId: `${slide_id}:${at}`,
        mutate: (document) => {
          const slide = findSlide(document, slide_id);
          slide.narration ??= {
            display: display ?? "dialogue",
            speaker: speaker ?? null,
            segments: []
          };
          if (display !== undefined) slide.narration.display = display;
          if (speaker !== undefined) slide.narration.speaker = speaker;
          const index = slide.narration.segments.findIndex(
            (segment) => segment.at === at
          );
          if (text === null) {
            if (index !== -1) slide.narration.segments.splice(index, 1);
          } else {
            const previous = index === -1 ? null : slide.narration.segments[index];
            const segment = narrationSegmentSchema.parse({
              at,
              text,
              audio_src:
                voice.audio_src === undefined
                  ? (previous?.audio_src ?? null)
                  : voice.audio_src,
              voice_profile_id:
                voice.voice_profile_id === undefined
                  ? previous?.voice_profile_id
                  : voice.voice_profile_id,
              voice_tuning:
                voice.voice_tuning === undefined
                  ? previous?.voice_tuning
                  : voice.voice_tuning
            });
            if (index === -1) slide.narration.segments.push(segment);
            else slide.narration.segments[index] = segment;
          }
          slide.narration.segments.sort((a, b) => a.at - b.at);
          recalculateSlideRevealSteps(slide);
        }
      })
  );

  server.registerTool(
    "move_slide",
    {
      title: "スライドを移動",
      description: "一枚のスライドを0始まりの位置へ移動します。",
      inputSchema: {
        ...projectIdInput,
        slide_id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
        position: z.number().int().nonnegative().max(99)
      },
      outputSchema: mutationOutput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async ({ project_id, expected_version, slide_id, position }) =>
      executeMutation(db, getAuthProps, {
        projectId: project_id,
        expectedVersion: expected_version,
        changedKind: "slide_moved",
        changedId: slide_id,
        mutate: (document) => {
          const deck = requireDeck(document);
          const index = deck.slides.findIndex((slide) => slide.id === slide_id);
          if (index === -1) {
            throw new ProjectToolError("SLIDE_NOT_FOUND", "The slide does not exist.");
          }
          const [slide] = deck.slides.splice(index, 1);
          if (slide !== undefined) {
            deck.slides.splice(Math.min(position, deck.slides.length), 0, slide);
          }
        }
      })
  );

  server.registerTool(
    "delete_slide",
    {
      title: "スライドを一枚削除",
      description: "指定したスライドと、その中のreveal・読み上げを削除します。",
      inputSchema: {
        ...projectIdInput,
        slide_id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/)
      },
      outputSchema: mutationOutput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async ({ project_id, expected_version, slide_id }) =>
      executeMutation(db, getAuthProps, {
        projectId: project_id,
        expectedVersion: expected_version,
        changedKind: "slide_deleted",
        changedId: slide_id,
        mutate: (document) => {
          const deck = requireDeck(document);
          const index = deck.slides.findIndex((slide) => slide.id === slide_id);
          if (index === -1) {
            throw new ProjectToolError("SLIDE_NOT_FOUND", "The slide does not exist.");
          }
          deck.slides.splice(index, 1);
        }
      })
  );
}
