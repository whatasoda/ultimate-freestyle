import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import {
  createProject,
  listProjectDraftRevisions,
  mutateProject,
  PROJECT_DRAFT_REVISION_BYTE_BUDGET,
  PROJECT_DRAFT_REVISION_MINIMUM,
  restoreProjectDraftRevision
} from "../src/projects/repository";
import { createEmptyProject } from "../src/projects/schema";

describe("project draft history", () => {
  it("keeps versions and restores an old draft as a new version", async () => {
    const ownerUserId = "draft-history-owner";
    const now = "2026-07-30T05:00:00.000Z";
    await env.DB.prepare(
      `INSERT INTO users (id, twitch_user_id, twitch_login, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(ownerUserId, ownerUserId, ownerUserId, now, now).run();

    const created = await createProject(env.DB, {
      ownerUserId,
      idempotencyKey: "draft-history-project",
      document: createEmptyProject("最初の題名"),
      now: new Date(now)
    });
    const projectId = created.project.project_id;
    const version2 = await mutateProject(env.DB, {
      ownerUserId,
      projectId,
      expectedVersion: 1,
      mutate: (document) => { document.title = "二回目の題名"; }
    });
    await mutateProject(env.DB, {
      ownerUserId,
      projectId,
      expectedVersion: version2.version,
      mutate: (document) => { document.summary = "削除前の内容"; }
    });

    expect(await listProjectDraftRevisions(env.DB, ownerUserId, projectId)).toMatchObject([
      { version: 3, title: "二回目の題名", source: "edit" },
      { version: 2, title: "二回目の題名", source: "edit" },
      { version: 1, title: "最初の題名", source: "created" }
    ]);

    const restored = await restoreProjectDraftRevision(env.DB, {
      ownerUserId,
      projectId,
      expectedVersion: 3,
      targetVersion: 1
    });
    expect(restored).toMatchObject({
      version: 4,
      document: { title: "最初の題名", summary: "" }
    });
    expect((await listProjectDraftRevisions(env.DB, ownerUserId, projectId))[0]).toMatchObject({
      version: 4,
      title: "最初の題名",
      source: "restore"
    });
  });

  it("keeps recent versions while pruning history beyond the byte budget", async () => {
    const ownerUserId = "draft-history-budget-owner";
    const now = "2026-07-30T06:00:00.000Z";
    await env.DB.prepare(
      `INSERT INTO users (id, twitch_user_id, twitch_login, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(ownerUserId, ownerUserId, ownerUserId, now, now).run();
    const document = createEmptyProject("容量上限の研究");
    const created = await createProject(env.DB, {
      ownerUserId,
      idempotencyKey: "draft-history-budget-project",
      document,
      now: new Date(now)
    });
    const largeDocument = JSON.stringify({
      ...document,
      summary: "x".repeat(480 * 1024)
    });
    await env.DB.batch(
      Array.from({ length: 19 }, (_, index) => env.DB.prepare(
        `INSERT INTO project_draft_revisions (
           project_id, owner_user_id, version, document_json, source, created_at
         ) VALUES (?, ?, ?, ?, 'edit', ?)`
      ).bind(created.project.project_id, ownerUserId, index + 2, largeDocument, now))
    );
    await env.DB.prepare(
      "UPDATE research_projects SET version = 20 WHERE id = ? AND owner_user_id = ?"
    ).bind(created.project.project_id, ownerUserId).run();

    const updated = await mutateProject(env.DB, {
      ownerUserId,
      projectId: created.project.project_id,
      expectedVersion: 20,
      mutate: (draft) => { draft.summary = "最新の小さな変更"; }
    });
    expect(updated.version).toBe(21);
    const storage = await env.DB.prepare(
      `SELECT COUNT(*) AS count, SUM(LENGTH(CAST(document_json AS BLOB))) AS bytes,
              MIN(version) AS oldest_version, MAX(version) AS newest_version
       FROM project_draft_revisions
       WHERE project_id = ? AND owner_user_id = ?`
    ).bind(created.project.project_id, ownerUserId).first<{
      count: number;
      bytes: number;
      oldest_version: number;
      newest_version: number;
    }>();
    expect(storage?.count).toBeGreaterThanOrEqual(PROJECT_DRAFT_REVISION_MINIMUM);
    expect(storage?.count).toBeLessThan(21);
    expect(storage?.bytes).toBeLessThanOrEqual(PROJECT_DRAFT_REVISION_BYTE_BUDGET);
    expect(storage?.oldest_version).toBeGreaterThan(1);
    expect(storage?.newest_version).toBe(21);
  });
});
