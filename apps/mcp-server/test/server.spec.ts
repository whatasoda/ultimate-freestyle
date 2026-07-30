import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { createServer } from "../src/server";
import { createProjectAsset } from "../src/assets/repository";
import { projectSummarySchema } from "../src/projects/schema";

async function readJsonResource(client: Client, uri: string): Promise<unknown> {
  const resource = await client.readResource({ uri });
  const content = resource.contents[0];
  if (content === undefined || !("text" in content)) {
    throw new Error(`Text resource not found: ${uri}`);
  }
  return JSON.parse(content.text);
}

const eligibilityConfig = {
  DB: env.DB,
  MEDIA_BUCKET: env.MEDIA_BUCKET,
  VOICE_JOBS_QUEUE: env.VOICE_JOBS_QUEUE,
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
          "upsert_voicevox_profile",
          "update_voicevox_profile_tuning",
          "set_slide_canvas",
          "upsert_slide_block",
          "delete_slide_block",
          "set_slide_scene",
          "upsert_slide_layout_component",
          "upsert_slide_text_component",
          "upsert_slide_info_component",
          "upsert_slide_data_component",
          "upsert_slide_media_component",
          "delete_slide_component",
          "update_project_fields",
          "configure_deck",
          "configure_deck_narration",
          "create_presentation_template",
          "update_presentation_template_fields",
          "create_slide",
          "update_slide_fields",
          "update_slide_typography",
          "set_slide_reveal",
          "set_slide_narration",
          "configure_slide_narration",
          "update_slide_narration_voice",
          "get_voice_generation_status",
          "generate_voice_audio",
          "move_slide",
          "delete_slide"
        ])
      );
      expect(tools.map((tool) => tool.name)).not.toContain("update_project");
      expect(tools.map((tool) => tool.name)).not.toContain("get_project");
      expect(tools.map((tool) => tool.name)).not.toContain("get_project_slide");
      expect(tools.map((tool) => tool.name)).not.toContain("evaluate_project");
      const largestInputSchema = Math.max(
        ...tools.map((tool) => JSON.stringify(tool.inputSchema).length)
      );
      expect(largestInputSchema).toBeLessThan(12_000);
      expect(tools.length).toBeLessThanOrEqual(38);
      expect(JSON.stringify(tools).length).toBeLessThan(160_000);
      const narrationTool = tools.find(
        (tool) => tool.name === "set_slide_narration"
      );
      expect(
        (narrationTool?.inputSchema as { properties?: object }).properties
      ).not.toHaveProperty("audio_src");
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
      expect(tools).toContainEqual(
        expect.objectContaining({
          name: "generate_voice_audio",
          annotations: expect.objectContaining({
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false
          })
        })
      );

      const result = await client.callTool({ name: "health", arguments: {} });
      expect(result.structuredContent).toMatchObject({
        ok: true,
        service: "ultimate-freestyle-mcp",
        version: "0.14.0",
        renderer_version: "uf-renderer@51",
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
      expect(resources).toContainEqual(
        expect.objectContaining({
          uri: "research://guide/presentation-components"
        })
      );
      expect(resources).toContainEqual(
        expect.objectContaining({
          uri: "research://guide/presentation-style"
        })
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
      expect(result.contents).toContainEqual(
        expect.objectContaining({
          text: expect.stringContaining("3. `list_projects`で本人の研究一覧を取得する")
        })
      );
      expect(result.contents).toContainEqual(
        expect.objectContaining({
          text: expect.not.stringContaining("保存機能はまだありません")
        })
      );

      const componentGuide = await client.readResource({
        uri: "research://guide/presentation-components"
      });
      expect(componentGuide.contents).toContainEqual(
        expect.objectContaining({
          mimeType: "text/markdown",
          text: expect.stringContaining("upsert_slide_layout_component")
        })
      );
      const styleGuide = await client.readResource({
        uri: "research://guide/presentation-style"
      });
      expect(styleGuide.contents).toContainEqual(
        expect.objectContaining({
          mimeType: "text/markdown",
          text: expect.stringContaining("configure_presentation_stage")
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
      const firstProject = projectSummarySchema.parse(
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
          aspect_ratio: null,
          total_duration_seconds: 0,
          within_submission_limit: false,
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
            version: 2,
            has_presentation: false,
            slide_count: 0,
            total_duration_seconds: 0
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

      const evaluationGuide = await client.readResource({
        uri: "research://guide/evaluation"
      });
      expect(evaluationGuide.contents).toContainEqual(
        expect.objectContaining({
          text: expect.stringContaining("根拠不足は0ではなくNE")
        })
      );

      const { resourceTemplates } = await client.listResourceTemplates();
      expect(resourceTemplates).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            uriTemplate: "research://projects/{id}"
          }),
          expect.objectContaining({
            uriTemplate: "research://projects/{id}/deck"
          }),
          expect.objectContaining({
            uriTemplate: "research://projects/{id}/slides/{slideId}"
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
        name: "create_presentation_template",
        arguments: {
          project_id: firstProject.project_id,
          expected_version: 3,
          template_id: "mud-biim",
          name: "泥団子BIIM",
          visual_preset: "studio"
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
      const presentationOutline = await client.callTool({
        name: "get_project_outline",
        arguments: { project_id: firstProject.project_id }
      });
      expect(presentationOutline.structuredContent).toMatchObject({
        ok: true,
        outline: {
          aspect_ratio: "16:9",
          total_duration_seconds: 60,
          within_submission_limit: true,
          slides: [
            {
              id: "question",
              role: "content",
              duration_seconds: 60,
              reveal_steps: 1,
              composition_mode: "flow",
              narration_segments: 1
            }
          ]
        }
      });
      const granularProject = await readJsonResource(
        client,
        `research://projects/${firstProject.project_id}`
      );
      expect(granularProject).toMatchObject({
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

      const canvas = await client.callTool({
        name: "set_slide_canvas",
        arguments: {
          project_id: firstProject.project_id,
          expected_version: 8,
          slide_id: "question",
          enabled: true,
          background: "#101828"
        }
      });
      expect(canvas.structuredContent).toMatchObject({ ok: true, version: 9 });
      const block = await client.callTool({
        name: "upsert_slide_block",
        arguments: {
          project_id: firstProject.project_id,
          expected_version: 9,
          slide_id: "question",
          block: {
            id: "central-question",
            kind: "markdown",
            frame: { x: 12, y: 18, width: 76, height: 46 },
            z_index: 10,
            at: 0,
            animation: "zoom",
            markdown: "# どこまで丸くできる？",
            style: {
              text_align: "center",
              vertical_align: "center",
              font_scale: 1.3
            }
          }
        }
      });
      expect(block.structuredContent).toMatchObject({ ok: true, version: 10 });
      const canvasSlide = await readJsonResource(
        client,
        `research://projects/${firstProject.project_id}/slides/question`
      );
      expect(canvasSlide).toMatchObject({
        ok: true,
        version: 10,
        slide: {
          composition: {
            mode: "canvas",
            background: "#101828",
            blocks: [{ id: "central-question", kind: "markdown" }]
          }
        }
      });

      const scene = await client.callTool({
        name: "set_slide_scene",
        arguments: {
          project_id: firstProject.project_id,
          expected_version: 10,
          slide_id: "question",
          enabled: true,
          background: "#11100e"
        }
      });
      expect(scene.structuredContent).toMatchObject({ ok: true, version: 11 });
      const layoutComponent = await client.callTool({
        name: "upsert_slide_layout_component",
        arguments: {
          project_id: firstProject.project_id,
          expected_version: 11,
          slide_id: "question",
          component: {
            id: "result-stack",
            kind: "stack",
            parent_id: null,
            order: 0,
            at: 0,
            animation: "none",
            frame: null,
            direction: "column",
            gap_px: 24,
            align: "stretch",
            justify: "center",
            wrap: false
          }
        }
      });
      expect(layoutComponent.structuredContent).toMatchObject({
        ok: true,
        version: 12
      });
      const infoComponent = await client.callTool({
        name: "upsert_slide_info_component",
        arguments: {
          project_id: firstProject.project_id,
          expected_version: 12,
          slide_id: "question",
          component: {
            id: "trial-count",
            kind: "metric",
            parent_id: "result-stack",
            order: 0,
            at: 1,
            animation: "zoom",
            frame: null,
            value: "12",
            unit: "回",
            caption: "試した回数",
            emphasis: "signal"
          }
        }
      });
      expect(infoComponent.structuredContent).toMatchObject({
        ok: true,
        version: 13
      });
      const dataComponent = await client.callTool({
        name: "upsert_slide_data_component",
        arguments: {
          project_id: firstProject.project_id,
          expected_version: 13,
          slide_id: "question",
          component: {
            id: "comparison",
            kind: "bar_chart",
            parent_id: "result-stack",
            order: 1,
            at: 1,
            animation: "rise",
            frame: null,
            max_value: 100,
            items: [
              { id: "before", at: 1, label: "変更前", value: 42, color: null },
              { id: "after", at: 2, label: "変更後", value: 91, color: "#ffcf32" }
            ]
          }
        }
      });
      expect(dataComponent.structuredContent).toMatchObject({
        ok: true,
        version: 14
      });
      const sceneSlide = await readJsonResource(
        client,
        `research://projects/${firstProject.project_id}/slides/question`
      );
      expect(sceneSlide).toMatchObject({
        ok: true,
        version: 14,
        slide: {
          reveal_steps: 2,
          composition: {
            mode: "scene",
            runtime_version: "uf-runtime@1",
            nodes: [
              { id: "result-stack", kind: "stack" },
              { id: "trial-count", kind: "metric" },
              { id: "comparison", kind: "bar_chart" }
            ]
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
      const crossOwnerRead = await readJsonResource(
        client,
        `research://projects/${firstProject.project_id}`
      );
      expect(crossOwnerRead).toMatchObject({
        ok: false,
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

  it("updates presentation appearance and voice settings with granular versioned tools", async () => {
    const subjectId = "presentation-settings-owner";
    const now = "2026-07-28T12:00:00.000Z";
    await env.DB.prepare(
      `INSERT OR IGNORE INTO users (
         id, twitch_user_id, twitch_login, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?)`
    )
      .bind(subjectId, subjectId, subjectId, now, now)
      .run();

    const authProps = {
      subject_id: subjectId,
      mcp_scopes: ["research:read", "research:write"],
      identity: { user_id: subjectId, login: subjectId },
      eligibility: {
        eligible: true,
        reason: "subscriber",
        checked_at: now,
        expires_at: "2026-07-28T12:30:00.000Z",
        followed_at: null,
        follow_days: null,
        subscribed: true,
        override: null
      },
      twitch_tokens: {
        access_token: "not-returned",
        refresh_token: "not-returned",
        expires_at: "2026-07-28T13:00:00.000Z",
        scopes: []
      }
    };
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const server = createServer(eligibilityConfig, () => authProps);
    const client = new Client({ name: "settings-test", version: "0.1.0" });

    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const created = await client.callTool({
        name: "create_project",
        arguments: {
          title: "見た目と声の研究",
          idempotency_key: "presentation-settings-contract-001"
        }
      });
      const project = projectSummarySchema.parse(
        (created.structuredContent as { project?: unknown } | undefined)
          ?.project
      );
      const projectId = project.project_id;

      await client.callTool({
        name: "configure_deck",
        arguments: { project_id: projectId, expected_version: 1 }
      });
      const template = await client.callTool({
        name: "create_presentation_template",
        arguments: {
          project_id: projectId,
          expected_version: 2,
          template_id: "research-paper",
          name: "研究ノート",
          visual_preset: "paper",
          make_default: true
        }
      });
      expect(template.structuredContent).toMatchObject({ ok: true, version: 3 });

      const conflict = await client.callTool({
        name: "update_presentation_template_fields",
        arguments: {
          project_id: projectId,
          expected_version: 2,
          template_id: "research-paper",
          heading_font: "mincho"
        }
      });
      expect(conflict.isError).toBe(true);
      expect(conflict.structuredContent).toMatchObject({
        ok: false,
        current_version: 3,
        error: { code: "PROJECT_VERSION_CONFLICT" }
      });

      await client.callTool({
        name: "update_presentation_template_fields",
        arguments: {
          project_id: projectId,
          expected_version: 3,
          template_id: "research-paper",
          heading_font: "mincho",
          body_weight: 500,
          line_height: 1.5,
          motion_style: "calm"
        }
      });
      await client.callTool({
        name: "configure_deck_narration",
        arguments: {
          project_id: projectId,
          expected_version: 4,
          display: "subtitle",
          speaker: "案内役",
          appearance: {
            placement: "overlay-bottom",
            size: "compact",
            progress_visible: true,
            max_lines: 3
          }
        }
      });
      await client.callTool({
        name: "upsert_voicevox_profile",
        arguments: {
          project_id: projectId,
          expected_version: 5,
          catalog_revision: "voicevox-test",
          profile: {
            id: "guide-voice",
            label: "案内役",
            speaker_uuid: "388f246b-8c41-4ac1-8e2d-5d79f3ff56d9",
            speaker_name: "ずんだもん",
            style_id: 3,
            style_name: "ノーマル",
            tuning: null
          },
          make_default: true
        }
      });
      await client.callTool({
        name: "update_voicevox_profile_tuning",
        arguments: {
          project_id: projectId,
          expected_version: 6,
          profile_id: "guide-voice",
          tuning: { speedScale: 1.1, intonationScale: 1.2 }
        }
      });
      await client.callTool({
        name: "create_slide",
        arguments: {
          project_id: projectId,
          expected_version: 7,
          slide_id: "intro",
          title: "はじめに"
        }
      });
      await client.callTool({
        name: "set_slide_narration",
        arguments: {
          project_id: projectId,
          expected_version: 8,
          slide_id: "intro",
          at: 0,
          text: "研究を始めます。"
        }
      });
      await client.callTool({
        name: "configure_slide_narration",
        arguments: {
          project_id: projectId,
          expected_version: 9,
          slide_id: "intro",
          display: "minimal",
          appearance: {
            placement: "bottom",
            speaker_visible: true,
            text_scale: 1.1
          }
        }
      });
      const segmentVoice = await client.callTool({
        name: "update_slide_narration_voice",
        arguments: {
          project_id: projectId,
          expected_version: 10,
          slide_id: "intro",
          at: 0,
          speaker: "ずんだもん",
          voice_profile_id: "guide-voice",
          voice_tuning: { pitchScale: -0.02 }
        }
      });
      expect(segmentVoice.structuredContent).toMatchObject({
        ok: true,
        version: 11
      });

      await client.callTool({
        name: "configure_presentation_stage",
        arguments: {
          project_id: projectId,
          expected_version: 11,
          aspect_ratio: "4:3",
          loading_screen: {
            style: "research-log",
            message: "資料を準備しています",
            minimum_duration_ms: 800
          }
        }
      });
      await client.callTool({
        name: "update_slide_fields",
        arguments: {
          project_id: projectId,
          expected_version: 12,
          slide_id: "intro",
          role: "cover",
          cover_layout: "statement",
          enter_animation: "blur"
        }
      });
      const expandedTemplate = await client.callTool({
        name: "update_presentation_template_fields",
        arguments: {
          project_id: projectId,
          expected_version: 13,
          template_id: "research-paper",
          region_layout: "split",
          accent_secondary: "#65ccff",
          border: "#334155"
        }
      });
      expect(expandedTemplate.structuredContent).toMatchObject({
        ok: true,
        version: 14
      });

      const voiceStatus = await client.callTool({
        name: "get_voice_generation_status",
        arguments: { project_id: projectId }
      });
      expect(voiceStatus.structuredContent).toMatchObject({
        ok: true,
        voice: {
          version: 14,
          configured: true,
          summary: { total: 1, ready: 0, needs_generation: 1 }
        }
      });
      const deniedGeneration = await client.callTool({
        name: "generate_voice_audio",
        arguments: {
          project_id: projectId,
          expected_version: 14,
          idempotency_key: "72000000-0000-4000-8000-000000000007"
        }
      });
      expect(deniedGeneration.isError).toBe(true);
      expect(deniedGeneration.structuredContent).toMatchObject({
        ok: false,
        error: { code: "SCOPE_REQUIRED" }
      });

      const result = await readJsonResource(
        client,
        `research://projects/${projectId}`
      );
      expect(result).toMatchObject({
        ok: true,
        project: {
          version: 14,
          document: {
            deck: {
              default_template_id: "research-paper",
              narration_defaults: {
                display: "subtitle",
                appearance: { placement: "overlay-bottom", max_lines: 3 }
              },
              templates: [
                {
                  id: "research-paper",
                  visual_preset: "paper",
                  heading_font: "mincho",
                  body_weight: 500,
                  region_layout: "split",
                  accent_secondary: "#65ccff",
                  border: "#334155"
                }
              ],
              voicevox: {
                profiles: [
                  {
                    id: "guide-voice",
                    tuning: { speedScale: 1.1, intonationScale: 1.2 }
                  }
                ]
              },
              slides: [
                {
                  id: "intro",
                  role: "cover",
                  cover_layout: "statement",
                  enter_animation: "blur",
                  narration: {
                    display: "minimal",
                    appearance: { placement: "bottom", text_scale: 1.1 },
                    segments: [
                      {
                        at: 0,
                        speaker: "ずんだもん",
                        voice_profile_id: "guide-voice",
                        voice_tuning: { pitchScale: -0.02 },
                        audio_src: null
                      }
                    ]
                  }
                }
              ],
              aspect_ratio: "4:3",
              loading_screen: {
                enabled: true,
                style: "research-log",
                message: "資料を準備しています",
                show_progress: true,
                minimum_duration_ms: 800
              }
            }
          }
        }
      });
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
