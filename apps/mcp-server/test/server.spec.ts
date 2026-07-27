import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { createServer } from "../src/server";
import { createProjectAsset } from "../src/assets/repository";
import { projectRecordSchema } from "../src/projects/schema";

const eligibilityConfig = {
  DB: env.DB,
  MEDIA_BUCKET: env.MEDIA_BUCKET,
  TWITCH_BROADCASTER_ID: "67879379",
  TWITCH_BROADCASTER_LOGIN: "kashiwo",
  MIN_FOLLOW_DAYS: "30"
} as const;

describe("MCP contract", () => {
  it("advertises and executes the health tool", async () => {
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const server = createServer(eligibilityConfig);
    const client = new Client({ name: "contract-test", version: "0.1.0" });

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    try {
      const { tools } = await client.listTools();
      expect(tools).toContainEqual(
        expect.objectContaining({
          name: "health",
          annotations: expect.objectContaining({
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false
          })
        })
      );
      expect(tools.map((tool) => tool.name)).toEqual(
        expect.arrayContaining([
          "get_project_outline",
          "update_project_fields",
          "configure_deck",
          "upsert_presentation_template",
          "create_slide",
          "update_slide_fields",
          "set_slide_reveal",
          "set_slide_narration",
          "move_slide",
          "delete_slide"
        ])
      );
      expect(tools.map((tool) => tool.name)).not.toContain("update_project");
      expect(tools).toContainEqual(
        expect.objectContaining({
          name: "delete_project_image",
          annotations: expect.objectContaining({
            readOnlyHint: false,
            destructiveHint: true,
            idempotentHint: true,
            openWorldHint: false
          })
        })
      );

      const result = await client.callTool({ name: "health", arguments: {} });
      expect(result.structuredContent).toMatchObject({
        ok: true,
        service: "ultimate-freestyle-mcp",
        version: "0.5.0",
        eligibility: {
          broadcaster_id: "67879379",
          broadcaster_login: "kashiwo",
          min_follow_days: 30
        }
      });
      expect(result.content).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: "text" })
        ])
      );
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("provides the fixed research guide resource", async () => {
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const server = createServer(eligibilityConfig);
    const client = new Client({ name: "contract-test", version: "0.1.0" });

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    try {
      const { resources } = await client.listResources();
      expect(resources).toContainEqual(
        expect.objectContaining({ uri: "research://guide/overview" })
      );

      const result = await client.readResource({
        uri: "research://guide/overview"
      });
      expect(result.contents).toContainEqual(
        expect.objectContaining({
          uri: "research://guide/overview",
          mimeType: "text/markdown",
          text: expect.stringContaining("最自由研究 制作ガイド")
        })
      );
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("returns authenticated eligibility without exposing Twitch tokens", async () => {
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const server = createServer(eligibilityConfig, () => ({
      subject_id: "00112233-4455-4677-8899-aabbccddeeff",
      mcp_scopes: ["research:read"],
      identity: { user_id: "viewer-id", login: "viewer" },
      eligibility: {
        eligible: true,
        reason: "follow_duration",
        checked_at: "2026-07-26T12:00:00.000Z",
        expires_at: "2026-07-26T12:30:00.000Z",
        followed_at: "2020-01-01T00:00:00.000Z",
        follow_days: 2398,
        subscribed: false,
        override: null
      },
      twitch_tokens: {
        access_token: "must-not-leak",
        refresh_token: "must-not-leak",
        expires_at: "2026-07-26T13:00:00.000Z",
        scopes: ["user:read:follows", "user:read:subscriptions"]
      }
    }));
    const client = new Client({ name: "contract-test", version: "0.1.0" });

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    try {
      const result = await client.callTool({
        name: "get_access_status",
        arguments: {}
      });
      expect(result.structuredContent).toMatchObject({
        authenticated: true,
        access: {
          user: { id: "viewer-id", login: "viewer" },
          scopes: ["research:read"],
          eligibility: { eligible: true, reason: "follow_duration" }
        },
        error: null
      });
      expect(JSON.stringify(result)).not.toContain("must-not-leak");
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("creates, resumes, updates, and detects a project version conflict", async () => {
    const subjectId = "twitch-project-owner";
    const now = "2026-07-26T12:00:00.000Z";
    await env.DB.prepare(
      `INSERT OR IGNORE INTO users (
         id, twitch_user_id, twitch_login, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?)`
    )
      .bind(subjectId, "project-owner", "project-owner", now, now)
      .run();

    const authProps = {
      subject_id: subjectId,
      mcp_scopes: ["research:read", "research:write"],
      identity: { user_id: "project-owner", login: "project-owner" },
      eligibility: {
        eligible: true,
        reason: "subscriber",
        checked_at: "2026-07-26T12:00:00.000Z",
        expires_at: "2026-07-26T12:30:00.000Z",
        followed_at: null,
        follow_days: null,
        subscribed: true,
        override: null
      },
      twitch_tokens: {
        access_token: "not-returned",
        refresh_token: "not-returned",
        expires_at: "2026-07-26T13:00:00.000Z",
        scopes: ["user:read:follows", "user:read:subscriptions"]
      }
    };
    let activeAuthProps = authProps;
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const server = createServer(eligibilityConfig, () => activeAuthProps);
    const client = new Client({ name: "contract-test", version: "0.1.0" });

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    try {
      const firstCreate = await client.callTool({
        name: "create_project",
        arguments: {
          title: "記憶と泥団子の研究",
          idempotency_key: "project-contract-001"
        }
      });
      const firstProject = projectRecordSchema.parse(
        (firstCreate.structuredContent as { project?: unknown } | undefined)
          ?.project
      );
      expect(firstCreate.structuredContent).toMatchObject({
        ok: true,
        replayed: false,
        project: { version: 1 }
      });

      const replay = await client.callTool({
        name: "create_project",
        arguments: {
          title: "このタイトルは採用されない",
          idempotency_key: "project-contract-001"
        }
      });
      expect(replay.structuredContent).toMatchObject({
        ok: true,
        replayed: true,
        project: { project_id: firstProject.project_id, version: 1 }
      });

      const updatedQuestion = "子どもの頃の記憶だけで、どこまで丸く作れるか？";
      const update = await client.callTool({
        name: "update_project_fields",
        arguments: {
          project_id: firstProject.project_id,
          expected_version: 1,
          stage: "design",
          question: updatedQuestion
        }
      });
      expect(update.structuredContent).toMatchObject({
        ok: true,
        current_version: 2,
        project_id: firstProject.project_id,
        version: 2,
        changed: { kind: "fields_updated" }
      });

      const conflict = await client.callTool({
        name: "update_project_fields",
        arguments: {
          project_id: firstProject.project_id,
          expected_version: 1,
          summary: "競合して保存されない概要"
        }
      });
      expect(conflict.isError).toBe(true);
      expect(conflict.structuredContent).toMatchObject({
        ok: false,
        current_version: 2,
        error: { code: "PROJECT_VERSION_CONFLICT" }
      });

      const outline = await client.callTool({
        name: "get_project_outline",
        arguments: { project_id: firstProject.project_id }
      });
      expect(outline.structuredContent).toMatchObject({
        ok: true,
        outline: {
          project_id: firstProject.project_id,
          version: 2,
          has_deck: false,
          slides: []
        }
      });

      const list = await client.callTool({
        name: "list_projects",
        arguments: {}
      });
      expect(list.structuredContent).toMatchObject({
        ok: true,
        projects: [
          {
            project_id: firstProject.project_id,
            title: "記憶と泥団子の研究",
            stage: "design",
            version: 2
          }
        ]
      });
      expect(JSON.stringify(list)).not.toContain("not-returned");

      const assetId = "40000000-0000-4000-8000-000000000004";
      const objectKey = `project-images/${assetId}.webp`;
      await env.MEDIA_BUCKET.put(objectKey, new Uint8Array([1, 2, 3]), {
        httpMetadata: { contentType: "image/webp" }
      });
      await createProjectAsset(env.DB, {
        assetId,
        projectId: firstProject.project_id,
        ownerUserId: subjectId,
        objectKey,
        originalFilename: "evidence.png",
        altText: "実験結果",
        width: 16,
        height: 9,
        byteSize: 3
      });
      const images = await client.callTool({
        name: "list_project_images",
        arguments: { project_id: firstProject.project_id }
      });
      expect(images.structuredContent).toMatchObject({
        ok: true,
        images: [{ asset_id: assetId, alt_text: "実験結果" }]
      });
      const deletedImage = await client.callTool({
        name: "delete_project_image",
        arguments: { asset_id: assetId }
      });
      expect(deletedImage.structuredContent).toMatchObject({
        ok: true,
        deleted: true
      });
      expect(await env.MEDIA_BUCKET.get(objectKey)).toBeNull();

      const evaluation = await client.callTool({
        name: "evaluate_project",
        arguments: { project_id: firstProject.project_id }
      });
      expect(evaluation.structuredContent).toMatchObject({
        ok: true,
        project: { project_id: firstProject.project_id, version: 2 },
        rubric_markdown: expect.stringContaining("根拠不足は0ではなくNE")
      });

      const { resourceTemplates } = await client.listResourceTemplates();
      expect(resourceTemplates).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            uriTemplate: "research://projects/{id}"
          }),
          expect.objectContaining({
            uriTemplate: "research://projects/{id}/deck"
          })
        ])
      );
      const projectResource = await client.readResource({
        uri: `research://projects/${firstProject.project_id}`
      });
      expect(projectResource.contents).toContainEqual(
        expect.objectContaining({
          mimeType: "application/json",
          text: expect.stringContaining(updatedQuestion)
        })
      );

      const { prompts } = await client.listPrompts();
      expect(prompts.map((prompt) => prompt.name)).toEqual(
        expect.arrayContaining([
          "start_research",
          "review_research",
          "compose_presentation"
        ])
      );
      const reviewPrompt = await client.getPrompt({
        name: "review_research",
        arguments: { project_id: firstProject.project_id }
      });
      expect(reviewPrompt.messages[0]?.content).toMatchObject({
        type: "text",
        text: expect.stringContaining(firstProject.project_id)
      });

      const configured = await client.callTool({
        name: "configure_deck",
        arguments: {
          project_id: firstProject.project_id,
          expected_version: 2,
          short_title: "泥団子",
          layout: "biim"
        }
      });
      expect(configured.structuredContent).toMatchObject({ ok: true, version: 3 });
      const templated = await client.callTool({
        name: "upsert_presentation_template",
        arguments: {
          project_id: firstProject.project_id,
          expected_version: 3,
          template: {
            id: "mud-biim",
            name: "泥団子BIIM",
            region_layout: "sidebar-right",
            sidebar_width_percent: 32,
            background: "#132035",
            surface: "#08111f",
            foreground: "#f8fafc",
            muted: "#b8c6d9",
            accent: "#f2c14e",
            corner_radius_px: 8,
            spacing_scale: 1,
            font_scale: 1,
            enter_animation: "fade",
            reveal_animation: "rise"
          }
        }
      });
      expect(templated.structuredContent).toMatchObject({ ok: true, version: 4 });
      const createdSlide = await client.callTool({
        name: "create_slide",
        arguments: {
          project_id: firstProject.project_id,
          expected_version: 4,
          slide_id: "question",
          title: "研究の問い"
        }
      });
      expect(createdSlide.structuredContent).toMatchObject({ ok: true, version: 5 });
      const slideFields = await client.callTool({
        name: "update_slide_fields",
        arguments: {
          project_id: firstProject.project_id,
          expected_version: 5,
          slide_id: "question",
          template_id: "mud-biim",
          content_markdown: "# どこまで丸くできる？",
          sidebar_markdown: "読み上げない作者コメント"
        }
      });
      expect(slideFields.structuredContent).toMatchObject({ ok: true, version: 6 });
      const reveal = await client.callTool({
        name: "set_slide_reveal",
        arguments: {
          project_id: firstProject.project_id,
          expected_version: 6,
          slide_id: "question",
          at: 1,
          markdown: "- 記憶だけで作る"
        }
      });
      expect(reveal.structuredContent).toMatchObject({ ok: true, version: 7 });
      const narration = await client.callTool({
        name: "set_slide_narration",
        arguments: {
          project_id: firstProject.project_id,
          expected_version: 7,
          slide_id: "question",
          at: 0,
          text: "まず研究の問いを説明します。",
          display: "commentary"
        }
      });
      expect(narration.structuredContent).toMatchObject({ ok: true, version: 8 });
      const granularProject = await client.callTool({
        name: "get_project",
        arguments: { project_id: firstProject.project_id }
      });
      expect(granularProject.structuredContent).toMatchObject({
        ok: true,
        project: {
          version: 8,
          document: {
            deck: {
              templates: [{ id: "mud-biim" }],
              slides: [
                {
                  id: "question",
                  template_id: "mud-biim",
                  reveal_steps: 1,
                  narration: { segments: [{ at: 0 }] }
                }
              ]
            }
          }
        }
      });

      const otherSubjectId = "twitch-other-project-owner";
      await env.DB.prepare(
        `INSERT OR IGNORE INTO users (
           id, twitch_user_id, twitch_login, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?)`
      )
        .bind(otherSubjectId, "other-owner", "other-owner", now, now)
        .run();
      activeAuthProps = { ...authProps, subject_id: otherSubjectId };
      const crossOwnerRead = await client.callTool({
        name: "get_project",
        arguments: { project_id: firstProject.project_id }
      });
      expect(crossOwnerRead.isError).toBe(true);
      expect(crossOwnerRead.structuredContent).toMatchObject({
        ok: false,
        project: null,
        error: { code: "PROJECT_NOT_FOUND" }
      });
      expect(JSON.stringify(crossOwnerRead)).not.toContain(
        "記憶と泥団子の研究"
      );
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("rejects project reads without an authenticated scope", async () => {
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const server = createServer(eligibilityConfig);
    const client = new Client({ name: "contract-test", version: "0.1.0" });

    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const result = await client.callTool({
        name: "list_projects",
        arguments: {}
      });
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({
        ok: false,
        projects: [],
        error: { code: "AUTH_REQUIRED" }
      });
    } finally {
      await client.close();
      await server.close();
    }
  });
});
