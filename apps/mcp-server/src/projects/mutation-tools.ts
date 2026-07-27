import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { recordAuditEvent } from "../auth/repository";
import { mutateProject } from "./repository";
import {
  narrationSegmentSchema,
  presentationTemplateSchema,
  projectSlideSchema,
  projectStageSchema,
  researchLogEntrySchema,
  voicevoxProfileSchema,
  type ProjectDocument,
  type ProjectRecord
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
          slide.reveal_steps = Math.max(
            ...slide.reveal_blocks.map((block) => block.at),
            ...(slide.narration?.segments.map((segment) => segment.at) ?? []),
            0
          );
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
          slide.reveal_steps = Math.max(
            ...slide.reveal_blocks.map((block) => block.at),
            ...slide.narration.segments.map((segment) => segment.at),
            0
          );
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
