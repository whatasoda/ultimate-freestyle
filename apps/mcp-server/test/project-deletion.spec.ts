import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import {
  createProject,
  deleteProject,
  getProject
} from "../src/projects/repository";
import { createEmptyProject } from "../src/projects/schema";
import { drainStorageDeletionOutbox } from "../src/storage/deletion";

describe("project deletion", () => {
  it("invalidates the project immediately and removes queued R2 objects", async () => {
    const ownerUserId = crypto.randomUUID();
    const now = "2026-08-01T05:00:00.000Z";
    await env.DB.prepare(
      `INSERT INTO users (id, twitch_user_id, twitch_login, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    )
      .bind(ownerUserId, ownerUserId, ownerUserId, now, now)
      .run();
    const created = await createProject(env.DB, {
      ownerUserId,
      idempotencyKey: crypto.randomUUID(),
      document: createEmptyProject("削除対象"),
      now: new Date(now)
    });
    const projectId = created.project.project_id;
    const assetId = crypto.randomUUID();
    const revisionId = crypto.randomUUID();
    const assetKey = `project-images/${assetId}.webp`;
    const revisionKey = `presentation-revisions/${ownerUserId}/${projectId}/${revisionId}.html`;
    await Promise.all([
      env.MEDIA_BUCKET.put(assetKey, new Uint8Array([1, 2, 3])),
      env.MEDIA_BUCKET.put(revisionKey, new Uint8Array([4, 5, 6]))
    ]);
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO project_assets (
           id, project_id, owner_user_id, object_key, original_filename,
           alt_text, mime_type, width, height, byte_size, created_at, updated_at
         ) VALUES (?, ?, ?, ?, 'image.png', '', 'image/webp', 1, 1, 3, ?, ?)`
      ).bind(assetId, projectId, ownerUserId, assetKey, now, now),
      env.DB.prepare(
        `INSERT INTO presentation_revisions (
           id, project_id, owner_user_id, project_version, object_key,
           content_hash, byte_size, created_at
         ) VALUES (?, ?, ?, 1, ?, ?, 3, ?)`
      ).bind(revisionId, projectId, ownerUserId, revisionKey, "a".repeat(64), now)
    ]);

    const deleted = await deleteProject(env.DB, {
      ownerUserId,
      projectId,
      expectedVersion: 1
    });
    expect(deleted).toEqual({
      projectId,
      queuedObjectDeletions: 2
    });
    expect(await getProject(env.DB, ownerUserId, projectId)).toBeNull();
    expect(await env.MEDIA_BUCKET.head(assetKey)).not.toBeNull();

    await expect(
      drainStorageDeletionOutbox({
        DB: env.DB,
        MEDIA_BUCKET: env.MEDIA_BUCKET
      })
    ).resolves.toEqual({ selected: 2, deleted: 2, failed: 0 });
    expect(await env.MEDIA_BUCKET.head(assetKey)).toBeNull();
    expect(await env.MEDIA_BUCKET.head(revisionKey)).toBeNull();
    const pending = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM storage_deletion_outbox WHERE project_id = ?"
    )
      .bind(projectId)
      .first<{ count: number }>();
    expect(pending?.count).toBe(0);
  });

  it("keeps the project and live objects on a version conflict", async () => {
    const ownerUserId = crypto.randomUUID();
    const now = "2026-08-01T06:00:00.000Z";
    await env.DB.prepare(
      `INSERT INTO users (id, twitch_user_id, twitch_login, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    )
      .bind(ownerUserId, ownerUserId, ownerUserId, now, now)
      .run();
    const created = await createProject(env.DB, {
      ownerUserId,
      idempotencyKey: crypto.randomUUID(),
      document: createEmptyProject("競合対象"),
      now: new Date(now)
    });

    await expect(
      deleteProject(env.DB, {
        ownerUserId,
        projectId: created.project.project_id,
        expectedVersion: 2
      })
    ).rejects.toMatchObject({
      code: "PROJECT_VERSION_CONFLICT",
      currentVersion: 1
    });
    expect(
      await getProject(env.DB, ownerUserId, created.project.project_id)
    ).not.toBeNull();
    const pending = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM storage_deletion_outbox WHERE project_id = ?"
    )
      .bind(created.project.project_id)
      .first<{ count: number }>();
    expect(pending?.count).toBe(0);
  });
});
