import { z } from "zod";

export const projectStageSchema = z.enum([
  "discovery",
  "design",
  "fieldwork",
  "story",
  "production",
  "review"
]);

export const narrationSegmentSchema = z.object({
  at: z.number().int().nonnegative().max(100),
  text: z.string().min(1).max(2_000),
  audio_src: z.string().max(500).nullable()
});

export const projectSlideSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
    title: z.string().min(1).max(120),
    duration_seconds: z.number().int().positive().max(1_200),
    reveal_steps: z.number().int().nonnegative().max(100),
    tone: z.enum(["dark", "light", "signal", "quiet"]),
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

export const projectDocumentSchema = z.object({
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
      accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      layout: z.enum(["cinematic", "biim", "minimal"]),
      narration_defaults: z
        .object({
          display: z.enum(["dialogue", "commentary", "inline"]),
          speaker: z.string().max(80).nullable(),
          credit: z.string().max(500).nullable()
        })
        .nullable(),
      slides: z.array(projectSlideSchema).max(100)
    })
    .nullable()
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
