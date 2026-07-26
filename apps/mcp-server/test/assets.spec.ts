import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import {
  getProjectAsset,
  listProjectAssets
} from "../src/assets/repository";
import {
  readProjectImage,
  removeProjectImage,
  uploadProjectImage
} from "../src/assets/service";
import { createEmptyProject } from "../src/projects/schema";

const OWNER_ID = "asset-owner";
const OTHER_OWNER_ID = "asset-other";
const PROJECT_ID = "30000000-0000-4000-8000-000000000003";

function onePixelPng(): Uint8Array {
  const encoded =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  return Uint8Array.from(atob(encoded), (character) =>
    character.charCodeAt(0)
  );
}

beforeAll(async () => {
  const now = "2026-07-26T00:00:00.000Z";
  const project = createEmptyProject("画像テスト");
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO users (id, twitch_user_id, twitch_login, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
    ).bind(OWNER_ID, "asset-owner-twitch", "owner", now, now),
    env.DB.prepare(
      "INSERT INTO users (id, twitch_user_id, twitch_login, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
    ).bind(OTHER_OWNER_ID, "asset-other-twitch", "other", now, now),
    env.DB.prepare(
      `INSERT INTO research_projects (
         id, owner_user_id, title, stage, document_json, version,
         idempotency_key, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`
    ).bind(
      PROJECT_ID,
      OWNER_ID,
      project.title,
      project.stage,
      JSON.stringify(project),
      "asset-project",
      now,
      now
    )
  ]);
});

describe("project image service", () => {
  it("normalizes an image, stores only WebP in R2, and deletes it", async () => {
    const bytes = onePixelPng();
    const asset = await uploadProjectImage(
      new Request("https://example.test/upload", {
        method: "POST",
        headers: {
          "content-length": String(bytes.byteLength),
          "content-type": "image/png"
        },
        body: bytes
      }),
      env,
      {
        ownerUserId: OWNER_ID,
        projectId: PROJECT_ID,
        filename: "../observation.png",
        altText: "観察した1ピクセル"
      }
    );

    expect(asset.mime_type).toBe("image/webp");
    expect(asset.original_filename).toBe("observation.png");
    expect(asset.width).toBe(1);
    expect(asset.height).toBe(1);
    expect(asset.byte_size).toBeGreaterThan(0);
    expect(await listProjectAssets(env.DB, OWNER_ID, PROJECT_ID)).toEqual([
      asset
    ]);
    expect(await listProjectAssets(env.DB, OTHER_OWNER_ID, PROJECT_ID)).toEqual(
      []
    );

    const stored = await getProjectAsset(env.DB, OWNER_ID, asset.asset_id);
    expect(stored).not.toBeNull();
    expect(stored?.object_key).toMatch(/^project-images\/[0-9a-f-]+\.webp$/);
    const content = await readProjectImage(env, OWNER_ID, asset.asset_id);
    expect(content?.object.httpMetadata?.contentType).toBe("image/webp");
    expect(await readProjectImage(env, OTHER_OWNER_ID, asset.asset_id)).toBeNull();

    expect(await removeProjectImage(env, OWNER_ID, asset.asset_id)).toBe(true);
    expect(await getProjectAsset(env.DB, OWNER_ID, asset.asset_id)).toBeNull();
    expect(await env.MEDIA_BUCKET.get(stored?.object_key ?? "missing")).toBeNull();
  });

  it("rejects unsupported media before it reaches storage", async () => {
    await expect(
      uploadProjectImage(
        new Request("https://example.test/upload", {
          method: "POST",
          headers: { "content-type": "image/svg+xml" },
          body: "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>"
        }),
        env,
        {
          ownerUserId: OWNER_ID,
          projectId: PROJECT_ID,
          filename: "unsafe.svg",
          altText: ""
        }
      )
    ).rejects.toMatchObject({ code: "IMAGE_TYPE_UNSUPPORTED" });
    expect(await listProjectAssets(env.DB, OWNER_ID, PROJECT_ID)).toEqual([]);
  });
});
