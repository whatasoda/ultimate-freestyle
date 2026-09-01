import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import {
  createProject,
  MAX_PROJECT_DOCUMENT_BYTES,
  mutateProject,
  projectDocumentBytes
} from "../src/projects/repository";
import { createEmptyProject } from "../src/projects/schema";

describe("project document size limits", () => {
  it("rejects oversized documents on create and update with byte details", async () => {
    const ownerUserId = "project-size-owner";
    const now = "2026-07-30T07:00:00.000Z";
    await env.DB.prepare(
      `INSERT INTO users (id, twitch_user_id, twitch_login, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(ownerUserId, ownerUserId, ownerUserId, now, now).run();
    const oversized = createEmptyProject("容量超過");
    oversized.deck = {
      short_title: "容量超過",
      description: "",
      author: "研究者",
      year: 2026,
      accent: "#ffcf32",
      layout: "cinematic" as const,
      narration_defaults: null,
      slides: Array.from({ length: 30 }, (_, index) => ({
        id: `slide-${index}`,
        title: `スライド${index}`,
        duration_seconds: 30,
        reveal_steps: 0,
        tone: "dark" as const,
        content_markdown: "観".repeat(20_000),
        reveal_blocks: [],
        sidebar_markdown: null,
        narration: null
      }))
    };
    const proposedBytes = projectDocumentBytes(oversized);
    expect(proposedBytes).toBeGreaterThan(MAX_PROJECT_DOCUMENT_BYTES);
    await expect(createProject(env.DB, {
      ownerUserId,
      idempotencyKey: "oversized-create",
      document: oversized
    })).rejects.toMatchObject({
      code: "PROJECT_TOO_LARGE",
      size: {
        current_bytes: null,
        proposed_bytes: proposedBytes,
        limit_bytes: MAX_PROJECT_DOCUMENT_BYTES,
        exceeded_by_bytes: proposedBytes - MAX_PROJECT_DOCUMENT_BYTES
      }
    });
    expect((await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM research_projects WHERE owner_user_id = ?"
    ).bind(ownerUserId).first<{ count: number }>())?.count).toBe(0);

    const created = await createProject(env.DB, {
      ownerUserId,
      idempotencyKey: "size-update",
      document: createEmptyProject("更新前")
    });
    const currentBytes = projectDocumentBytes(created.project.document);
    await expect(mutateProject(env.DB, {
      ownerUserId,
      projectId: created.project.project_id,
      expectedVersion: 1,
      mutate: (document) => { document.deck = oversized.deck; }
    })).rejects.toMatchObject({
      code: "PROJECT_TOO_LARGE",
      size: { current_bytes: currentBytes, proposed_bytes: expect.any(Number) }
    });
    const unchanged = await env.DB.prepare(
      "SELECT version, document_json FROM research_projects WHERE id = ?"
    ).bind(created.project.project_id).first<{ version: number; document_json: string }>();
    expect(unchanged?.version).toBe(1);
    expect(JSON.parse(unchanged!.document_json).deck).toBeNull();
  });
});
