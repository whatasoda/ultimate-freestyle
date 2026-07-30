import { z } from "zod";

export const renderedQualityResultSchema = z.object({
  slide_id: z.string().min(1).max(64),
  message: z.string().min(1).max(300),
  warning: z.boolean()
});

export const renderedQualityReportInputSchema = z.object({
  project_version: z.number().int().positive(),
  renderer_version: z.string().min(1).max(64),
  status: z.enum(["completed", "cancelled"]),
  completed_checkpoints: z.number().int().min(0).max(1000),
  total_checkpoints: z.number().int().min(1).max(1000),
  issue_count: z.number().int().min(0).max(1000),
  results: z.array(renderedQualityResultSchema).max(60)
}).refine(
  (value) => value.completed_checkpoints <= value.total_checkpoints,
  { message: "Completed checkpoints must not exceed the total." }
);

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
       completed_checkpoints, total_checkpoints, issue_count, results_json, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(project_id) DO UPDATE SET
       owner_user_id = excluded.owner_user_id,
       project_version = excluded.project_version,
       renderer_version = excluded.renderer_version,
       status = excluded.status,
       completed_checkpoints = excluded.completed_checkpoints,
       total_checkpoints = excluded.total_checkpoints,
       issue_count = excluded.issue_count,
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
    report.issue_count,
    JSON.stringify(report.results),
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
            completed_checkpoints, total_checkpoints, issue_count, results_json, created_at
     FROM project_quality_reports
     WHERE project_id = ? AND owner_user_id = ?`
  ).bind(projectId, ownerUserId).first<{
    project_id: string;
    project_version: number;
    renderer_version: string;
    status: "completed" | "cancelled";
    completed_checkpoints: number;
    total_checkpoints: number;
    issue_count: number;
    results_json: string;
    created_at: string;
  }>();
  if (row === null) return null;
  const { results_json, ...fields } = row;
  return renderedQualityReportInputSchema.extend({
    project_id: z.string(),
    created_at: z.string()
  }).parse({
    ...fields,
    results: JSON.parse(results_json)
  });
}
