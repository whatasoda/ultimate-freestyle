import type { ProjectRecord } from "../projects/schema";
import { flattenSlideReviewSources, resolveReviewAnchor } from "./flatten";
import {
  countReviewComments,
  createReviewComment,
  REVIEW_COMMENT_LIMIT,
  type ReviewComment,
  type ReviewCommentCreate
} from "./repository";

export type ReviewServiceErrorCode =
  | "SLIDE_NOT_FOUND"
  | "REVIEW_TARGET_NOT_FOUND"
  | "REVIEW_SELECTION_MISMATCH"
  | "REVIEW_COMMENT_LIMIT_REACHED";

export class ReviewServiceError extends Error {
  constructor(readonly code: ReviewServiceErrorCode, message: string) {
    super(message);
  }
}

export async function addSlideReviewComment(
  db: D1Database,
  ownerUserId: string,
  project: ProjectRecord,
  slideId: string,
  input: ReviewCommentCreate
): Promise<ReviewComment> {
  const slide = project.document.deck?.slides.find((item) => item.id === slideId);
  if (slide === undefined) {
    throw new ReviewServiceError("SLIDE_NOT_FOUND", "指定したスライドが見つかりません。");
  }
  if (await countReviewComments(db, ownerUserId, project.project_id) >= REVIEW_COMMENT_LIMIT) {
    throw new ReviewServiceError(
      "REVIEW_COMMENT_LIMIT_REACHED",
      `コメントは研究ごとに${REVIEW_COMMENT_LIMIT}件までです。解決済みの不要なコメントを削除してください。`
    );
  }

  const source = flattenSlideReviewSources(slide).find((item) => item.key === input.target_key);
  if (source === undefined) {
    throw new ReviewServiceError("REVIEW_TARGET_NOT_FOUND", "コメント対象の文章が現在のスライドにありません。");
  }
  if (input.range_start !== null && input.range_end !== null) {
    if (source.text.slice(input.range_start, input.range_end) !== input.selected_text) {
      throw new ReviewServiceError(
        "REVIEW_SELECTION_MISMATCH",
        "選択範囲と現在の文章が一致しません。画面を更新して選び直してください。"
      );
    }
  }
  const prefixStart = input.range_start === null ? 0 : Math.max(0, input.range_start - 80);
  const suffixEnd = input.range_end === null ? 0 : Math.min(source.text.length, input.range_end + 80);
  return createReviewComment(db, {
    owner_user_id: ownerUserId,
    project_id: project.project_id,
    slide_id: slideId,
    project_version: project.version,
    target_key: source.key,
    target_label: source.label,
    target_kind: source.kind,
    range_start: input.range_start,
    range_end: input.range_end,
    selected_text: input.selected_text,
    quote_prefix: input.range_start === null ? "" : source.text.slice(prefixStart, input.range_start),
    quote_suffix: input.range_end === null ? "" : source.text.slice(input.range_end, suffixEnd),
    body: input.body
  });
}

export function reviewCommentWithAnchor(
  project: ProjectRecord,
  comment: ReviewComment
): ReviewComment & { anchor: ReturnType<typeof resolveReviewAnchor> } {
  const slide = project.document.deck?.slides.find((item) => item.id === comment.slide_id);
  const source = slide === undefined
    ? undefined
    : flattenSlideReviewSources(slide).find((item) => item.key === comment.target_key);
  return {
    ...comment,
    anchor: resolveReviewAnchor(
      source?.text ?? null,
      comment.range_start,
      comment.range_end,
      comment.selected_text
    )
  };
}

export function buildReviewRepairInstruction(
  project: ProjectRecord,
  comments: ReviewComment[]
): string {
  const openComments = comments.filter((comment) => comment.status === "open").slice(0, 20);
  const lines = openComments.map((comment, index) => {
    const anchored = reviewCommentWithAnchor(project, comment);
    const location = comment.selected_text.length > 0
      ? `選択文「${comment.selected_text.replaceAll("\n", " ").slice(0, 500)}」`
      : "対象全体";
    return `${index + 1}. [${comment.id}] スライド ${comment.slide_id} / ${comment.target_label} / ${location} / アンカー: ${anchored.anchor.state}\n   指摘: ${comment.body}`;
  });
  return `research://projects/${project.project_id}/review-comments のレビューを反映してください。

対象研究: ${project.document.title}
現在version: ${project.version}

今回反映するコメント:
${lines.join("\n")}

進め方:
1. get_project_outline と対象スライドresourceを読み、現在versionと現在の文章を確認する。
2. 各コメントの意図を保ち、既存の小粒度MCP toolで該当項目だけを編集する。
3. アンカーが stale のコメントは推測で編集せず、利用者へ確認する。moved は現在位置を再確認する。
4. コメントに書かれていない内容、他のスライド、研究結果を勝手に変更しない。
5. 各変更後に返るversionを次の expected_version に使い、最後に変更内容と未対応コメントを報告する。
6. コメントの解決状態は自動変更しない。利用者がレビュー画面で確認して解決する。`;
}
