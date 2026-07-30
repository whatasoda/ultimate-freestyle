import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { createProject } from "../src/projects/repository";
import { createEmptyProject } from "../src/projects/schema";
import {
  flattenSlideReviewSources,
  resolveReviewAnchor
} from "../src/reviews/flatten";
import {
  deleteReviewComment,
  listReviewComments,
  setReviewCommentStatus
} from "../src/reviews/repository";
import {
  addSlideReviewComment,
  buildReviewRepairInstruction,
  reviewCommentWithAnchor
} from "../src/reviews/service";

function reviewDocument() {
  const document = createEmptyProject("レビュー機能テスト");
  document.deck = {
    short_title: "レビュー",
    description: "",
    author: "tester",
    year: 2026,
    accent: "#9d7bff",
    layout: "minimal",
    narration_defaults: null,
    slides: [
      {
        id: "intro",
        title: "氷が溶ける順番",
        duration_seconds: 30,
        reveal_steps: 1,
        tone: "light",
        content_markdown: "# 結論\n金属の上が最も速い",
        reveal_blocks: [{ at: 1, markdown: "木と布も比較する" }],
        sidebar_markdown: "室温は24度",
        narration: {
          display: "dialogue",
          speaker: "ずんだもん",
          segments: [
            { at: 0, text: "三つの素材で比べます。", audio_src: null, voice_tuning: null },
            { at: 1, text: "金属が最も速いと予想しました。", audio_src: null, voice_tuning: null }
          ]
        }
      }
    ]
  };
  return document;
}

describe("slide review comments", () => {
  it("flattens screen text and narration into stable differentiated sources", () => {
    const slide = reviewDocument().deck?.slides[0];
    if (slide === undefined) throw new Error("fixture slide missing");
    const sources = flattenSlideReviewSources(slide);
    expect(sources).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "slide:content", kind: "content", label: "画面の本文" }),
      expect.objectContaining({ key: "slide:sidebar", kind: "content", label: "読み上げない補足" }),
      expect.objectContaining({ key: "narration:0", kind: "narration", text: "三つの素材で比べます。" })
    ]));
  });

  it("keeps an exact range, re-finds a uniquely moved quote, and rejects ambiguity", () => {
    expect(resolveReviewAnchor("金属が最も速い", 0, 2, "金属")).toEqual({ state: "current", start: 0, end: 2 });
    expect(resolveReviewAnchor("予想では金属が最も速い", 0, 2, "金属")).toEqual({ state: "moved", start: 4, end: 6 });
    expect(resolveReviewAnchor("金属と金属", 20, 22, "金属")).toEqual({ state: "stale", start: null, end: null });
  });

  it("validates ranges against current project text and manages status without bumping project version", async () => {
    const ownerId = "review-test-owner";
    const now = "2026-07-30T10:00:00.000Z";
    await env.DB.prepare(
      "INSERT INTO users (id, twitch_user_id, twitch_login, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
    ).bind(ownerId, "review-test-twitch", "reviewer", now, now).run();
    const { project } = await createProject(env.DB, {
      ownerUserId: ownerId,
      idempotencyKey: "review-comment-test",
      document: reviewDocument(),
      now: new Date(now)
    });
    const source = "# 結論\n金属の上が最も速い";
    const selected = "金属の上";
    const start = source.indexOf(selected);
    const comment = await addSlideReviewComment(env.DB, ownerId, project, "intro", {
      target_key: "slide:content",
      range_start: start,
      range_end: start + selected.length,
      selected_text: selected,
      body: "この結論の根拠を一文で補ってください。"
    });
    expect(comment.project_version).toBe(1);
    expect(await listReviewComments(env.DB, ownerId, project.project_id)).toContainEqual(
      expect.objectContaining({ id: comment.id, status: "open", selected_text: selected })
    );
    await expect(addSlideReviewComment(env.DB, ownerId, project, "intro", {
      target_key: "slide:content",
      range_start: start,
      range_end: start + selected.length,
      selected_text: "一致しない文字",
      body: "保存されないコメント"
    })).rejects.toMatchObject({ code: "REVIEW_SELECTION_MISMATCH" });

    const resolved = await setReviewCommentStatus(env.DB, ownerId, project.project_id, comment.id, "resolved", now);
    expect(resolved?.status).toBe("resolved");
    expect(await deleteReviewComment(env.DB, "different-owner", project.project_id, comment.id)).toBe(false);
    expect(await deleteReviewComment(env.DB, ownerId, project.project_id, comment.id)).toBe(true);
  });

  it("generates a bounded repair instruction and marks moved selections", async () => {
    const ownerId = "review-instruction-owner";
    const now = "2026-07-30T11:00:00.000Z";
    await env.DB.prepare(
      "INSERT INTO users (id, twitch_user_id, twitch_login, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
    ).bind(ownerId, "review-instruction-twitch", "instruction", now, now).run();
    const { project } = await createProject(env.DB, {
      ownerUserId: ownerId,
      idempotencyKey: "review-instruction-test",
      document: reviewDocument(),
      now: new Date(now)
    });
    const selected = "金属の上";
    const start = project.document.deck?.slides[0]?.content_markdown.indexOf(selected) ?? -1;
    const comment = await addSlideReviewComment(env.DB, ownerId, project, "intro", {
      target_key: "slide:content",
      range_start: start,
      range_end: start + selected.length,
      selected_text: selected,
      body: "条件を具体化する"
    });
    const movedProject = structuredClone(project);
    const movedSlide = movedProject.document.deck?.slides[0];
    if (movedSlide === undefined) throw new Error("fixture slide missing");
    movedSlide.content_markdown = `前置き\n${movedSlide.content_markdown}`;
    expect(reviewCommentWithAnchor(movedProject, comment).anchor.state).toBe("moved");
    const instruction = buildReviewRepairInstruction(movedProject, [comment]);
    expect(instruction).toContain(`research://projects/${project.project_id}/review-comments`);
    expect(instruction).toContain("アンカー: moved");
    expect(instruction).toContain("コメントの解決状態は自動変更しない");
  });
});
