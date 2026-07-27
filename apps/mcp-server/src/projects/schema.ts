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

export const presentationTemplateSchema = z.object({
  id: templateIdSchema,
  name: z.string().min(1).max(80),
  region_layout: z.enum([
    "single",
    "sidebar-right",
    "sidebar-left",
    "lower-third"
  ]),
  sidebar_width_percent: z.number().int().min(20).max(45),
  background: hexColorSchema,
  surface: hexColorSchema,
  foreground: hexColorSchema,
  muted: hexColorSchema,
  accent: hexColorSchema,
  corner_radius_px: z.number().int().min(0).max(48),
  spacing_scale: z.number().min(0.75).max(1.5).multipleOf(0.05),
  font_scale: z.number().min(0.75).max(1.3).multipleOf(0.05),
  enter_animation: z.enum(["none", "fade", "rise", "zoom", "wipe"]),
  reveal_animation: z.enum(["none", "fade", "rise", "zoom", "wipe"])
});

export type PresentationTemplate = z.infer<typeof presentationTemplateSchema>;

export const narrationSegmentSchema = z.object({
  at: z.number().int().nonnegative().max(100),
  text: z.string().min(1).max(2_000),
  audio_src: z.string().max(500).nullable(),
  voice_profile_id: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{0,63}$/)
    .nullable()
    .optional(),
  voice_tuning: z
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
    .optional()
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
    enter_animation: z
      .enum(["none", "fade", "rise", "zoom", "wipe"])
      .nullable()
      .optional(),
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
        display: z.enum(["dialogue", "commentary", "inline"]),
        speaker: z.string().max(80).nullable(),
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
  source_url: z.string().url().max(2_000).nullable()
});

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
  logs: z.array(researchLogEntrySchema).max(500),
    deck: z
      .object({
      short_title: z.string().min(1).max(60),
      description: z.string().max(500),
      author: z.string().max(120),
      year: z.number().int().min(2021).max(2100),
      accent: hexColorSchema,
      layout: z.enum(["cinematic", "biim", "minimal"]),
      templates: z.array(presentationTemplateSchema).max(16).optional(),
      default_template_id: templateIdSchema.nullable().optional(),
      narration_defaults: z
        .object({
          display: z.enum(["dialogue", "commentary", "inline"]),
          speaker: z.string().max(80).nullable(),
          credit: z.string().max(500).nullable()
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
