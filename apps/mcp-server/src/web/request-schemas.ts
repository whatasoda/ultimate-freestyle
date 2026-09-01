import { z } from "zod";

import {
  animationSchema,
  coverLayoutSchema,
  loadingScreenSchema,
  narrationAppearanceSchema,
  narrationDisplaySchema,
  narrationSegmentSchema,
  presentationAspectRatioSchema,
  presentationTemplateSchema,
  slideBlockSchema,
  slideRoleSchema,
  slideSceneNodeSchema,
  slideTypographySchema,
  visualPresetSchema
} from "../projects/schema";
import { scenePatternSchema } from "../projects/scene-patterns";
import { voicevoxTuningStatusSchema } from "../voicevox/service";

export const reviewInstructionRequestSchema = z.object({
  comment_ids: z.array(z.string().uuid()).min(1).max(20)
});

export const projectFieldsRequestSchema = z
  .object({
    expected_version: z.number().int().positive(),
    title: z.string().min(1).max(120).optional(),
    summary: z.string().max(2_000).optional()
  })
  .strict()
  .refine(
    (value) => Object.keys(value).some((key) => key !== "expected_version"),
    { message: "更新する項目を1つ以上指定してください。" }
  );

export const imageAltRequestSchema = z.object({
  alt_text: z.string().max(500)
});

export const previewRequestSchema = z.object({
  expected_version: z.number().int().positive()
});

export const deckSettingsRequestSchema = z.object({
  expected_version: z.number().int().positive(),
  aspect_ratio: presentationAspectRatioSchema,
  loading_screen: loadingScreenSchema
});

export const publishRequestSchema = z.object({
  revision_id: z.string().uuid()
});

export const voiceSetupRequestSchema = z.object({
  expected_version: z.number().int().positive(),
  profile_id: z
    .string()
    .regex(/^voicevox-style-\d+$/)
    .default("voicevox-style-3")
});

export const voiceProfileTuningRequestSchema = z.object({
  expected_version: z.number().int().positive(),
  tuning: narrationSegmentSchema.shape.voice_tuning.unwrap()
});

export const voiceSampleRequestSchema = z.object({
  profile_id: z.string().regex(/^voicevox-style-\d+$/),
  tuning: voicevoxTuningStatusSchema
});

export const voiceJobRequestSchema = voiceSetupRequestSchema.extend({
  idempotency_key: z.string().uuid()
});

export const slideFieldsRequestSchema = z
  .object({
    expected_version: z.number().int().positive(),
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
    composition_background: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    composition_clip_content: z.boolean().optional(),
    content_markdown: z.string().min(1).max(20_000).optional(),
    sidebar_markdown: z.string().max(10_000).optional()
  })
  .refine(
    (request) =>
      Object.entries(request).some(
        ([key, value]) => key !== "expected_version" && value !== undefined
      ),
    { message: "At least one slide field is required." }
  );

export const slideActionRequestSchema = z.discriminatedUnion("action", [
  z.object({
    expected_version: z.number().int().positive(),
    action: z.literal("duplicate")
  }),
  z.object({
    expected_version: z.number().int().positive(),
    action: z.literal("move"),
    position: z.number().int().nonnegative().max(99)
  }),
  z.object({
    expected_version: z.number().int().positive(),
    action: z.literal("delete")
  })
]);

export const slideCreateRequestSchema = z.object({
  expected_version: z.number().int().positive(),
  title: z.string().min(1).max(120),
  position: z.number().int().nonnegative().max(99),
  template: z.enum(["flow", "cover", "canvas", "scene"])
});

export const slideSplitRequestSchema = z.object({
  expected_version: z.number().int().positive(),
  split_offset: z.number().int().positive().max(19_999),
  title: z.string().min(1).max(120),
  duration_seconds: z.number().int().min(2).max(1_200),
  content_markdown: z.string().min(3).max(20_000),
  sidebar_markdown: z.string().max(10_000)
});

export const slideCompositionCreateRequestSchema = z.object({
  expected_version: z.number().int().positive(),
  mode: z.enum(["canvas", "scene"])
});

export const slideTypographyRequestSchema = z.object({
  expected_version: z.number().int().positive(),
  typography: slideTypographySchema
});

export const sceneComponentRequestSchema = z.object({
  expected_version: z.number().int().positive(),
  component: slideSceneNodeSchema
});

export const sceneComponentActionRequestSchema = z.object({
  expected_version: z.number().int().positive(),
  action: z.enum(["duplicate", "delete", "delete_tree"])
});

export const sceneComponentItemActionRequestSchema = z.discriminatedUnion(
  "action",
  [
    z.object({
      expected_version: z.number().int().positive(),
      action: z.literal("add")
    }),
    z.object({
      expected_version: z.number().int().positive(),
      action: z.literal("delete"),
      item_id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/)
    }),
    z.object({
      expected_version: z.number().int().positive(),
      action: z.literal("move"),
      item_id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
      position: z.number().int().nonnegative().max(11)
    })
  ]
);

export const sceneComponentCreateRequestSchema = z.object({
  expected_version: z.number().int().positive(),
  kind: z.enum([
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
  ]),
  parent_id: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{0,63}$/)
    .nullable(),
  asset_id: z.string().uuid().nullable().optional()
});

export const scenePatternCreateRequestSchema = z.object({
  expected_version: z.number().int().positive(),
  pattern: scenePatternSchema,
  parent_id: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{0,63}$/)
    .nullable()
});

export const canvasBlockRequestSchema = z.object({
  expected_version: z.number().int().positive(),
  block: slideBlockSchema
});

export const canvasBlockActionRequestSchema = z.object({
  expected_version: z.number().int().positive(),
  action: z.enum(["duplicate", "delete"])
});

export const canvasBlockCreateRequestSchema = z.object({
  expected_version: z.number().int().positive(),
  kind: z.enum(["markdown", "image", "shape"]),
  asset_id: z.string().uuid().nullable().optional()
});

export const templateFieldsRequestSchema = presentationTemplateSchema
  .omit({ id: true })
  .extend({
    expected_version: z.number().int().positive(),
    make_default: z.boolean().optional()
  });

export const templateCreateRequestSchema = z.object({
  expected_version: z.number().int().positive(),
  template_id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  name: z.string().min(1).max(80),
  design_notes: z.string().max(1_000).optional(),
  visual_preset: visualPresetSchema,
  source_template_id: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{0,63}$/)
    .nullable()
    .optional(),
  make_default: z.boolean()
});

export const templateDeleteRequestSchema = z.object({
  expected_version: z.number().int().positive()
});

export const narrationSettingsRequestSchema = z.object({
  expected_version: z.number().int().positive(),
  display: narrationDisplaySchema,
  speaker: z.string().max(80).nullable(),
  appearance: narrationAppearanceSchema
});

export const narrationSegmentRequestSchema = z
  .object({
    text: narrationSegmentSchema.shape.text,
    speaker: narrationSegmentSchema.shape.speaker,
    voice_profile_id: narrationSegmentSchema.shape.voice_profile_id,
    voice_tuning: narrationSegmentSchema.shape.voice_tuning,
    voice_cues: narrationSegmentSchema.shape.voice_cues,
    pause_before_ms: narrationSegmentSchema.shape.pause_before_ms,
    pause_after_ms: narrationSegmentSchema.shape.pause_after_ms
  })
  .required({ speaker: true, voice_profile_id: true, voice_tuning: true })
  .extend({ expected_version: z.number().int().positive() });

export const narrationSegmentCreateRequestSchema = z.object({
  expected_version: z.number().int().positive(),
  at: z.number().int().nonnegative().max(100),
  text: z.string().trim().min(1).max(2_000)
});

export const narrationSegmentDeleteRequestSchema = z.object({
  expected_version: z.number().int().positive()
});

export const slideNarrationRequestSchema = z.object({
  expected_version: z.number().int().positive(),
  segments: z
    .array(
      z.object({
        at: z.number().int().nonnegative().max(100),
        text: z.string().trim().min(1).max(2_000)
      })
    )
    .max(101)
    .superRefine((segments, context) => {
      const seen = new Set<number>();
      for (const segment of segments) {
        if (seen.has(segment.at)) {
          context.addIssue({
            code: "custom",
            message: "Narration steps must be unique."
          });
        }
        seen.add(segment.at);
      }
    })
});
