import { z } from "zod";
import { VOICEVOX_TUNING_LIMITS } from "@ultimate-freestyle/research-schema/voice";

export const projectStageSchema = z.enum([
  "discovery",
  "design",
  "fieldwork",
  "story",
  "production",
  "review"
]);

const templateIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/);
const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const blockIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/);
const percentSchema = z.number().min(0).max(100).multipleOf(0.01);
export const animationSchema = z.enum([
  "none",
  "fade",
  "rise",
  "zoom",
  "wipe",
  "slide-left",
  "slide-right",
  "pop",
  "blur"
]);

export const visualPresetSchema = z.enum([
  "studio",
  "paper",
  "editorial",
  "neon",
  "retro-game",
  "soft-pop",
  "scientific",
  "museum",
  "terminal"
]);

export const designMotifSchema = z.enum([
  "none",
  "dots",
  "grid",
  "diagonal",
  "rings",
  "waves"
]);

export const headingTreatmentSchema = z.enum([
  "plain",
  "accent-line",
  "highlight",
  "boxed",
  "outline"
]);

export const imageTreatmentSchema = z.enum([
  "natural",
  "rounded",
  "framed",
  "monochrome"
]);

export const panelTreatmentSchema = z.enum([
  "flat",
  "soft",
  "outline",
  "raised",
  "glass"
]);

export const fontPresetSchema = z.enum([
  "system-sans",
  "gothic",
  "rounded",
  "mincho",
  "serif",
  "monospace",
  "display",
  "textbook",
  "handwritten",
  "condensed"
]);

export const densitySchema = z.enum([
  "spacious",
  "comfortable",
  "compact"
]);

export const motionStyleSchema = z.enum(["calm", "snappy", "dramatic"]);

export const presentationAspectRatioSchema = z.enum(["16:9", "4:3"]);

export const loadingScreenStyleSchema = z.enum([
  "minimal",
  "pulse",
  "orbit",
  "research-log"
]);

export const loadingScreenSchema = z.object({
  enabled: z.boolean(),
  style: loadingScreenStyleSchema,
  message: z.string().max(160),
  show_progress: z.boolean(),
  minimum_duration_ms: z.number().int().min(0).max(5_000)
});

export const slideRoleSchema = z.enum([
  "cover",
  "section",
  "content",
  "comparison",
  "result",
  "closing"
]);

export const regionLayoutSchema = z.enum([
  "single",
  "sidebar-right",
  "sidebar-left",
  "lower-third",
  "split",
  "top-band",
  "focus"
]);

export const coverLayoutSchema = z.enum([
  "center",
  "split",
  "poster",
  "minimal",
  "statement",
  "band",
  "corner",
  "frame"
]);

export const slideTypographyPresetSchema = z.enum([
  "statement",
  "standard",
  "article",
  "columns",
  "dense"
]);

export const slideTypographySchema = z.object({
  preset: slideTypographyPresetSchema,
  columns: z.number().int().min(1).max(3).optional(),
  body_scale: z.number().min(0.5).max(1.4).multipleOf(0.05).optional(),
  heading_scale: z.number().min(0.5).max(1.5).multipleOf(0.05).optional(),
  line_height: z.number().min(1).max(2).multipleOf(0.05).optional(),
  paragraph_spacing_em: z.number().min(0).max(2).multipleOf(0.05).optional(),
  column_gap_em: z.number().min(0.5).max(5).multipleOf(0.1).optional(),
  text_align: z.enum(["start", "center"]).optional(),
  vertical_align: z.enum(["start", "center"]).optional()
});

export type SlideTypography = z.infer<typeof slideTypographySchema>;

export const narrationDisplaySchema = z.enum([
  "dialogue",
  "commentary",
  "inline",
  "subtitle",
  "minimal"
]);

export const narrationAppearanceSchema = z.object({
  placement: z.enum(["bottom", "overlay-bottom", "sidebar"]).optional(),
  size: z.enum(["compact", "normal", "large"]).optional(),
  text_align: z.enum(["start", "center"]).optional(),
  speaker_visible: z.boolean().optional(),
  progress_visible: z.boolean().optional(),
  text_scale: z.number().min(0.75).max(1.5).multipleOf(0.05).optional(),
  max_lines: z.number().int().min(2).max(8).optional(),
  background: hexColorSchema.optional(),
  foreground: hexColorSchema.optional(),
  border_color: hexColorSchema.optional(),
  accent: hexColorSchema.optional(),
  corner_radius_px: z.number().int().min(0).max(64).optional()
});

export const slideBlockFrameSchema = z.object({
  x: percentSchema,
  y: percentSchema,
  width: z.number().positive().max(100).multipleOf(0.01),
  height: z.number().positive().max(100).multipleOf(0.01)
});

export const slideBlockStyleSchema = z.object({
  background: hexColorSchema.nullable().optional(),
  foreground: hexColorSchema.nullable().optional(),
  border_color: hexColorSchema.nullable().optional(),
  border_width_px: z.number().int().min(0).max(8).optional(),
  corner_radius_px: z.number().int().min(0).max(64).optional(),
  padding_px: z.number().int().min(0).max(64).optional(),
  opacity: z.number().min(0.1).max(1).multipleOf(0.05).optional(),
  text_align: z.enum(["start", "center", "end"]).optional(),
  vertical_align: z.enum(["start", "center", "end"]).optional(),
  font_scale: z.number().min(0.5).max(3).multipleOf(0.05).optional(),
  shadow: z.enum(["none", "soft", "strong"]).optional()
});

const sceneNodeBaseSchema = z.object({
  id: blockIdSchema,
  parent_id: blockIdSchema.nullable(),
  order: z.number().int().min(0).max(999),
  at: z.number().int().nonnegative().max(100),
  animation: animationSchema,
  frame: slideBlockFrameSchema.nullable().optional(),
  style: slideBlockStyleSchema.optional()
});

const sceneItemBaseSchema = z.object({
  id: blockIdSchema,
  at: z.number().int().nonnegative().max(100)
});

const sceneLayerNodeSchema = sceneNodeBaseSchema.extend({
  kind: z.literal("layer")
});
const sceneStackNodeSchema = sceneNodeBaseSchema.extend({
  kind: z.literal("stack"),
  direction: z.enum(["row", "column"]),
  gap_px: z.number().int().min(0).max(64),
  align: z.enum(["start", "center", "end", "stretch"]),
  justify: z.enum(["start", "center", "end", "between", "around"]),
  wrap: z.boolean()
});
const sceneGridNodeSchema = sceneNodeBaseSchema.extend({
  kind: z.literal("grid"),
  columns: z.number().int().min(1).max(6),
  gap_px: z.number().int().min(0).max(64),
  align: z.enum(["start", "center", "end", "stretch"])
});
const sceneHeroNodeSchema = sceneNodeBaseSchema.extend({
  kind: z.literal("hero"),
  eyebrow: z.string().max(120).nullable(),
  heading: z.string().min(1).max(500),
  subtitle: z.string().max(2_000).nullable(),
  align: z.enum(["start", "center", "end"])
});
const sceneMarkdownNodeSchema = sceneNodeBaseSchema.extend({
  kind: z.literal("markdown"),
  markdown: z.string().min(1).max(20_000)
});
const sceneImageNodeSchema = sceneNodeBaseSchema.extend({
  kind: z.literal("image"),
  asset_id: z.string().uuid(),
  alt_text: z.string().max(500),
  fit: z.enum(["contain", "cover", "fill"]),
  caption: z.string().max(500).nullable()
});
const sceneShapeNodeSchema = sceneNodeBaseSchema.extend({
  kind: z.literal("shape"),
  shape: z.enum(["rectangle", "ellipse", "line"]),
  label: z.string().max(500).nullable()
});
const sceneCardNodeSchema = sceneNodeBaseSchema.extend({
  kind: z.literal("card"),
  label: z.string().max(120).nullable(),
  markdown: z.string().min(1).max(10_000),
  variant: z.enum(["plain", "accent", "glass"])
});
const sceneMetricNodeSchema = sceneNodeBaseSchema.extend({
  kind: z.literal("metric"),
  value: z.string().min(1).max(80),
  unit: z.string().max(40).nullable(),
  caption: z.string().max(500),
  emphasis: z.enum(["normal", "strong", "signal"])
});
const sceneQuoteNodeSchema = sceneNodeBaseSchema.extend({
  kind: z.literal("quote"),
  quote: z.string().min(1).max(4_000),
  attribution: z.string().max(500).nullable()
});
const sceneCalloutNodeSchema = sceneNodeBaseSchema.extend({
  kind: z.literal("callout"),
  label: z.string().max(120).nullable(),
  heading: z.string().min(1).max(500),
  markdown: z.string().max(4_000).nullable(),
  variant: z.enum(["info", "success", "warning", "danger"])
});
const sceneBarChartNodeSchema = sceneNodeBaseSchema.extend({
  kind: z.literal("bar_chart"),
  max_value: z.number().positive().max(1_000_000_000),
  items: z
    .array(
      sceneItemBaseSchema.extend({
        label: z.string().min(1).max(120),
        value: z.number().min(0).max(1_000_000_000),
        color: hexColorSchema.nullable()
      })
    )
    .min(1)
    .max(12)
});
const sceneTimelineNodeSchema = sceneNodeBaseSchema.extend({
  kind: z.literal("timeline"),
  items: z
    .array(
      sceneItemBaseSchema.extend({
        kicker: z.string().max(120).nullable(),
        heading: z.string().min(1).max(500),
        detail: z.string().max(2_000).nullable()
      })
    )
    .min(1)
    .max(12)
});

export const slideSceneLayoutNodeSchema = z.discriminatedUnion("kind", [
  sceneLayerNodeSchema,
  sceneStackNodeSchema,
  sceneGridNodeSchema
]);
export const slideSceneTextNodeSchema = z.discriminatedUnion("kind", [
  sceneHeroNodeSchema,
  sceneMarkdownNodeSchema,
  sceneQuoteNodeSchema
]);
export const slideSceneInfoNodeSchema = z.discriminatedUnion("kind", [
  sceneCardNodeSchema,
  sceneMetricNodeSchema,
  sceneCalloutNodeSchema
]);
export const slideSceneDataNodeSchema = z.discriminatedUnion("kind", [
  sceneBarChartNodeSchema,
  sceneTimelineNodeSchema
]);
export const slideSceneMediaNodeSchema = z.discriminatedUnion("kind", [
  sceneImageNodeSchema,
  sceneShapeNodeSchema
]);
export const slideSceneNodeSchema = z.discriminatedUnion("kind", [
  sceneLayerNodeSchema,
  sceneStackNodeSchema,
  sceneGridNodeSchema,
  sceneHeroNodeSchema,
  sceneMarkdownNodeSchema,
  sceneImageNodeSchema,
  sceneShapeNodeSchema,
  sceneCardNodeSchema,
  sceneMetricNodeSchema,
  sceneQuoteNodeSchema,
  sceneCalloutNodeSchema,
  sceneBarChartNodeSchema,
  sceneTimelineNodeSchema
]);

export type SlideSceneNode = z.infer<typeof slideSceneNodeSchema>;

const SCENE_CONTAINER_KINDS = new Set<SlideSceneNode["kind"]>([
  "layer",
  "stack",
  "grid"
]);

function sceneNodeRevealPositions(node: SlideSceneNode): number[] {
  if (node.kind === "bar_chart" || node.kind === "timeline") {
    return [node.at, ...node.items.map((item) => item.at)];
  }
  return [node.at];
}

export function compositionRevealPositions(
  composition: z.infer<typeof slideCompositionSchema> | null | undefined
): number[] {
  if (composition === null || composition === undefined) return [];
  return composition.mode === "canvas"
    ? composition.blocks.map((block) => block.at)
    : composition.nodes.flatMap(sceneNodeRevealPositions);
}

const slideBlockBaseSchema = z.object({
  id: blockIdSchema,
  frame: slideBlockFrameSchema,
  z_index: z.number().int().min(0).max(100),
  at: z.number().int().nonnegative().max(100),
  animation: animationSchema,
  style: slideBlockStyleSchema.optional()
});

export const slideBlockSchema = z
  .discriminatedUnion("kind", [
    slideBlockBaseSchema.extend({
      kind: z.literal("markdown"),
      markdown: z.string().min(1).max(20_000)
    }),
    slideBlockBaseSchema.extend({
      kind: z.literal("image"),
      asset_id: z.string().uuid(),
      alt_text: z.string().max(500),
      fit: z.enum(["contain", "cover", "fill"])
    }),
    slideBlockBaseSchema.extend({
      kind: z.literal("shape"),
      shape: z.enum(["rectangle", "ellipse", "line"]),
      label: z.string().max(500).nullable()
    })
  ])
  .superRefine((block, context) => {
    if (block.frame.x + block.frame.width > 100) {
      context.addIssue({
        code: "custom",
        path: ["frame", "width"],
        message: "A slide block must fit within the horizontal canvas."
      });
    }
    if (block.frame.y + block.frame.height > 100) {
      context.addIssue({
        code: "custom",
        path: ["frame", "height"],
        message: "A slide block must fit within the vertical canvas."
      });
    }
  });

export type SlideBlock = z.infer<typeof slideBlockSchema>;

const slideCanvasCompositionSchema = z
  .object({
    mode: z.literal("canvas"),
    background: hexColorSchema,
    clip_content: z.boolean(),
    blocks: z.array(slideBlockSchema).max(100)
  })
  .superRefine((composition, context) => {
    const ids = new Set<string>();
    for (const [index, block] of composition.blocks.entries()) {
      if (ids.has(block.id)) {
        context.addIssue({
          code: "custom",
          path: ["blocks", index, "id"],
          message: "Slide block IDs must be unique."
        });
      }
      ids.add(block.id);
    }
  });

const slideSceneCompositionSchema = z
  .object({
    mode: z.literal("scene"),
    runtime_version: z.literal("uf-runtime@1"),
    background: hexColorSchema,
    clip_content: z.boolean(),
    nodes: z.array(slideSceneNodeSchema).max(200)
  })
  .superRefine((composition, context) => {
    const byId = new Map<string, SlideSceneNode>();
    for (const [index, node] of composition.nodes.entries()) {
      if (byId.has(node.id)) {
        context.addIssue({
          code: "custom",
          path: ["nodes", index, "id"],
          message: "Scene node IDs must be unique."
        });
      }
      byId.set(node.id, node);
      if (node.frame) {
        if (node.frame.x + node.frame.width > 100) {
          context.addIssue({
            code: "custom",
            path: ["nodes", index, "frame", "width"],
            message: "A positioned scene node must fit horizontally."
          });
        }
        if (node.frame.y + node.frame.height > 100) {
          context.addIssue({
            code: "custom",
            path: ["nodes", index, "frame", "height"],
            message: "A positioned scene node must fit vertically."
          });
        }
      }
      if (
        (node.kind === "bar_chart" || node.kind === "timeline") &&
        new Set(node.items.map((item) => item.id)).size !== node.items.length
      ) {
        context.addIssue({
          code: "custom",
          path: ["nodes", index, "items"],
          message: "Component item IDs must be unique within a node."
        });
      }
    }

    for (const [index, node] of composition.nodes.entries()) {
      if (node.parent_id === null) continue;
      const parent = byId.get(node.parent_id);
      if (parent === undefined) {
        context.addIssue({
          code: "custom",
          path: ["nodes", index, "parent_id"],
          message: "The scene node parent must exist."
        });
        continue;
      }
      if (!SCENE_CONTAINER_KINDS.has(parent.kind)) {
        context.addIssue({
          code: "custom",
          path: ["nodes", index, "parent_id"],
          message: "Only layer, stack, and grid nodes can contain children."
        });
      }
      if (
        parent.kind === "layer" &&
        (node.frame === null || node.frame === undefined)
      ) {
        context.addIssue({
          code: "custom",
          path: ["nodes", index, "frame"],
          message: "Children of a layer must have a frame."
        });
      }
      if ((parent.kind === "stack" || parent.kind === "grid") && node.frame) {
        context.addIssue({
          code: "custom",
          path: ["nodes", index, "frame"],
          message: "Children of stack and grid use flow layout, not a frame."
        });
      }

      const visited = new Set<string>([node.id]);
      let ancestor: SlideSceneNode | undefined = parent;
      let depth = 1;
      while (ancestor !== undefined) {
        if (visited.has(ancestor.id)) {
          context.addIssue({
            code: "custom",
            path: ["nodes", index, "parent_id"],
            message: "Scene nodes must not form a cycle."
          });
          break;
        }
        visited.add(ancestor.id);
        depth += 1;
        if (depth > 8) {
          context.addIssue({
            code: "custom",
            path: ["nodes", index, "parent_id"],
            message: "Scene nesting is limited to 8 levels."
          });
          break;
        }
        ancestor =
          ancestor.parent_id === null
            ? undefined
            : byId.get(ancestor.parent_id);
      }
    }
  });

export const slideCompositionSchema = z.discriminatedUnion("mode", [
  slideCanvasCompositionSchema,
  slideSceneCompositionSchema
]);

export const presentationRoleStyleSchema = z.object({
  region_layout: regionLayoutSchema.optional(),
  background: hexColorSchema.optional(),
  surface: hexColorSchema.optional(),
  foreground: hexColorSchema.optional(),
  muted: hexColorSchema.optional(),
  accent: hexColorSchema.optional(),
  accent_secondary: hexColorSchema.optional(),
  border: hexColorSchema.optional(),
  motif: designMotifSchema.optional(),
  motif_color: hexColorSchema.optional(),
  motif_opacity: z.number().min(0).max(0.5).multipleOf(0.05).optional(),
  heading_treatment: headingTreatmentSchema.optional(),
  panel_treatment: panelTreatmentSchema.optional()
});

export const presentationRoleStylesSchema = z.object({
  cover: presentationRoleStyleSchema.optional(),
  section: presentationRoleStyleSchema.optional(),
  content: presentationRoleStyleSchema.optional(),
  comparison: presentationRoleStyleSchema.optional(),
  result: presentationRoleStyleSchema.optional(),
  closing: presentationRoleStyleSchema.optional()
});

export const presentationTemplateSchema = z.object({
  id: templateIdSchema,
  name: z.string().min(1).max(80),
  design_notes: z.string().max(1_000).optional(),
  region_layout: regionLayoutSchema,
  sidebar_width_percent: z.number().int().min(20).max(45),
  background: hexColorSchema,
  surface: hexColorSchema,
  foreground: hexColorSchema,
  muted: hexColorSchema,
  accent: hexColorSchema,
  accent_secondary: hexColorSchema.optional(),
  border: hexColorSchema.optional(),
  corner_radius_px: z.number().int().min(0).max(48),
  spacing_scale: z.number().min(0.75).max(1.5).multipleOf(0.05),
  font_scale: z.number().min(0.75).max(1.3).multipleOf(0.05),
  enter_animation: animationSchema,
  reveal_animation: animationSchema,
  visual_preset: visualPresetSchema.optional(),
  body_font: fontPresetSchema.optional(),
  heading_font: fontPresetSchema.optional(),
  density: densitySchema.optional(),
  motion_style: motionStyleSchema.optional(),
  body_weight: z.number().int().min(300).max(900).multipleOf(100).optional(),
  heading_weight: z.number().int().min(300).max(900).multipleOf(100).optional(),
  line_height: z.number().min(1).max(2).multipleOf(0.05).optional(),
  letter_spacing_em: z
    .number()
    .min(-0.08)
    .max(0.2)
    .multipleOf(0.01)
    .optional(),
  motif: designMotifSchema.optional(),
  motif_color: hexColorSchema.optional(),
  motif_opacity: z.number().min(0).max(0.5).multipleOf(0.05).optional(),
  motif_scale: z.number().min(0.5).max(3).multipleOf(0.1).optional(),
  heading_treatment: headingTreatmentSchema.optional(),
  image_treatment: imageTreatmentSchema.optional(),
  panel_treatment: panelTreatmentSchema.optional(),
  role_styles: presentationRoleStylesSchema.optional()
});

export type PresentationTemplate = z.infer<typeof presentationTemplateSchema>;

const narrationVoiceTuningSchema = z
  .object(
    Object.fromEntries(
      Object.entries(VOICEVOX_TUNING_LIMITS).map(([key, range]) => [
        key,
        z.number().min(range.min).max(range.max).multipleOf(0.01).optional()
      ])
    ) as {
      speedScale: z.ZodOptional<z.ZodNumber>;
      pitchScale: z.ZodOptional<z.ZodNumber>;
      intonationScale: z.ZodOptional<z.ZodNumber>;
      volumeScale: z.ZodOptional<z.ZodNumber>;
      pauseLengthScale: z.ZodOptional<z.ZodNumber>;
      prePhonemeLength: z.ZodOptional<z.ZodNumber>;
      postPhonemeLength: z.ZodOptional<z.ZodNumber>;
    }
  )
  .nullable()
  .optional();

export const narrationVoiceCueSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,31}$/),
  text: z.string().min(1).max(500),
  voice_profile_id: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{0,63}$/)
    .nullable()
    .optional(),
  voice_tuning: narrationVoiceTuningSchema,
  pause_after_ms: z.number().int().min(0).max(10_000).multipleOf(100).optional()
});

export const narrationSegmentSchema = z
  .object({
    at: z.number().int().nonnegative().max(100),
    text: z.string().min(1).max(2_000),
    audio_src: z.string().max(500).nullable(),
    speaker: z.string().max(80).nullable().optional(),
    voice_profile_id: z
      .string()
      .regex(/^[a-z0-9][a-z0-9-]{0,63}$/)
      .nullable()
      .optional(),
    voice_tuning: narrationVoiceTuningSchema,
    voice_cues: z.array(narrationVoiceCueSchema).min(1).max(8).optional(),
    pause_before_ms: z.number().int().min(0).max(10_000).multipleOf(100).optional(),
    pause_after_ms: z.number().int().min(0).max(10_000).multipleOf(100).optional()
  })
  .superRefine((segment, context) => {
    if (segment.voice_cues === undefined) return;
    const cueIds = new Set<string>();
    for (const [index, cue] of segment.voice_cues.entries()) {
      if (cueIds.has(cue.id)) {
        context.addIssue({
          code: "custom",
          path: ["voice_cues", index, "id"],
          message: "Narration voice cue IDs must be unique."
        });
      }
      cueIds.add(cue.id);
    }
    if (segment.voice_cues.map((cue) => cue.text).join("") !== segment.text) {
      context.addIssue({
        code: "custom",
        path: ["voice_cues"],
        message: "Narration voice cue text must exactly compose the displayed narration text."
      });
    }
  });

export const voicevoxProfileSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  label: z.string().min(1).max(80),
  speaker_uuid: z.string().uuid(),
  speaker_name: z.string().min(1).max(80),
  style_id: z.number().int().nonnegative(),
  style_name: z.string().min(1).max(80),
  tuning: narrationSegmentSchema.shape.voice_tuning
});

export const voicevoxSettingsSchema = z
  .object({
    catalog_revision: z.string().min(1).max(128),
    default_profile_id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
    profiles: z.array(voicevoxProfileSchema).min(1).max(16)
  })
  .superRefine((settings, context) => {
    const ids = new Set<string>();
    for (const [index, profile] of settings.profiles.entries()) {
      if (ids.has(profile.id)) {
        context.addIssue({
          code: "custom",
          path: ["profiles", index, "id"],
          message: "VOICEVOX profile IDs must be unique."
        });
      }
      ids.add(profile.id);
    }
    if (!ids.has(settings.default_profile_id)) {
      context.addIssue({
        code: "custom",
        path: ["default_profile_id"],
        message: "The default VOICEVOX profile must exist in profiles."
      });
    }
  });

export const projectSlideSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
    title: z.string().min(1).max(120),
    duration_seconds: z.number().int().positive().max(1_200),
    reveal_steps: z.number().int().nonnegative().max(100),
    tone: z.enum(["dark", "light", "signal", "quiet"]),
    template_id: templateIdSchema.nullable().optional(),
    enter_animation: animationSchema.nullable().optional(),
    role: slideRoleSchema.optional(),
    cover_layout: coverLayoutSchema.optional(),
    typography: slideTypographySchema.optional(),
    composition: slideCompositionSchema.nullable().optional(),
    content_markdown: z.string().min(1).max(20_000),
    reveal_blocks: z
      .array(
        z.object({
          at: z.number().int().positive().max(100),
          markdown: z.string().min(1).max(10_000)
        })
      )
      .max(100),
    sidebar_markdown: z.string().max(10_000).nullable(),
    narration: z
      .object({
        display: narrationDisplaySchema,
        speaker: z.string().max(80).nullable(),
        appearance: narrationAppearanceSchema.optional(),
        segments: z.array(narrationSegmentSchema).max(101)
      })
      .nullable()
  })
  .superRefine((slide, context) => {
    const revealPositions = new Set<number>();
    for (const block of slide.reveal_blocks) {
      if (block.at > slide.reveal_steps) {
        context.addIssue({
          code: "custom",
          path: ["reveal_blocks"],
          message: "Reveal block positions must not exceed reveal_steps."
        });
      }
      if (revealPositions.has(block.at)) {
        context.addIssue({
          code: "custom",
          path: ["reveal_blocks"],
          message: "Reveal block positions must be unique."
        });
      }
      revealPositions.add(block.at);
    }
    const narrationPositions = new Set<number>();
    for (const segment of slide.narration?.segments ?? []) {
      if (segment.at > slide.reveal_steps) {
        context.addIssue({
          code: "custom",
          path: ["narration", "segments"],
          message: "Narration positions must not exceed reveal_steps."
        });
      }
      if (narrationPositions.has(segment.at)) {
        context.addIssue({
          code: "custom",
          path: ["narration", "segments"],
          message: "Narration positions must be unique."
        });
      }
      narrationPositions.add(segment.at);
    }
    for (const [positionIndex, position] of compositionRevealPositions(
      slide.composition
    ).entries()) {
      if (position > slide.reveal_steps) {
        context.addIssue({
          code: "custom",
          path: ["composition", "reveal", positionIndex],
          message: "Slide component positions must not exceed reveal_steps."
        });
      }
    }
  });

export const researchLogEntrySchema = z.object({
  id: z.string().uuid(),
  occurred_at: z.string().datetime(),
  kind: z.enum([
    "observation",
    "experiment",
    "decision",
    "source",
    "note"
  ]),
  text: z.string().min(1).max(10_000),
  source_url: z.string().url().max(2_000).regex(/^https?:\/\//i).nullable()
});

export const RESEARCH_LOG_LIMIT = 500;
export const RESEARCH_LOG_PAGE_SIZE = 20;

export const projectDocumentSchema = z
  .object({
  schema_version: z.literal(1),
  stage: projectStageSchema,
  title: z.string().min(1).max(120),
  summary: z.string().max(2_000),
  question: z.string().max(2_000).nullable(),
  hypothesis: z.string().max(4_000).nullable(),
  method: z.string().max(20_000).nullable(),
  findings: z.array(z.string().min(1).max(4_000)).max(100),
  limitations: z.array(z.string().min(1).max(4_000)).max(100),
  logs: z.array(researchLogEntrySchema).max(RESEARCH_LOG_LIMIT),
    deck: z
      .object({
      short_title: z.string().min(1).max(60),
      description: z.string().max(500),
      author: z.string().max(120),
      year: z.number().int().min(2021).max(2100),
      accent: hexColorSchema,
      layout: z.enum(["cinematic", "biim", "minimal"]),
      aspect_ratio: presentationAspectRatioSchema.optional(),
      loading_screen: loadingScreenSchema.optional(),
      templates: z.array(presentationTemplateSchema).max(16).optional(),
      default_template_id: templateIdSchema.nullable().optional(),
      narration_defaults: z
        .object({
          display: narrationDisplaySchema,
          speaker: z.string().max(80).nullable(),
          credit: z.string().max(500).nullable(),
          appearance: narrationAppearanceSchema.optional()
        })
        .nullable(),
      voicevox: voicevoxSettingsSchema.nullable().optional(),
      slides: z.array(projectSlideSchema).max(100)
      })
      .nullable()
  })
  .superRefine((document, context) => {
    const templateIds = new Set<string>();
    for (const [index, template] of (
      document.deck?.templates ?? []
    ).entries()) {
      if (templateIds.has(template.id)) {
        context.addIssue({
          code: "custom",
          path: ["deck", "templates", index, "id"],
          message: "Presentation template IDs must be unique."
        });
      }
      templateIds.add(template.id);
    }
    if (
      document.deck?.default_template_id &&
      !templateIds.has(document.deck.default_template_id)
    ) {
      context.addIssue({
        code: "custom",
        path: ["deck", "default_template_id"],
        message: "The default presentation template must exist in templates."
      });
    }
    const profiles = new Set(
      document.deck?.voicevox?.profiles.map((profile) => profile.id) ?? []
    );
    for (const [slideIndex, slide] of (
      document.deck?.slides ?? []
    ).entries()) {
      if (slide.template_id && !templateIds.has(slide.template_id)) {
        context.addIssue({
          code: "custom",
          path: ["deck", "slides", slideIndex, "template_id"],
          message: "The referenced presentation template does not exist."
        });
      }
      for (const [segmentIndex, segment] of (
        slide.narration?.segments ?? []
      ).entries()) {
        if (
          segment.voice_profile_id !== undefined &&
          segment.voice_profile_id !== null &&
          !profiles.has(segment.voice_profile_id)
        ) {
          context.addIssue({
            code: "custom",
            path: [
              "deck",
              "slides",
              slideIndex,
              "narration",
              "segments",
              segmentIndex,
              "voice_profile_id"
            ],
            message: "The referenced VOICEVOX profile does not exist."
          });
        }
        for (const [cueIndex, cue] of (segment.voice_cues ?? []).entries()) {
          if (
            cue.voice_profile_id !== undefined &&
            cue.voice_profile_id !== null &&
            !profiles.has(cue.voice_profile_id)
          ) {
            context.addIssue({
              code: "custom",
              path: [
                "deck",
                "slides",
                slideIndex,
                "narration",
                "segments",
                segmentIndex,
                "voice_cues",
                cueIndex,
                "voice_profile_id"
              ],
              message: "The referenced VOICEVOX profile does not exist."
            });
          }
        }
      }
    }
  });

export type ProjectDocument = z.infer<typeof projectDocumentSchema>;

export const projectRecordSchema = z.object({
  project_id: z.string().uuid(),
  version: z.number().int().positive(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  document: projectDocumentSchema
});

export type ProjectRecord = z.infer<typeof projectRecordSchema>;

export const projectSummarySchema = z.object({
  project_id: z.string().uuid(),
  title: z.string(),
  stage: projectStageSchema,
  version: z.number().int().positive(),
  has_presentation: z.boolean(),
  slide_count: z.number().int().nonnegative(),
  total_duration_seconds: z.number().int().nonnegative(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime()
});

export type ProjectSummary = z.infer<typeof projectSummarySchema>;

export function createEmptyProject(title: string): ProjectDocument {
  return {
    schema_version: 1,
    stage: "discovery",
    title,
    summary: "",
    question: null,
    hypothesis: null,
    method: null,
    findings: [],
    limitations: [],
    logs: [],
    deck: null
  };
}
