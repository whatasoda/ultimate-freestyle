import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  VOICEVOX_ENGINE,
  ZUNDAMON_NORMAL_PROFILE
} from "@ultimate-freestyle/research-schema/voice-generation";
import {
  findVoicevoxCatalogProfile
} from "@ultimate-freestyle/research-schema/voicevox-catalog";
import { z } from "zod";

import { recordAuditEvent } from "../auth/repository";
import { mutateProject } from "./repository";
import {
  invalidateInheritedVoiceAudio,
  invalidateVoiceProfileAudio
} from "./voice-audio";
import {
  animationSchema,
  compositionRevealPositions,
  coverLayoutSchema,
  densitySchema,
  fontPresetSchema,
  loadingScreenSchema,
  motionStyleSchema,
  narrationAppearanceSchema,
  narrationDisplaySchema,
  narrationSegmentSchema,
  presentationTemplateSchema,
  presentationAspectRatioSchema,
  projectSlideSchema,
  projectStageSchema,
  researchLogEntrySchema,
  slideBlockFrameSchema,
  slideBlockStyleSchema,
  slideBlockSchema,
  slideRoleSchema,
  slideTypographyPresetSchema,
  slideTypographySchema,
  slideSceneNodeSchema,
  visualPresetSchema,
  type PresentationTemplate,
  type ProjectDocument,
  type ProjectRecord,
  type SlideSceneNode
} from "./schema";
import {
  normalizeProjectToolError,
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
  request_id: z.string(),
  version: z.number().nullable(),
  current_version: z.number().nullable(),
  error: z
    .object({ code: z.string(), message: z.string() })
    .nullable()
};

const templateMutableInput = {
  name: presentationTemplateSchema.shape.name.optional(),
  region_layout: presentationTemplateSchema.shape.region_layout.optional(),
  sidebar_width_percent:
    presentationTemplateSchema.shape.sidebar_width_percent.optional(),
  background: presentationTemplateSchema.shape.background.optional(),
  surface: presentationTemplateSchema.shape.surface.optional(),
  foreground: presentationTemplateSchema.shape.foreground.optional(),
  muted: presentationTemplateSchema.shape.muted.optional(),
  accent: presentationTemplateSchema.shape.accent.optional(),
  accent_secondary:
    presentationTemplateSchema.shape.accent_secondary.optional(),
  border: presentationTemplateSchema.shape.border.optional(),
  corner_radius_px:
    presentationTemplateSchema.shape.corner_radius_px.optional(),
  spacing_scale: presentationTemplateSchema.shape.spacing_scale.optional(),
  font_scale: presentationTemplateSchema.shape.font_scale.optional(),
  enter_animation:
    presentationTemplateSchema.shape.enter_animation.optional(),
  reveal_animation:
    presentationTemplateSchema.shape.reveal_animation.optional(),
  visual_preset: visualPresetSchema.optional(),
  body_font: fontPresetSchema.optional(),
  heading_font: fontPresetSchema.optional(),
  density: densitySchema.optional(),
  motion_style: motionStyleSchema.optional(),
  body_weight: presentationTemplateSchema.shape.body_weight,
  heading_weight: presentationTemplateSchema.shape.heading_weight,
  line_height: presentationTemplateSchema.shape.line_height,
  letter_spacing_em: presentationTemplateSchema.shape.letter_spacing_em
};
const templateMutableFieldSchema = z.enum([
  "name",
  "region_layout",
  "sidebar_width_percent",
  "background",
  "surface",
  "foreground",
  "muted",
  "accent",
  "accent_secondary",
  "border",
  "corner_radius_px",
  "spacing_scale",
  "font_scale",
  "enter_animation",
  "reveal_animation",
  "visual_preset",
  "body_font",
  "heading_font",
  "density",
  "motion_style",
  "body_weight",
  "heading_weight",
  "line_height",
  "letter_spacing_em"
]);
const slideBodyEditSchema = z.object({
  target: z.enum(["content", "sidebar"]),
  operation: z.enum(["replace", "replace_once", "append", "prepend", "clear"]),
  old_text: z.string().min(1).max(20_000).optional(),
  text: z.string().max(20_000).optional()
});
const researchTextEditSchema = z.object({
  target: z.enum(["summary", "question", "hypothesis", "method"]),
  operation: z.enum(["replace", "replace_once", "append", "prepend", "clear"]),
  old_text: z.string().min(1).max(2_000).optional(),
  text: z.string().max(2_000).optional()
});

export type VisualPreset = z.infer<typeof visualPresetSchema>;

export const TEMPLATE_PRESET_DEFAULTS: Record<
  VisualPreset,
  Omit<PresentationTemplate, "id" | "name">
> = {
  studio: {
    region_layout: "sidebar-right",
    sidebar_width_percent: 30,
    background: "#111827",
    surface: "#1f2937",
    foreground: "#f8fafc",
    muted: "#cbd5e1",
    accent: "#9d7bff",
    corner_radius_px: 18,
    spacing_scale: 1,
    font_scale: 1,
    enter_animation: "fade",
    reveal_animation: "rise",
    visual_preset: "studio",
    body_font: "system-sans",
    heading_font: "gothic",
    density: "comfortable",
    motion_style: "calm"
  },
  paper: {
    region_layout: "single",
    sidebar_width_percent: 28,
    background: "#f4efe3",
    surface: "#e8dfcf",
    foreground: "#241f1a",
    muted: "#625b50",
    accent: "#a34b35",
    corner_radius_px: 8,
    spacing_scale: 1.05,
    font_scale: 1,
    enter_animation: "fade",
    reveal_animation: "rise",
    visual_preset: "paper",
    body_font: "mincho",
    heading_font: "serif",
    density: "spacious",
    motion_style: "calm"
  },
  editorial: {
    region_layout: "sidebar-right",
    sidebar_width_percent: 34,
    background: "#f7f7f2",
    surface: "#151515",
    foreground: "#161616",
    muted: "#f2f2ed",
    accent: "#d33f2f",
    corner_radius_px: 0,
    spacing_scale: 1,
    font_scale: 1,
    enter_animation: "slide-left",
    reveal_animation: "wipe",
    visual_preset: "editorial",
    body_font: "gothic",
    heading_font: "display",
    density: "compact",
    motion_style: "snappy"
  },
  neon: {
    region_layout: "sidebar-right",
    sidebar_width_percent: 30,
    background: "#080a18",
    surface: "#11152c",
    foreground: "#f4f7ff",
    muted: "#a9b3d8",
    accent: "#36f1cd",
    corner_radius_px: 20,
    spacing_scale: 1,
    font_scale: 1,
    enter_animation: "blur",
    reveal_animation: "pop",
    visual_preset: "neon",
    body_font: "gothic",
    heading_font: "display",
    density: "comfortable",
    motion_style: "dramatic"
  },
  "retro-game": {
    region_layout: "sidebar-right",
    sidebar_width_percent: 32,
    background: "#151515",
    surface: "#252525",
    foreground: "#fff7d6",
    muted: "#b8d86f",
    accent: "#ffcf4a",
    corner_radius_px: 0,
    spacing_scale: 0.95,
    font_scale: 0.95,
    enter_animation: "slide-right",
    reveal_animation: "pop",
    visual_preset: "retro-game",
    body_font: "monospace",
    heading_font: "monospace",
    density: "compact",
    motion_style: "snappy"
  },
  "soft-pop": {
    region_layout: "sidebar-right",
    sidebar_width_percent: 28,
    background: "#fff5fa",
    surface: "#f5e5ff",
    foreground: "#3d294d",
    muted: "#725e80",
    accent: "#f05d9b",
    corner_radius_px: 28,
    spacing_scale: 1.1,
    font_scale: 1,
    enter_animation: "zoom",
    reveal_animation: "pop",
    visual_preset: "soft-pop",
    body_font: "rounded",
    heading_font: "rounded",
    density: "spacious",
    motion_style: "calm"
  },
  scientific: {
    region_layout: "sidebar-right",
    sidebar_width_percent: 30,
    background: "#f4f8fb",
    surface: "#e5eef4",
    foreground: "#142330",
    muted: "#536979",
    accent: "#087e8b",
    corner_radius_px: 10,
    spacing_scale: 1,
    font_scale: 0.95,
    enter_animation: "fade",
    reveal_animation: "wipe",
    visual_preset: "scientific",
    body_font: "system-sans",
    heading_font: "gothic",
    density: "compact",
    motion_style: "calm"
  },
  museum: {
    region_layout: "sidebar-right",
    sidebar_width_percent: 32,
    background: "#f4efe2",
    surface: "#18283d",
    foreground: "#1b293c",
    muted: "#f2e6ca",
    accent: "#a57b34",
    corner_radius_px: 2,
    spacing_scale: 1.1,
    font_scale: 1,
    enter_animation: "fade",
    reveal_animation: "rise",
    visual_preset: "museum",
    body_font: "mincho",
    heading_font: "serif",
    density: "spacious",
    motion_style: "calm"
  },
  terminal: {
    region_layout: "sidebar-right",
    sidebar_width_percent: 34,
    background: "#07110b",
    surface: "#0c1e13",
    foreground: "#d8ffe5",
    muted: "#8bc99d",
    accent: "#54f58a",
    corner_radius_px: 4,
    spacing_scale: 0.9,
    font_scale: 0.92,
    enter_animation: "slide-left",
    reveal_animation: "wipe",
    visual_preset: "terminal",
    body_font: "monospace",
    heading_font: "monospace",
    density: "compact",
    motion_style: "snappy"
  }
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
    return mutationSuccess(requestId, project);
  } catch (error) {
    const normalized = normalizeProjectToolError(error);
    return toolResult(
      {
        ok: false,
        request_id: requestId,
        version: null,
        current_version: normalized.currentVersion,
        error: { code: normalized.code, message: normalized.message }
      },
      true
    );
  }
}

function mutationSuccess(
  requestId: string,
  project: ProjectRecord
) {
  return toolResult({
    ok: true,
    request_id: requestId,
    version: project.version,
    current_version: null,
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

function findTemplate(document: ProjectDocument, templateId: string) {
  const template = requireDeck(document).templates?.find(
    (item) => item.id === templateId
  );
  if (template === undefined) {
    throw new ProjectToolError(
      "TEMPLATE_NOT_FOUND",
      "The presentation template does not exist."
    );
  }
  return template;
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

function parseSlideBlock(value: unknown) {
  const parsed = slideBlockSchema.safeParse(value);
  if (!parsed.success) {
    throw new ProjectToolError(
      "INVALID_FIELDS",
      parsed.error.issues[0]?.message ?? "The block field is invalid."
    );
  }
  return parsed.data;
}

function applySlideBodyEdit(
  currentValue: string | null,
  edit: z.infer<typeof slideBodyEditSchema>
): string | null {
  const current = currentValue ?? "";
  if (edit.operation === "clear") {
    if (edit.target === "content") {
      throw new ProjectToolError("INVALID_FIELDS", "Slide content cannot be empty.");
    }
    return null;
  }
  if (edit.text === undefined) {
    throw new ProjectToolError("INVALID_FIELDS", "text is required for this body edit.");
  }
  if (edit.operation === "replace") return edit.text;
  if (edit.operation === "append") return current + edit.text;
  if (edit.operation === "prepend") return edit.text + current;
  if (edit.old_text === undefined) {
    throw new ProjectToolError("INVALID_FIELDS", "old_text is required for replace_once.");
  }
  const first = current.indexOf(edit.old_text);
  const second = first === -1 ? -1 : current.indexOf(edit.old_text, first + edit.old_text.length);
  if (first === -1 || second !== -1) {
    throw new ProjectToolError(
      "INVALID_CHANGE",
      first === -1
        ? "old_text was not found in the selected slide body."
        : "old_text must match exactly once in the selected slide body."
    );
  }
  return current.slice(0, first) + edit.text + current.slice(first + edit.old_text.length);
}

function applyResearchTextEdit(
  currentValue: string | null,
  edit: z.infer<typeof researchTextEditSchema>
): string | null {
  const current = currentValue ?? "";
  if (edit.operation === "clear") return edit.target === "summary" ? "" : null;
  if (edit.text === undefined) {
    throw new ProjectToolError("INVALID_FIELDS", "text is required for this research text edit.");
  }
  let next: string;
  if (edit.operation === "replace") next = edit.text;
  else if (edit.operation === "append") next = current + edit.text;
  else if (edit.operation === "prepend") next = edit.text + current;
  else {
    if (edit.old_text === undefined) {
      throw new ProjectToolError("INVALID_FIELDS", "old_text is required for replace_once.");
    }
    const first = current.indexOf(edit.old_text);
    const second = first === -1 ? -1 : current.indexOf(edit.old_text, first + edit.old_text.length);
    if (first === -1 || second !== -1) {
      throw new ProjectToolError(
        "INVALID_CHANGE",
        first === -1
          ? "old_text was not found in the selected research field."
          : "old_text must match exactly once in the selected research field."
      );
    }
    next = current.slice(0, first) + edit.text + current.slice(first + edit.old_text.length);
  }
  const limit = { summary: 2_000, question: 2_000, hypothesis: 4_000, method: 20_000 }[edit.target];
  if (next.length > limit) {
    throw new ProjectToolError("INVALID_FIELDS", `The edited ${edit.target} exceeds ${limit} characters.`);
  }
  return next;
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

const sceneComponentKindSchema = z.enum([
  "layer",
  "stack",
  "grid",
  "hero",
  "markdown",
  "image",
  "shape",
  "card",
  "metric",
  "quote",
  "callout",
  "bar_chart",
  "timeline"
]);

const sceneComponentContentFieldSchema = z.enum([
  "direction",
  "gap_px",
  "align",
  "justify",
  "wrap",
  "columns",
  "eyebrow",
  "heading",
  "subtitle",
  "markdown",
  "asset_id",
  "alt_text",
  "fit",
  "caption",
  "shape",
  "label",
  "variant",
  "value",
  "unit",
  "emphasis",
  "quote",
  "attribution",
  "max_value"
]);

const sceneComponentScalarSchema = z.union([
  z.string().max(20_000),
  z.number().finite(),
  z.boolean(),
  z.null()
]);

const sceneDataItemFieldSchema = z.enum([
  "at",
  "label",
  "value",
  "color",
  "kicker",
  "heading",
  "detail"
]);

const SCENE_CONTENT_FIELDS: Record<SlideSceneNode["kind"], ReadonlySet<string>> = {
  layer: new Set(),
  stack: new Set(["direction", "gap_px", "align", "justify", "wrap"]),
  grid: new Set(["columns", "gap_px", "align"]),
  hero: new Set(["eyebrow", "heading", "subtitle", "align"]),
  markdown: new Set(["markdown"]),
  image: new Set(["asset_id", "alt_text", "fit", "caption"]),
  shape: new Set(["shape", "label"]),
  card: new Set(["label", "markdown", "variant"]),
  metric: new Set(["value", "unit", "caption", "emphasis"]),
  quote: new Set(["quote", "attribution"]),
  callout: new Set(["label", "heading", "markdown", "variant"]),
  bar_chart: new Set(["max_value"]),
  timeline: new Set()
};

function createSceneComponent(options: {
  id: string;
  kind: z.infer<typeof sceneComponentKindSchema>;
  parentId: string | null;
  order: number;
  at: number;
  animation: z.infer<typeof animationSchema>;
  frame?: z.infer<typeof slideBlockFrameSchema> | null;
  text?: string;
  assetId?: string;
}): SlideSceneNode {
  const base = {
    id: options.id,
    parent_id: options.parentId,
    order: options.order,
    at: options.at,
    animation: options.animation,
    frame: options.frame ?? null
  };
  const text = options.text?.trim();
  switch (options.kind) {
    case "layer":
      return { ...base, kind: "layer" };
    case "stack":
      return {
        ...base,
        kind: "stack",
        direction: "column",
        gap_px: 24,
        align: "stretch",
        justify: "start",
        wrap: false
      };
    case "grid":
      return { ...base, kind: "grid", columns: 2, gap_px: 24, align: "stretch" };
    case "hero":
      return {
        ...base,
        kind: "hero",
        eyebrow: null,
        heading: text || "見出し",
        subtitle: null,
        align: "start"
      };
    case "markdown":
      return { ...base, kind: "markdown", markdown: text || "本文" };
    case "image":
      if (options.assetId === undefined) {
        throw new ProjectToolError(
          "INVALID_CHANGE",
          "An image component requires asset_id."
        );
      }
      return {
        ...base,
        kind: "image",
        asset_id: options.assetId,
        alt_text: text || "画像",
        fit: "contain",
        caption: null
      };
    case "shape":
      return { ...base, kind: "shape", shape: "rectangle", label: text ?? null };
    case "card":
      return {
        ...base,
        kind: "card",
        label: null,
        markdown: text || "本文",
        variant: "plain"
      };
    case "metric":
      return {
        ...base,
        kind: "metric",
        value: text || "0",
        unit: null,
        caption: "指標",
        emphasis: "normal"
      };
    case "quote":
      return { ...base, kind: "quote", quote: text || "引用", attribution: null };
    case "callout":
      return {
        ...base,
        kind: "callout",
        label: null,
        heading: text || "ポイント",
        markdown: null,
        variant: "info"
      };
    case "bar_chart":
      return {
        ...base,
        kind: "bar_chart",
        max_value: 100,
        items: [{ id: "item-1", at: options.at, label: "項目", value: 0, color: null }]
      };
    case "timeline":
      return {
        ...base,
        kind: "timeline",
        items: [{ id: "item-1", at: options.at, kicker: null, heading: text || "出来事", detail: null }]
      };
  }
}

function updateSceneComponentContent(
  component: SlideSceneNode,
  field: z.infer<typeof sceneComponentContentFieldSchema>,
  value: z.infer<typeof sceneComponentScalarSchema>
): SlideSceneNode {
  if (!SCENE_CONTENT_FIELDS[component.kind].has(field)) {
    throw new ProjectToolError(
      "INVALID_CHANGE",
      `The ${field} field is not available for ${component.kind}.`
    );
  }
  const parsed = slideSceneNodeSchema.safeParse({ ...component, [field]: value });
  if (!parsed.success) {
    throw new ProjectToolError(
      "INVALID_CHANGE",
      parsed.error.issues[0]?.message ?? "The component value is invalid."
    );
  }
  return parsed.data;
}

function findSceneComponent(
  document: ProjectDocument,
  slideId: string,
  componentId: string
): SlideSceneNode {
  const slide = findSlide(document, slideId);
  if (slide.composition?.mode !== "scene") {
    throw new ProjectToolError(
      "INVALID_COMPOSITION_MODE",
      "This slide does not use a component scene."
    );
  }
  const component = slide.composition.nodes.find(
    (node) => node.id === componentId
  );
  if (component === undefined) {
    throw new ProjectToolError(
      "COMPONENT_NOT_FOUND",
      "The slide component does not exist."
    );
  }
  return component;
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
        "題名・段階または研究本文の最大2か所だけを変更します。本文はtext_editsのreplace_onceで現在のold_textを一度だけ置換し、長文全体を送り直しません。追記・前置・消去も選べます。",
      inputSchema: {
        ...projectIdInput,
        stage: projectStageSchema.optional(),
        title: z.string().min(1).max(120).optional(),
        text_edits: z.array(researchTextEditSchema).min(1).max(2).optional()
      },
      outputSchema: mutationOutput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async ({ project_id, expected_version, stage, title, text_edits }) => {
      if (stage === undefined && title === undefined && text_edits === undefined) {
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
        changedId: [stage === undefined ? "" : "stage", title === undefined ? "" : "title", ...(text_edits?.map((edit) => edit.target) ?? [])].filter(Boolean).sort().join(","),
        mutate: (document) => {
          if (stage !== undefined) document.stage = stage;
          if (title !== undefined) document.title = title;
          for (const edit of text_edits ?? []) {
            const next = applyResearchTextEdit(document[edit.target], edit);
            if (edit.target === "summary") document.summary = next ?? "";
            else if (edit.target === "question") document.question = next;
            else if (edit.target === "hypothesis") document.hypothesis = next;
            else document.method = next;
          }
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
        aspect_ratio: presentationAspectRatioSchema.optional(),
        loading_screen: loadingScreenSchema.partial().optional(),
        narration: z.object({
          enabled: z.boolean().optional(),
          display: narrationDisplaySchema.optional(),
          speaker: z.string().max(80).nullable().optional(),
          credit: z.string().max(500).nullable().optional(),
          appearance: narrationAppearanceSchema.nullable().optional()
        }).optional(),
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
    async ({ project_id, expected_version, loading_screen, narration, ...fields }) =>
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
            aspect_ratio: "16:9",
            loading_screen: {
              enabled: true,
              style: "pulse",
              message: "発表の準備をしています",
              show_progress: true,
              minimum_duration_ms: 500
            },
            narration_defaults: null,
            templates: [],
            default_template_id: null,
            slides: []
          };
          Object.assign(document.deck, fields);
          if (loading_screen !== undefined) {
            document.deck.loading_screen = {
              enabled: true,
              style: "pulse",
              message: "発表の準備をしています",
              show_progress: true,
              minimum_duration_ms: 500,
              ...(document.deck.loading_screen ?? {}),
              ...loading_screen
            };
          }
          if (narration?.enabled === false) {
            document.deck.narration_defaults = null;
          } else if (narration !== undefined) {
            document.deck.narration_defaults ??= {
              display: narration.display ?? "commentary",
              speaker: narration.speaker ?? null,
              credit: narration.credit ?? null
            };
            if (narration.display !== undefined) document.deck.narration_defaults.display = narration.display;
            if (narration.speaker !== undefined) document.deck.narration_defaults.speaker = narration.speaker;
            if (narration.credit !== undefined) document.deck.narration_defaults.credit = narration.credit;
            if (narration.appearance === null) {
              delete document.deck.narration_defaults.appearance;
            } else if (narration.appearance !== undefined) {
              document.deck.narration_defaults.appearance = {
                ...(document.deck.narration_defaults.appearance ?? {}),
                ...narration.appearance
              };
            }
          }
        }
      })
  );

  server.registerTool(
    "create_presentation_template",
    {
      title: "presetから発表テンプレートを作成",
      description:
        "安全なvisual presetからtemplateを一件作ります。作成後は部分更新toolで必要な項目だけ調整します。",
      inputSchema: {
        ...projectIdInput,
        template_id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
        name: z.string().min(1).max(80),
        visual_preset: visualPresetSchema,
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
    async ({ project_id, expected_version, template_id, name, visual_preset, make_default }) =>
      executeMutation(db, getAuthProps, {
        projectId: project_id,
        expectedVersion: expected_version,
        changedKind: "template_created",
        changedId: template_id,
        mutate: (document) => {
          const deck = requireDeck(document);
          deck.templates ??= [];
          if (deck.templates.some((template) => template.id === template_id)) {
            throw new ProjectToolError(
              "INVALID_CHANGE",
              "A presentation template with this ID already exists."
            );
          }
          deck.templates.push(
            presentationTemplateSchema.parse({
              id: template_id,
              name,
              ...TEMPLATE_PRESET_DEFAULTS[visual_preset]
            })
          );
          if (make_default === true) deck.default_template_id = template_id;
        }
      })
  );

  server.registerTool(
    "update_presentation_template_fields",
    {
      title: "発表テンプレートを部分更新",
      description:
        "指定templateの色、配置、font、密度、動きなど、指定した項目だけを更新します。",
      inputSchema: {
        ...projectIdInput,
        template_id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
        updates: z
          .array(
            z.object({
              field: templateMutableFieldSchema,
              value: z.union([z.string().max(120), z.number()])
            })
          )
          .min(1)
          .max(8)
      },
      outputSchema: mutationOutput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async ({ project_id, expected_version, template_id, updates }) =>
      executeMutation(db, getAuthProps, {
        projectId: project_id,
        expectedVersion: expected_version,
        changedKind: "template_fields_updated",
        changedId: template_id,
        mutate: (document) => {
          const fields: Record<string, unknown> = {};
          for (const update of updates) {
            if (update.field in fields) {
              throw new ProjectToolError(
                "INVALID_FIELDS",
                `The ${update.field} field appears more than once.`
              );
            }
            const schema = templateMutableInput[update.field];
            const parsed = schema.safeParse(update.value);
            if (!parsed.success) {
              throw new ProjectToolError(
                "INVALID_FIELDS",
                parsed.error.issues[0]?.message ?? `The ${update.field} field is invalid.`
              );
            }
            fields[update.field] = parsed.data;
          }
          Object.assign(findTemplate(document, template_id), fields);
        }
      })
  );

  server.registerTool(
    "set_voicevox_profile",
    {
      title: "VOICEVOXカタログから音声profileを設定",
      description:
        "research://guide/voicevox-catalogで選んだ声をprofileとして保存します。話者UUIDやstyle IDを手入力する必要はありません。",
      inputSchema: {
        ...projectIdInput,
        catalog_profile_id: z.string().regex(/^voicevox-style-[0-9]+$/),
        profile_id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/).optional(),
        label: z.string().min(1).max(80).optional(),
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
    async ({
      project_id,
      expected_version,
      catalog_profile_id,
      profile_id,
      label,
      make_default
    }) =>
      executeMutation(db, getAuthProps, {
        projectId: project_id,
        expectedVersion: expected_version,
        changedKind: "voicevox_profile_set",
        changedId: profile_id ?? catalog_profile_id,
        mutate: (document) => {
          const deck = requireDeck(document);
          const previousDefaultProfileId = deck.voicevox?.default_profile_id ?? null;
          const catalogProfile = findVoicevoxCatalogProfile(catalog_profile_id);
          if (catalogProfile === undefined) {
            throw new ProjectToolError(
              "INVALID_CHANGE",
              "The VOICEVOX catalog profile does not exist."
            );
          }
          const profile = {
            id: profile_id ?? catalogProfile.id,
            label: label ?? catalogProfile.label,
            speaker_uuid: catalogProfile.speakerUuid,
            speaker_name: catalogProfile.speakerName,
            style_id: catalogProfile.styleId,
            style_name: catalogProfile.styleName,
            tuning:
              catalogProfile.styleId === ZUNDAMON_NORMAL_PROFILE.styleId
                ? { ...ZUNDAMON_NORMAL_PROFILE.tuning }
                : null
          };
          deck.voicevox ??= {
            catalog_revision: VOICEVOX_ENGINE.catalogRevision,
            default_profile_id: profile.id,
            profiles: []
          };
          deck.voicevox.catalog_revision = VOICEVOX_ENGINE.catalogRevision;
          const index = deck.voicevox.profiles.findIndex(
            (item) => item.id === profile.id
          );
          if (index === -1) deck.voicevox.profiles.push(profile);
          else {
            deck.voicevox.profiles[index] = profile;
            invalidateVoiceProfileAudio(document, profile.id);
          }
          if (make_default === true || deck.voicevox.profiles.length === 1) {
            deck.voicevox.default_profile_id = profile.id;
            if (previousDefaultProfileId !== profile.id) {
              invalidateInheritedVoiceAudio(document);
            }
          }
        }
      })
  );

  server.registerTool(
    "update_voicevox_profile_tuning",
    {
      title: "VOICEVOX profileの調声値を部分更新",
      description:
        "指定profileの調声値だけを更新します。tuning=nullでprofile固有の調声を解除します。関連する生成済み音声は無効化されます。",
      inputSchema: {
        ...projectIdInput,
        profile_id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
        tuning: narrationSegmentSchema.shape.voice_tuning.unwrap()
      },
      outputSchema: mutationOutput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async ({ project_id, expected_version, profile_id, tuning }) =>
      executeMutation(db, getAuthProps, {
        projectId: project_id,
        expectedVersion: expected_version,
        changedKind: "voicevox_profile_tuning_updated",
        changedId: profile_id,
        mutate: (document) => {
          const settings = requireDeck(document).voicevox;
          const profile = settings?.profiles.find(
            (item) => item.id === profile_id
          );
          if (profile === undefined) {
            throw new ProjectToolError(
              "INVALID_CHANGE",
              "The VOICEVOX profile does not exist."
            );
          }
          profile.tuning =
            tuning === null
              ? null
              : { ...(profile.tuning ?? {}), ...tuning };
          invalidateVoiceProfileAudio(document, profile_id);
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
            role: "content",
            cover_layout: "center",
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
        "指定したスライドの基本項目と本文・補足を部分更新します。body_editsのreplace_onceはold_textが一度だけ一致する場合に安全に置換します。revealと読み上げは別toolです。",
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
        enter_animation: animationSchema.nullable().optional(),
        role: slideRoleSchema.optional(),
        cover_layout: coverLayoutSchema.optional(),
        body_edits: z.array(slideBodyEditSchema).min(1).max(2).optional()
      },
      outputSchema: mutationOutput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async ({ project_id, expected_version, slide_id, body_edits, ...fields }) =>
      executeMutation(db, getAuthProps, {
        projectId: project_id,
        expectedVersion: expected_version,
        changedKind: "slide_fields_updated",
        changedId: slide_id,
        mutate: (document) => {
          if (
            body_edits === undefined &&
            Object.values(fields).every((value) => value === undefined)
          ) {
            throw new ProjectToolError(
              "INVALID_CHANGE",
              "At least one slide field must be supplied."
            );
          }
          const slide = findSlide(document, slide_id);
          Object.assign(slide, fields);
          const editedTargets = new Set<string>();
          for (const edit of body_edits ?? []) {
            if (editedTargets.has(edit.target)) {
              throw new ProjectToolError(
                "INVALID_FIELDS",
                `The ${edit.target} body appears more than once.`
              );
            }
            editedTargets.add(edit.target);
            const next = applySlideBodyEdit(
              edit.target === "content"
                ? slide.content_markdown
                : slide.sidebar_markdown ?? null,
              edit
            );
            const parsed = edit.target === "content"
              ? z.string().min(1).max(20_000).safeParse(next)
              : z.string().max(10_000).nullable().safeParse(next);
            if (!parsed.success) {
              throw new ProjectToolError(
                "INVALID_FIELDS",
                parsed.error.issues[0]?.message ?? "The edited slide body is invalid."
              );
            }
            if (edit.target === "content") slide.content_markdown = parsed.data as string;
            else slide.sidebar_markdown = parsed.data;
          }
        }
      })
  );

  server.registerTool(
    "update_slide_typography",
    {
      title: "一枚の文章レイアウトを調整",
      description:
        "定型flowの組版preset、段数、本文と見出しの倍率、行間、段落間隔、揃えを部分更新します。文章主体の一枚はarticle、columns、denseを使います。",
      inputSchema: {
        ...projectIdInput,
        slide_id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
        preset: slideTypographyPresetSchema.optional(),
        columns: z.number().int().min(1).max(3).nullable().optional(),
        body_scale: z.number().min(0.5).max(1.4).multipleOf(0.05).nullable().optional(),
        heading_scale: z.number().min(0.5).max(1.5).multipleOf(0.05).nullable().optional(),
        line_height: z.number().min(1).max(2).multipleOf(0.05).nullable().optional(),
        paragraph_spacing_em: z.number().min(0).max(2).multipleOf(0.05).nullable().optional(),
        column_gap_em: z.number().min(0.5).max(5).multipleOf(0.1).nullable().optional(),
        text_align: z.enum(["start", "center"]).nullable().optional(),
        vertical_align: z.enum(["start", "center"]).nullable().optional(),
        reset_overrides: z.boolean().optional()
      },
      outputSchema: mutationOutput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async ({ project_id, expected_version, slide_id, reset_overrides, ...fields }) =>
      executeMutation(db, getAuthProps, {
        projectId: project_id,
        expectedVersion: expected_version,
        changedKind: "slide_typography_updated",
        changedId: slide_id,
        mutate: (document) => {
          if (
            !reset_overrides &&
            Object.values(fields).every((value) => value === undefined)
          ) {
            throw new ProjectToolError(
              "INVALID_CHANGE",
              "At least one typography field must be supplied."
            );
          }
          const slide = findSlide(document, slide_id);
          const preset = fields.preset ?? slide.typography?.preset ?? "standard";
          if (reset_overrides) {
            slide.typography = slideTypographySchema.parse({ preset });
            return;
          }
          const typography: Record<string, unknown> = {
            ...(slide.typography ?? { preset }),
            preset
          };
          for (const [key, value] of Object.entries(fields)) {
            if (value === undefined || key === "preset") continue;
            if (value === null) delete typography[key];
            else typography[key] = value;
          }
          slide.typography = slideTypographySchema.parse(typography);
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
    "edit_slide_block",
    {
      title: "自由配置blockを個別編集",
      description:
        "canvasのblockを安全な既定配置で一件作成するか、内容・座標・見た目の一項目だけを更新します。createのvalueはmarkdown本文、画像asset UUID、または図形labelです。更新前は対象element resourceを読んでください。",
      inputSchema: {
        ...projectIdInput,
        slide_id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
        action: z.enum(["create", "update_field"]),
        block_id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
        kind: z.enum(["markdown", "image", "shape"]).optional(),
        field: z
          .enum([
            "markdown",
            "asset_id",
            "alt_text",
            "fit",
            "shape",
            "label",
            "x",
            "y",
            "width",
            "height",
            "z_index",
            "at",
            "animation",
            "background",
            "foreground",
            "border_color",
            "border_width_px",
            "corner_radius_px",
            "padding_px",
            "opacity",
            "text_align",
            "vertical_align",
            "font_scale",
            "shadow"
          ])
          .optional(),
        value: z.union([z.string().max(20_000), z.number(), z.null()]).optional()
      },
      outputSchema: mutationOutput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async ({ project_id, expected_version, slide_id, action, block_id, kind, field, value }) =>
      executeMutation(db, getAuthProps, {
        projectId: project_id,
        expectedVersion: expected_version,
        changedKind:
          action === "create" ? "slide_block_created" : "slide_block_field_updated",
        changedId: `${slide_id}:${block_id}`,
        mutate: (document) => {
          const slide = findSlide(document, slide_id);
          if (slide.composition?.mode === "scene") {
            throw new ProjectToolError(
              "INVALID_COMPOSITION_MODE",
              "This slide uses a component scene. Use create_slide_component and the component update tools."
            );
          }
          slide.composition ??= {
            mode: "canvas",
            background: "#111827",
            clip_content: true,
            blocks: []
          };
          const index = slide.composition.blocks.findIndex(
            (item) => item.id === block_id
          );
          if (action === "create") {
            if (index !== -1) {
              throw new ProjectToolError(
                "BLOCK_EXISTS",
                "The block already exists. Use update_field."
              );
            }
            if (kind === undefined) {
              throw new ProjectToolError("INVALID_FIELDS", "kind is required for create.");
            }
            const base = {
              id: block_id,
              frame: { x: 10, y: 10, width: 80, height: 25 },
              z_index: Math.min(
                100,
                slide.composition.blocks.reduce(
                  (highest, item) => Math.max(highest, item.z_index + 1),
                  0
                )
              ),
              at: 0,
              animation: "fade" as const
            };
            const block = kind === "markdown"
              ? parseSlideBlock({
                  ...base,
                  kind,
                  markdown:
                    typeof value === "string" && value.trim().length > 0
                      ? value
                      : "# 新しいテキスト"
                })
              : kind === "image"
                ? parseSlideBlock({
                    ...base,
                    kind,
                    asset_id: value,
                    alt_text: "",
                    fit: "contain"
                  })
                : parseSlideBlock({
                    ...base,
                    kind,
                    shape: "rectangle",
                    label: typeof value === "string" ? value : null
                  });
            slide.composition.blocks.push(block);
          } else {
            if (index === -1) {
              throw new ProjectToolError("BLOCK_NOT_FOUND", "The block does not exist.");
            }
            if (field === undefined || value === undefined) {
              throw new ProjectToolError(
                "INVALID_FIELDS",
                "field and value are required for update_field."
              );
            }
            const current = slide.composition.blocks[index];
            const contentFields: Record<typeof current.kind, string[]> = {
              markdown: ["markdown"],
              image: ["asset_id", "alt_text", "fit"],
              shape: ["shape", "label"]
            };
            const contentField = [
              "markdown",
              "asset_id",
              "alt_text",
              "fit",
              "shape",
              "label"
            ].includes(field);
            if (contentField && !contentFields[current.kind].includes(field)) {
              throw new ProjectToolError(
                "INVALID_FIELDS",
                `The ${field} field cannot be used with a ${current.kind} block.`
              );
            }
            const candidate = JSON.parse(JSON.stringify(current)) as Record<string, unknown>;
            if (["x", "y", "width", "height"].includes(field)) {
              const frame = candidate.frame as Record<string, unknown>;
              frame[field] = value;
            } else if (
              [
                "background",
                "foreground",
                "border_color",
                "border_width_px",
                "corner_radius_px",
                "padding_px",
                "opacity",
                "text_align",
                "vertical_align",
                "font_scale",
                "shadow"
              ].includes(field)
            ) {
              const style = (candidate.style ?? {}) as Record<string, unknown>;
              if (value === null) delete style[field];
              else style[field] = value;
              candidate.style = style;
            } else {
              candidate[field] = value;
            }
            slide.composition.blocks[index] = parseSlideBlock(candidate);
          }
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
    "create_slide_component",
    {
      title: "scene componentを既定値から作成",
      description:
        "kindと配置だけで一件を作成します。文章kindはinitial_text、imageはasset_idを指定し、詳細は部分更新します。",
      inputSchema: {
        ...projectIdInput,
        slide_id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
        component_id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
        kind: sceneComponentKindSchema,
        parent_id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/).nullable(),
        order: z.number().int().min(0).max(999).default(0),
        at: z.number().int().nonnegative().max(100).default(0),
        animation: animationSchema.default("none"),
        frame: slideBlockFrameSchema.nullable().optional(),
        initial_text: z.string().max(20_000).optional(),
        asset_id: z.string().uuid().optional()
      },
      outputSchema: mutationOutput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async ({
      project_id,
      expected_version,
      slide_id,
      component_id,
      kind,
      parent_id,
      order,
      at,
      animation,
      frame,
      initial_text,
      asset_id
    }) =>
      executeMutation(db, getAuthProps, {
        projectId: project_id,
        expectedVersion: expected_version,
        changedKind: "slide_component_created",
        changedId: `${slide_id}:${component_id}`,
        mutate: (document) => {
          const slide = findSlide(document, slide_id);
          if (
            slide.composition?.mode === "scene" &&
            slide.composition.nodes.some((node) => node.id === component_id)
          ) {
            throw new ProjectToolError(
              "INVALID_CHANGE",
              "The slide component already exists."
            );
          }
          upsertSceneComponent(
            document,
            slide_id,
            createSceneComponent({
              id: component_id,
              kind,
              parentId: parent_id,
              order,
              at,
              animation,
              frame,
              text: initial_text,
              assetId: asset_id
            })
          );
        }
      })
  );

  server.registerTool(
    "update_slide_component_content",
    {
      title: "scene componentの内容を一項目更新",
      description:
        "本文、数値、表示variant、layout固有値など一項目だけを更新します。配置と共通styleはupdate_slide_componentを使います。",
      inputSchema: {
        ...projectIdInput,
        slide_id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
        component_id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
        field: sceneComponentContentFieldSchema,
        value: sceneComponentScalarSchema
      },
      outputSchema: mutationOutput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async ({ project_id, expected_version, slide_id, component_id, field, value }) =>
      executeMutation(db, getAuthProps, {
        projectId: project_id,
        expectedVersion: expected_version,
        changedKind: "slide_component_content_updated",
        changedId: `${slide_id}:${component_id}:${field}`,
        mutate: (document) => {
          const slide = findSlide(document, slide_id);
          const component = findSceneComponent(document, slide_id, component_id);
          const parsed = updateSceneComponentContent(component, field, value);
          if (slide.composition?.mode !== "scene") return;
          const index = slide.composition.nodes.findIndex(
            (node) => node.id === component_id
          );
          slide.composition.nodes[index] = parsed;
          recalculateSlideRevealSteps(slide);
        }
      })
  );

  server.registerTool(
    "edit_slide_data_item",
    {
      title: "グラフ・タイムラインの項目を一件編集",
      description:
        "bar_chartまたはtimelineのitemを追加、部分更新、移動、削除します。after_idがnullなら先頭、未指定なら末尾です。",
      inputSchema: {
        ...projectIdInput,
        slide_id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
        component_id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
        action: z.enum(["add", "update", "move", "delete"]),
        item_id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
        after_id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/).nullable().optional(),
        field: sceneDataItemFieldSchema.optional(),
        value: sceneComponentScalarSchema.optional()
      },
      outputSchema: mutationOutput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async ({
      project_id,
      expected_version,
      slide_id,
      component_id,
      action,
      item_id,
      after_id,
      field,
      value
    }) =>
      executeMutation(db, getAuthProps, {
        projectId: project_id,
        expectedVersion: expected_version,
        changedKind: `slide_data_item_${action}`,
        changedId: `${slide_id}:${component_id}:${item_id}`,
        mutate: (document) => {
          const slide = findSlide(document, slide_id);
          const component = findSceneComponent(document, slide_id, component_id);
          if (component.kind !== "bar_chart" && component.kind !== "timeline") {
            throw new ProjectToolError(
              "INVALID_CHANGE",
              "Only bar_chart and timeline components have data items."
            );
          }
          const items = [...component.items];
          const itemIndex = items.findIndex((item) => item.id === item_id);
          const hasField = field !== undefined;
          const hasValue = value !== undefined;
          if ((hasField && !hasValue) || (!hasField && hasValue)) {
            throw new ProjectToolError(
              "INVALID_CHANGE",
              "Specify field and value together."
            );
          }
          if ((action === "move" || action === "delete") && (hasField || hasValue)) {
            throw new ProjectToolError(
              "INVALID_CHANGE",
              "Move and delete do not accept field or value."
            );
          }
          if (action === "add") {
            if (itemIndex !== -1 || items.length >= 12) {
              throw new ProjectToolError(
                "INVALID_CHANGE",
                itemIndex !== -1
                  ? "The data item already exists."
                  : "A data component can contain at most 12 items."
              );
            }
            const created = component.kind === "bar_chart"
              ? { id: item_id, at: component.at, label: "項目", value: 0, color: null }
              : { id: item_id, at: component.at, kicker: null, heading: "出来事", detail: null };
            items.push(created);
          } else if (itemIndex === -1) {
            throw new ProjectToolError(
              "INVALID_CHANGE",
              "The data item does not exist."
            );
          } else if (action === "delete") {
            if (items.length === 1) {
              throw new ProjectToolError(
                "INVALID_CHANGE",
                "A data component must keep at least one item."
              );
            }
            items.splice(itemIndex, 1);
          }
          if ((action === "add" || action === "update") && field !== undefined) {
            const allowed = component.kind === "bar_chart"
              ? new Set(["at", "label", "value", "color"])
              : new Set(["at", "kicker", "heading", "detail"]);
            if (!allowed.has(field)) {
              throw new ProjectToolError(
                "INVALID_CHANGE",
                `The ${field} field is not available for ${component.kind} items.`
              );
            }
            const targetIndex = items.findIndex((item) => item.id === item_id);
            items[targetIndex] = { ...items[targetIndex], [field]: value };
          } else if (action === "update") {
            throw new ProjectToolError(
              "INVALID_CHANGE",
              "Update requires field and value."
            );
          }
          if (action === "move" || (action === "add" && after_id !== undefined)) {
            if (after_id === item_id) {
              throw new ProjectToolError("INVALID_CHANGE", "An item cannot follow itself.");
            }
            const sourceIndex = items.findIndex((item) => item.id === item_id);
            const [moved] = items.splice(sourceIndex, 1);
            if (moved === undefined) {
              throw new ProjectToolError("INVALID_CHANGE", "The data item does not exist.");
            }
            let destinationIndex = items.length;
            if (after_id === null) destinationIndex = 0;
            else if (after_id !== undefined) {
              const afterIndex = items.findIndex((item) => item.id === after_id);
              if (afterIndex === -1) {
                throw new ProjectToolError(
                  "INVALID_CHANGE",
                  "The after_id item does not exist."
                );
              }
              destinationIndex = afterIndex + 1;
            }
            items.splice(destinationIndex, 0, moved);
          }
          const parsed = slideSceneNodeSchema.safeParse({ ...component, items });
          if (!parsed.success) {
            throw new ProjectToolError(
              "INVALID_CHANGE",
              parsed.error.issues[0]?.message ?? "The data item value is invalid."
            );
          }
          if (slide.composition?.mode !== "scene") return;
          const componentIndex = slide.composition.nodes.findIndex(
            (node) => node.id === component_id
          );
          slide.composition.nodes[componentIndex] = parsed.data;
          recalculateSlideRevealSteps(slide);
        }
      })
  );

  server.registerTool(
    "update_slide_component",
    {
      title: "scene componentを部分更新",
      description:
        "既存componentの配置または見た目だけを変更します。本文を送り直す必要はありません。layoutとstyleはどちらか一方だけでも指定できます。",
      inputSchema: {
        ...projectIdInput,
        slide_id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
        component_id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
        layout: z.object({
          parent_id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/).nullable().optional(),
          order: z.number().int().min(0).max(999).optional(),
          at: z.number().int().nonnegative().max(100).optional(),
          animation: animationSchema.optional(),
          frame: slideBlockFrameSchema.nullable().optional()
        }).optional(),
        style: slideBlockStyleSchema.optional(),
        replace_style: z.boolean().optional()
      },
      outputSchema: mutationOutput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async ({ project_id, expected_version, slide_id, component_id, layout, style, replace_style }) =>
      executeMutation(db, getAuthProps, {
        projectId: project_id,
        expectedVersion: expected_version,
        changedKind: "slide_component_updated",
        changedId: `${slide_id}:${component_id}`,
        mutate: (document) => {
          if (layout === undefined && style === undefined) {
            throw new ProjectToolError(
              "INVALID_CHANGE",
              "Specify layout, style, or both."
            );
          }
          const component = findSceneComponent(document, slide_id, component_id);
          if (layout?.parent_id !== undefined) component.parent_id = layout.parent_id;
          if (layout?.order !== undefined) component.order = layout.order;
          if (layout?.at !== undefined) component.at = layout.at;
          if (layout?.animation !== undefined) component.animation = layout.animation;
          if (layout?.frame !== undefined) component.frame = layout.frame;
          if (style !== undefined) {
            component.style = replace_style ? style : { ...component.style, ...style };
          }
          const slide = findSlide(document, slide_id);
          if (slide.composition?.mode === "scene") {
            slide.composition.nodes.sort(
              (left, right) => left.order - right.order || left.id.localeCompare(right.id)
            );
          }
          recalculateSlideRevealSteps(slide);
        }
      })
  );

  server.registerTool(
    "delete_slide_component",
    {
      title: "scene componentを削除",
      description:
        "子を持たないcomponentを一件削除します。子がある場合は先に子を削除または移動してください。",
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
          if (slide.composition.nodes.some((node) => node.parent_id === component_id)) {
            throw new ProjectToolError(
              "COMPONENT_HAS_CHILDREN",
              "Delete or move child components before deleting their parent."
            );
          }
          slide.composition.nodes = slide.composition.nodes.filter(
            (node) => node.id !== component_id
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
    "configure_slide_narration",
    {
      title: "一枚の読み上げ表示を設定",
      description:
        "読み上げ本文を再送せず、表示方式、共通話者、枠の外観だけを部分更新します。appearance=nullでslide固有の外観を解除します。",
      inputSchema: {
        ...projectIdInput,
        slide_id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
        display: narrationDisplaySchema.optional(),
        speaker: z.string().max(80).nullable().optional(),
        appearance: narrationAppearanceSchema.nullable().optional()
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
        changedKind: "slide_narration_configured",
        changedId: slide_id,
        mutate: (document) => {
          if (Object.values(fields).every((value) => value === undefined)) {
            throw new ProjectToolError(
              "INVALID_CHANGE",
              "At least one slide narration setting must be supplied."
            );
          }
          const deck = requireDeck(document);
          const slide = findSlide(document, slide_id);
          slide.narration ??= {
            display:
              fields.display ??
              deck.narration_defaults?.display ??
              "commentary",
            speaker:
              fields.speaker === undefined
                ? (deck.narration_defaults?.speaker ?? null)
                : fields.speaker,
            segments: []
          };
          if (fields.display !== undefined) {
            slide.narration.display = fields.display;
          }
          if (fields.speaker !== undefined) {
            slide.narration.speaker = fields.speaker;
          }
          if (fields.appearance === null) {
            delete slide.narration.appearance;
          } else if (fields.appearance !== undefined) {
            slide.narration.appearance = {
              ...(slide.narration.appearance ?? {}),
              ...fields.appearance
            };
          }
        }
      })
  );

  server.registerTool(
    "update_slide_narration_voice",
    {
      title: "読み上げsegmentの音声設定を部分更新",
      description:
        "本文を再送せず、指定stepの話者表示、VOICEVOX profile、調声値だけを更新します。音声設定を変えると生成済み音声は無効化されます。",
      inputSchema: {
        ...projectIdInput,
        slide_id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
        at: z.number().int().nonnegative().max(100),
        speaker: narrationSegmentSchema.shape.speaker.optional(),
        voice_profile_id:
          narrationSegmentSchema.shape.voice_profile_id.optional(),
        voice_tuning: narrationSegmentSchema.shape.voice_tuning.optional()
      },
      outputSchema: mutationOutput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async ({ project_id, expected_version, slide_id, at, ...fields }) =>
      executeMutation(db, getAuthProps, {
        projectId: project_id,
        expectedVersion: expected_version,
        changedKind: "slide_narration_voice_updated",
        changedId: `${slide_id}:${at}`,
        mutate: (document) => {
          if (Object.values(fields).every((value) => value === undefined)) {
            throw new ProjectToolError(
              "INVALID_CHANGE",
              "At least one segment voice setting must be supplied."
            );
          }
          const segment = findSlide(document, slide_id).narration?.segments.find(
            (item) => item.at === at
          );
          if (segment === undefined) {
            throw new ProjectToolError(
              "INVALID_CHANGE",
              "The narration segment does not exist."
            );
          }
          if (fields.speaker !== undefined) segment.speaker = fields.speaker;
          if (fields.voice_profile_id !== undefined) {
            segment.voice_profile_id = fields.voice_profile_id;
            segment.audio_src = null;
          }
          if (fields.voice_tuning !== undefined) {
            segment.voice_tuning =
              fields.voice_tuning === null
                ? null
                : {
                    ...(segment.voice_tuning ?? {}),
                    ...fields.voice_tuning
                  };
            segment.audio_src = null;
          }
        }
      })
  );

  server.registerTool(
    "set_slide_narration",
    {
      title: "読み上げを一件編集",
      description:
        "指定stepの表示・読み上げ文だけを追加・置換します。textをnullにすると削除します。表示枠と音声設定は専用toolで更新します。",
      inputSchema: {
        ...projectIdInput,
        slide_id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
        at: z.number().int().nonnegative().max(100),
        text: z.string().min(1).max(2_000).nullable()
      },
      outputSchema: mutationOutput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async ({ project_id, expected_version, slide_id, at, text }) =>
      executeMutation(db, getAuthProps, {
        projectId: project_id,
        expectedVersion: expected_version,
        changedKind: "slide_narration_updated",
        changedId: `${slide_id}:${at}`,
        mutate: (document) => {
          const deck = requireDeck(document);
          const slide = findSlide(document, slide_id);
          slide.narration ??= {
            display: deck.narration_defaults?.display ?? "commentary",
            speaker: deck.narration_defaults?.speaker ?? null,
            segments: []
          };
          const index = slide.narration.segments.findIndex(
            (segment) => segment.at === at
          );
          if (text === null) {
            if (index !== -1) slide.narration.segments.splice(index, 1);
          } else {
            const previous = index === -1 ? null : slide.narration.segments[index];
            const segment = narrationSegmentSchema.parse({
              ...(previous ?? {}),
              at,
              text,
              audio_src:
                previous?.text === text
                  ? (previous?.audio_src ?? null)
                  : null
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
      description: "指定したスライドと、その中のreveal・読み上げを削除します。最後の1枚は削除できません。",
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
          if (deck.slides.length === 1) {
            throw new ProjectToolError(
              "LAST_SLIDE_REQUIRED",
              "Create or duplicate another slide before deleting the last slide."
            );
          }
          deck.slides.splice(index, 1);
        }
      })
  );
}
