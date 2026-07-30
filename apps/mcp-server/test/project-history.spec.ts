import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import {
  createProject,
  listProjectDraftRevisions,
  mutateProject,
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
});
