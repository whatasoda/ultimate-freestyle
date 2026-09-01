import { z } from "zod";

// 閾値を持たない。実rendererが測った値をそのまま記録し、直すかどうかはAIと本人が決める。
// 判定文を保存していた頃は、fit_scale 0.68 が「70%未満の縮小1か所」という文章に潰れ、
// 表紙の大きな文字と本文の区別が付かなくなっていた。
export const renderedQualityMeasurementSchema = z.object({
  slide_id: z.string().min(1).max(64),
  steps: z.number().int().min(1).max(101),
  min_fit_scale: z.number().min(0).max(1),
  min_fit_scale_step: z.number().int().min(0).max(100),
  overflow_count: z.number().int().min(0).max(10_000),
  max_overflow_px: z.number().min(0),
  min_contrast_ratio: z.number().min(0).nullable(),
  min_contrast_required: z.number().min(0).nullable(),
  contrast_manual_review_count: z.number().int().min(0).max(10_000),
  hidden_line_count: z.number().int().min(0).max(10_000),
  min_font_size_px: z.number().min(0).nullable(),
  min_font_size_recommended_px: z.number().min(0).nullable(),
  max_overlap_ratio: z.number().min(0).max(1),
  fallback_font_count: z.number().int().min(0).max(10_000)
});

export const renderedQualityReportInputSchema = z.object({
  project_version: z.number().int().positive(),
  renderer_version: z.string().min(1).max(64),
  status: z.enum(["completed", "cancelled"]),
  completed_checkpoints: z.number().int().min(0).max(1000),
  total_checkpoints: z.number().int().min(1).max(1000),
  measurements: z.array(renderedQualityMeasurementSchema).max(101)
}).refine(
  (value) => value.completed_checkpoints <= value.total_checkpoints,
  { message: "Completed checkpoints must not exceed the total." }
);

export type RenderedQualityMeasurement = z.infer<typeof renderedQualityMeasurementSchema>;
export type RenderedQualityReportInput = z.infer<typeof renderedQualityReportInputSchema>;
export type RenderedQualityReport = RenderedQualityReportInput & {
  project_id: string;
  created_at: string;
};

export async function saveRenderedQualityReport(
  db: D1Database,
  ownerUserId: string,
  projectId: string,
  report: RenderedQualityReportInput,
  createdAt = new Date().toISOString()
): Promise<RenderedQualityReport> {
  await db.prepare(
    `INSERT INTO project_quality_reports (
       project_id, owner_user_id, project_version, renderer_version, status,
       completed_checkpoints, total_checkpoints, results_json, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(project_id) DO UPDATE SET
       owner_user_id = excluded.owner_user_id,
       project_version = excluded.project_version,
       renderer_version = excluded.renderer_version,
       status = excluded.status,
       completed_checkpoints = excluded.completed_checkpoints,
       total_checkpoints = excluded.total_checkpoints,
       results_json = excluded.results_json,
       created_at = excluded.created_at`
  ).bind(
    projectId,
    ownerUserId,
    report.project_version,
    report.renderer_version,
    report.status,
    report.completed_checkpoints,
    report.total_checkpoints,
    JSON.stringify(report.measurements),
    createdAt
  ).run();
  return { project_id: projectId, ...report, created_at: createdAt };
}

export async function getRenderedQualityReport(
  db: D1Database,
  ownerUserId: string,
  projectId: string
): Promise<RenderedQualityReport | null> {
  const row = await db.prepare(
    `SELECT project_id, project_version, renderer_version, status,
            completed_checkpoints, total_checkpoints, results_json, created_at
     FROM project_quality_reports
     WHERE project_id = ? AND owner_user_id = ?`
  ).bind(projectId, ownerUserId).first<{
    project_id: string;
    project_version: number;
    renderer_version: string;
    status: "completed" | "cancelled";
    completed_checkpoints: number;
    total_checkpoints: number;
    results_json: string;
    created_at: string;
  }>();
  if (row === null) return null;
  const { results_json, ...fields } = row;
  const parsed = renderedQualityReportInputSchema.extend({
    project_id: z.string(),
    created_at: z.string()
  }).safeParse({
    ...fields,
    measurements: JSON.parse(results_json)
  });
  // 判定文を保存していた旧形式の行は測定値へ変換できない。作り直しを促すため未実行として扱う。
  return parsed.success ? parsed.data : null;
}
