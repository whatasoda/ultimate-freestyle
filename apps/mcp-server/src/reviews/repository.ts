import { z } from "zod";

import type { ReviewSourceKind } from "./flatten";

export const REVIEW_COMMENT_BODY_MAX = 4_000;
export const REVIEW_SELECTED_TEXT_MAX = 2_000;
export const REVIEW_COMMENT_LIMIT = 200;

export const reviewCommentCreateSchema = z
  .object({
    target_key: z.string().min(1).max(180),
    range_start: z.number().int().min(0).max(20_000).nullable(),
    range_end: z.number().int().min(0).max(20_000).nullable(),
    selected_text: z.string().max(REVIEW_SELECTED_TEXT_MAX),
    body: z.string().trim().min(1).max(REVIEW_COMMENT_BODY_MAX)
  })
  .superRefine((value, context) => {
    const whole = value.range_start === null && value.range_end === null;
    if (whole && value.selected_text !== "") {
      context.addIssue({ code: "custom", path: ["selected_text"], message: "A whole-source comment cannot include selected text." });
    }
    if (!whole && (value.range_start === null || value.range_end === null || value.range_end <= value.range_start || value.selected_text.length === 0)) {
      context.addIssue({ code: "custom", path: ["range_end"], message: "A text selection requires a valid non-empty range." });
    }
  });

export const reviewCommentStatusSchema = z.object({
  status: z.enum(["open", "resolved"])
});

export type ReviewCommentCreate = z.infer<typeof reviewCommentCreateSchema>;

export type ReviewComment = {
  id: string;
  project_id: string;
  slide_id: string;
  project_version: number;
  target_key: string;
  target_label: string;
  target_kind: ReviewSourceKind;
  range_start: number | null;
  range_end: number | null;
  selected_text: string;
  quote_prefix: string;
  quote_suffix: string;
  body: string;
  status: "open" | "resolved";
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

type ReviewCommentRow = ReviewComment;

export async function countReviewComments(
  db: D1Database,
  ownerUserId: string,
  projectId: string
): Promise<number> {
  const row = await db.prepare(
    "SELECT COUNT(*) AS count FROM slide_review_comments WHERE owner_user_id = ? AND project_id = ?"
  ).bind(ownerUserId, projectId).first<{ count: number }>();
  return row?.count ?? 0;
}

export async function createReviewComment(
  db: D1Database,
  input: Omit<ReviewComment, "id" | "status" | "created_at" | "updated_at" | "resolved_at"> & { owner_user_id: string },
  now = new Date().toISOString()
): Promise<ReviewComment> {
  const id = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO slide_review_comments (
       id, project_id, owner_user_id, slide_id, project_version, target_key,
       target_label, target_kind, range_start, range_end, selected_text,
       quote_prefix, quote_suffix, body, status, created_at, updated_at, resolved_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, NULL)`
  ).bind(
    id,
    input.project_id,
    input.owner_user_id,
    input.slide_id,
    input.project_version,
    input.target_key,
    input.target_label,
    input.target_kind,
    input.range_start,
    input.range_end,
    input.selected_text,
    input.quote_prefix,
    input.quote_suffix,
    input.body,
    now,
    now
  ).run();
  return {
    id,
    project_id: input.project_id,
    slide_id: input.slide_id,
    project_version: input.project_version,
    target_key: input.target_key,
    target_label: input.target_label,
    target_kind: input.target_kind,
    range_start: input.range_start,
    range_end: input.range_end,
    selected_text: input.selected_text,
    quote_prefix: input.quote_prefix,
    quote_suffix: input.quote_suffix,
    body: input.body,
    status: "open" as const,
    created_at: now,
    updated_at: now,
    resolved_at: null
  };
}

export async function listReviewComments(
  db: D1Database,
  ownerUserId: string,
  projectId: string,
  options: { slideId?: string; status?: "open" | "resolved"; limit?: number; offset?: number } = {}
): Promise<ReviewComment[]> {
  const where = ["owner_user_id = ?", "project_id = ?"];
  const bindings: unknown[] = [ownerUserId, projectId];
  if (options.slideId !== undefined) {
    where.push("slide_id = ?");
    bindings.push(options.slideId);
  }
  if (options.status !== undefined) {
    where.push("status = ?");
    bindings.push(options.status);
  }
  const limit = Math.min(REVIEW_COMMENT_LIMIT, Math.max(1, options.limit ?? 50));
  const offset = Math.max(0, options.offset ?? 0);
  const result = await db.prepare(
    `SELECT id, project_id, slide_id, project_version, target_key,
            target_label, target_kind, range_start, range_end, selected_text,
            quote_prefix, quote_suffix, body, status, created_at, updated_at, resolved_at
     FROM slide_review_comments
     WHERE ${where.join(" AND ")}
     ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END, created_at DESC
     LIMIT ? OFFSET ?`
  ).bind(...bindings, limit, offset).all<ReviewCommentRow>();
  return result.results;
}

export async function getReviewComment(
  db: D1Database,
  ownerUserId: string,
  projectId: string,
  commentId: string
): Promise<ReviewComment | null> {
  const row = await db.prepare(
    `SELECT id, project_id, slide_id, project_version, target_key,
            target_label, target_kind, range_start, range_end, selected_text,
            quote_prefix, quote_suffix, body, status, created_at, updated_at, resolved_at
     FROM slide_review_comments
     WHERE id = ? AND project_id = ? AND owner_user_id = ?`
  ).bind(commentId, projectId, ownerUserId).first<ReviewCommentRow>();
  if (row === null) return null;
  return row;
}

export async function setReviewCommentStatus(
  db: D1Database,
  ownerUserId: string,
  projectId: string,
  commentId: string,
  status: "open" | "resolved",
  now = new Date().toISOString()
): Promise<ReviewComment | null> {
  await db.prepare(
    `UPDATE slide_review_comments
     SET status = ?, updated_at = ?, resolved_at = CASE WHEN ? = 'resolved' THEN ? ELSE NULL END
     WHERE id = ? AND project_id = ? AND owner_user_id = ?`
  ).bind(status, now, status, now, commentId, projectId, ownerUserId).run();
  return getReviewComment(db, ownerUserId, projectId, commentId);
}

export async function deleteReviewComment(
  db: D1Database,
  ownerUserId: string,
  projectId: string,
  commentId: string
): Promise<boolean> {
  const result = await db.prepare(
    "DELETE FROM slide_review_comments WHERE id = ? AND project_id = ? AND owner_user_id = ?"
  ).bind(commentId, projectId, ownerUserId).run();
  return (result.meta.changes ?? 0) > 0;
}
