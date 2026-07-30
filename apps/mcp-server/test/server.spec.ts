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
          "set_voicevox_profile",
          "update_voicevox_profile_tuning",
          "set_slide_canvas",
          "edit_slide_block",
          "delete_slide_block",
          "set_slide_scene",
          "create_slide_component",
          "update_slide_component_content",
          "edit_slide_data_item",
          "update_slide_component",
          "delete_slide_component",
          "update_project_fields",
          "configure_deck",
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
          "restore_draft_revision",
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
      expect(largestInputSchema).toBeLessThan(8_000);
      expect(tools.length).toBeLessThanOrEqual(36);
      expect(
        new TextEncoder().encode(JSON.stringify(tools)).length
      ).toBeLessThan(90_000);
      const blockTool = tools.find((tool) => tool.name === "edit_slide_block");
      expect(JSON.stringify(blockTool?.inputSchema)).not.toContain('"block"');
      expect(JSON.stringify(blockTool?.inputSchema)).toContain('"text_edit"');
      expect(JSON.stringify(blockTool?.inputSchema)).not.toContain('"maxLength":20000');
      const revealTool = tools.find((tool) => tool.name === "set_slide_reveal");
      expect(JSON.stringify(revealTool?.inputSchema)).toContain('"text_edit"');
      expect(tools).toContainEqual(
        expect.objectContaining({
          name: "edit_slide_data_item",
          annotations: expect.objectContaining({ destructiveHint: true })
        })
      );
      const templateUpdateTool = tools.find(
        (tool) => tool.name === "update_presentation_template_fields"
      );
      expect(JSON.stringify(templateUpdateTool?.inputSchema)).toContain('"updates"');
      expect(JSON.stringify(templateUpdateTool?.inputSchema)).not.toContain(
        '"heading_font":{"'
      );
      const slideFieldsTool = tools.find(
        (tool) => tool.name === "update_slide_fields"
      );
      expect(JSON.stringify(slideFieldsTool?.inputSchema)).toContain('"body_edits"');
      expect(JSON.stringify(slideFieldsTool?.inputSchema)).toContain('"maxLength":4000');
      expect(
        (slideFieldsTool?.inputSchema as { properties?: object }).properties
      ).not.toHaveProperty("content_markdown");
      const projectFieldsTool = tools.find(
        (tool) => tool.name === "update_project_fields"
      );
      expect(JSON.stringify(projectFieldsTool?.inputSchema)).toContain('"text_edits"');
      expect(
        (projectFieldsTool?.inputSchema as { properties?: object }).properties
      ).not.toHaveProperty("method");
      const componentContentTool = tools.find(
        (tool) => tool.name === "update_slide_component_content"
      );
      expect(JSON.stringify(componentContentTool?.inputSchema)).toContain('"text_edit"');
      expect(JSON.stringify(componentContentTool?.inputSchema)).not.toContain('"maxLength":20000');
      const narrationTool = tools.find(
        (tool) => tool.name === "set_slide_narration"
      );
      expect(
        (narrationTool?.inputSchema as { properties?: object }).properties
      ).not.toHaveProperty("audio_src");
      expect(
        (narrationTool?.inputSchema as { properties?: object }).properties
      ).not.toHaveProperty("display");
      expect(
        (narrationTool?.inputSchema as { properties?: object }).properties
      ).not.toHaveProperty("voice_tuning");
      const voiceStatusTool = tools.find(
        (tool) => tool.name === "get_voice_generation_status"
      );
      expect(JSON.stringify(voiceStatusTool?.outputSchema).length).toBeLessThan(
        6_000
      );
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
        renderer_version: "uf-renderer@94",
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
      expect(resources).toContainEqual(
        expect.objectContaining({ uri: "research://guide/edit-contract" })
      );
      expect(resources).toContainEqual(
        expect.objectContaining({
          uri: "research://guide/voicevox-catalog"
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
          text: expect.stringContaining("子を移動または削除してから親を削除する")
        })
      );
      const styleGuide = await client.readResource({
        uri: "research://guide/presentation-style"
      });
      expect(styleGuide.contents).toContainEqual(
        expect.objectContaining({
          mimeType: "text/markdown",
          text: expect.stringContaining("`museum`、`terminal`")
        })
      );
      const editContract = await client.readResource({
        uri: "research://guide/edit-contract"
      });
      expect(editContract.contents).toContainEqual(
        expect.objectContaining({
          mimeType: "text/markdown",
          text: expect.stringContaining("古い入力をそのまま再送せず")
        })
      );
      const voiceCatalog = await readJsonResource(
        client,
        "research://guide/voicevox-catalog"
      );
      expect(voiceCatalog).toMatchObject({
        catalog_revision: "voicevox-engine-0.25.1",
        profiles: expect.arrayContaining([
          expect.objectContaining({
            id: "voicevox-style-3",
            label: "ずんだもん・ノーマル"
          })
        ])
      });
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
          text_edits: [{
            target: "question",
            operation: "replace",
            text: updatedQuestion
          }]
        }
      });
      expect(update.structuredContent).toMatchObject({
        ok: true,
        current_version: null,
        version: 2
      });

      const conflict = await client.callTool({
        name: "update_project_fields",
        arguments: {
          project_id: firstProject.project_id,
          expected_version: 1,
          text_edits: [{
            target: "summary",
            operation: "replace",
            text: "競合して保存されない概要"
          }]
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
            uriTemplate: "research://projects/{id}/revisions"
          }),
          expect.objectContaining({
            uriTemplate: "research://projects/{id}/revisions/{version}"
          }),
          expect.objectContaining({
            uriTemplate:
              "research://projects/{id}/revisions/{version}/slides/{slideId}"
          }),
          expect.objectContaining({
            uriTemplate: "research://projects/{id}/publication"
          }),
          expect.objectContaining({
            uriTemplate: "research://projects/{id}/quality"
          }),
          expect.objectContaining({
            uriTemplate: "research://projects/{id}/slides/{slideId}"
          }),
          expect.objectContaining({
            uriTemplate:
              "research://projects/{id}/slides/{slideId}/elements/{elementId}"
          }),
          expect.objectContaining({
            uriTemplate: "research://projects/{id}/voice"
          }),
          expect.objectContaining({
            uriTemplate: "research://projects/{id}/voice/slides/{slideId}"
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
      const qualityResource = await readJsonResource(
        client,
        `research://projects/${firstProject.project_id}/quality`
      );
      expect(qualityResource).toMatchObject({
        ok: true,
        project_id: firstProject.project_id,
        version: 2,
        static_checks: {
          status: "ready_for_render_review",
          warning_count: 0
        },
        rendered_checks: {
          required: true,
          available_in_mcp: false,
          requires_session: true
        },
        next_action: "run_rendered_quality_sweep"
      });
      const revisionResource = await readJsonResource(
        client,
        `research://projects/${firstProject.project_id}/revisions/1`
      );
      expect(revisionResource).toMatchObject({
        ok: true,
        project_id: firstProject.project_id,
        current_version: 2,
        revision: {
          version: 1,
          research: {
            title: "記憶と泥団子の研究",
            question: null,
            findings: { count: 0, previews: [] },
            limitations: { count: 0, previews: [] },
            log_count: 0
          },
          presentation: null
        },
        diff: {
          research_fields: expect.arrayContaining(["stage", "question"]),
          presentation_settings: [],
          current_only_slides: [],
          duration_delta_seconds: 0
        }
      });
      expect(new TextEncoder().encode(JSON.stringify(revisionResource)).byteLength).toBeLessThan(16 * 1024);
      const missingRevisionSlide = await readJsonResource(
        client,
        `research://projects/${firstProject.project_id}/revisions/1/slides/missing`
      );
      expect(missingRevisionSlide).toMatchObject({
        ok: false,
        error: { code: "SLIDE_NOT_FOUND" }
      });
      const publicationResource = await readJsonResource(
        client,
        `research://projects/${firstProject.project_id}/publication`
      );
      expect(publicationResource).toMatchObject({
        ok: true,
        project_id: firstProject.project_id,
        slug: null,
        latest_preview: null,
        published: null,
        readiness: {
          needs_preview: true,
          needs_review: false,
          can_publish: false,
          published_current: false,
          next_action: "fix_blockers",
          preview_blockers: [
            expect.objectContaining({ code: "DECK_REQUIRED" })
          ],
          publish_blockers: expect.arrayContaining([
            expect.objectContaining({ code: "DECK_REQUIRED" }),
            expect.objectContaining({ code: "PREVIEW_REQUIRED" })
          ])
        },
        web: {
          dashboard: {
            url: `https://saijiyu-kenkyu.2764.moe/dashboard/projects/${firstProject.project_id}`,
            requires_session: true
          },
          preview: null,
          public: null
        },
        recent_events: []
      });

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
      const deleteLastSlide = await client.callTool({
        name: "delete_slide",
        arguments: {
          project_id: firstProject.project_id,
          expected_version: 5,
          slide_id: "question"
        }
      });
      expect(deleteLastSlide.isError).toBe(true);
      expect(deleteLastSlide.structuredContent).toMatchObject({
        ok: false,
        error: { code: "LAST_SLIDE_REQUIRED" }
      });
      const slideFields = await client.callTool({
        name: "update_slide_fields",
        arguments: {
          project_id: firstProject.project_id,
          expected_version: 5,
          slide_id: "question",
          template_id: "mud-biim",
          body_edits: [
            {
              target: "content",
              operation: "replace_once",
              old_text: "研究の問い",
              text: "# どこまで丸くできる？"
            },
            {
              target: "sidebar",
              operation: "replace",
              text: "読み上げない作者コメント"
            }
          ]
        }
      });
      expect(slideFields.structuredContent).toMatchObject({ ok: true, version: 6 });
      const missingBodyAnchor = await client.callTool({
        name: "update_slide_fields",
        arguments: {
          project_id: firstProject.project_id,
          expected_version: 6,
          slide_id: "question",
          body_edits: [{
            target: "content",
            operation: "replace_once",
            old_text: "存在しない文",
            text: "置換後"
          }]
        }
      });
      expect(missingBodyAnchor).toMatchObject({
        isError: true,
        structuredContent: { error: { code: "INVALID_CHANGE" } }
      });
      const reveal = await client.callTool({
        name: "set_slide_reveal",
        arguments: {
          project_id: firstProject.project_id,
          expected_version: 6,
          slide_id: "question",
          at: 1,
          text_edit: {
            operation: "append",
            text: "- 記憶だけで作る"
          }
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
          text: "まず研究の問いを説明します。"
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
        name: "edit_slide_block",
        arguments: {
          project_id: firstProject.project_id,
          expected_version: 9,
          slide_id: "question",
          action: "create",
          block_id: "central-question",
          kind: "markdown",
          value: "# どこまで丸くできる？"
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
      const canvasElement = await readJsonResource(
        client,
        `research://projects/${firstProject.project_id}/slides/question/elements/central-question`
      );
      expect(canvasElement).toMatchObject({
        ok: true,
        version: 10,
        element_type: "block",
        element: {
          id: "central-question",
          kind: "markdown",
          markdown: "# どこまで丸くできる？"
        }
      });
      const movedBlock = await client.callTool({
        name: "edit_slide_block",
        arguments: {
          project_id: firstProject.project_id,
          expected_version: 10,
          slide_id: "question",
          action: "update_field",
          block_id: "central-question",
          field: "markdown",
          text_edit: {
            operation: "replace_once",
            old_text: "どこまで",
            text: "どれほど"
          }
        }
      });
      expect(movedBlock.structuredContent).toMatchObject({ ok: true, version: 11 });
      const movedCanvasElement = await readJsonResource(
        client,
        `research://projects/${firstProject.project_id}/slides/question/elements/central-question`
      );
      expect(movedCanvasElement).toMatchObject({
        ok: true,
        version: 11,
        element: { markdown: "# どれほど丸くできる？" }
      });
      const incompatibleBlockField = await client.callTool({
        name: "edit_slide_block",
        arguments: {
          project_id: firstProject.project_id,
          expected_version: 11,
          slide_id: "question",
          action: "update_field",
          block_id: "central-question",
          field: "asset_id",
          value: "10000000-0000-4000-8000-000000000001"
        }
      });
      expect(incompatibleBlockField).toMatchObject({
        isError: true,
        structuredContent: { error: { code: "INVALID_FIELDS" } }
      });
      const overflowingBlock = await client.callTool({
        name: "edit_slide_block",
        arguments: {
          project_id: firstProject.project_id,
          expected_version: 11,
          slide_id: "question",
          action: "update_field",
          block_id: "central-question",
          field: "x",
          value: 95
        }
      });
      expect(overflowingBlock).toMatchObject({
        isError: true,
        structuredContent: { error: { code: "INVALID_FIELDS" } }
      });

      const scene = await client.callTool({
        name: "set_slide_scene",
        arguments: {
          project_id: firstProject.project_id,
          expected_version: 11,
          slide_id: "question",
          enabled: true,
          background: "#11100e"
        }
      });
      expect(scene.structuredContent).toMatchObject({ ok: true, version: 12 });
      const layoutComponent = await client.callTool({
        name: "create_slide_component",
        arguments: {
          project_id: firstProject.project_id,
          expected_version: 12,
          slide_id: "question",
          component_id: "result-stack",
          kind: "stack",
          parent_id: null
        }
      });
      expect(layoutComponent.structuredContent).toMatchObject({
        ok: true,
        version: 13
      });
      const infoComponent = await client.callTool({
        name: "create_slide_component",
        arguments: {
          project_id: firstProject.project_id,
          expected_version: 13,
          slide_id: "question",
          component_id: "trial-count",
          kind: "metric",
          parent_id: "result-stack",
          at: 1,
          animation: "zoom",
          initial_text: "12"
        }
      });
      expect(infoComponent.structuredContent).toMatchObject({
        ok: true,
        version: 14
      });
      const metricCaption = await client.callTool({
        name: "update_slide_component_content",
        arguments: {
          project_id: firstProject.project_id,
          expected_version: 14,
          slide_id: "question",
          component_id: "trial-count",
          field: "caption",
          text_edit: {
            operation: "replace_once",
            old_text: "指標",
            text: "試した回数"
          }
        }
      });
      expect(metricCaption.structuredContent).toMatchObject({
        ok: true,
        version: 15
      });
      const dataComponent = await client.callTool({
        name: "create_slide_component",
        arguments: {
          project_id: firstProject.project_id,
          expected_version: 15,
          slide_id: "question",
          component_id: "comparison",
          kind: "bar_chart",
          parent_id: "result-stack",
          order: 1,
          at: 1,
          animation: "rise"
        }
      });
      expect(dataComponent.structuredContent).toMatchObject({
        ok: true,
        version: 16
      });
      const dataItem = await client.callTool({
        name: "edit_slide_data_item",
        arguments: {
          project_id: firstProject.project_id,
          expected_version: 16,
          slide_id: "question",
          component_id: "comparison",
          action: "add",
          item_id: "after",
          after_id: "item-1",
          field: "at",
          value: 2
        }
      });
      expect(dataItem.structuredContent).toMatchObject({
        ok: true,
        version: 17
      });
      const componentResource = await readJsonResource(
        client,
        `research://projects/${firstProject.project_id}/slides/question/elements/trial-count`
      );
      expect(componentResource).toMatchObject({
        ok: true,
        version: 17,
        element: { id: "trial-count", kind: "metric", caption: "試した回数" }
      });
      const sceneSlide = await readJsonResource(
        client,
        `research://projects/${firstProject.project_id}/slides/question`
      );
      expect(sceneSlide).toMatchObject({
        ok: true,
        version: 17,
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
      const componentLayout = await client.callTool({
        name: "update_slide_component",
        arguments: {
          project_id: firstProject.project_id,
          expected_version: 17,
          slide_id: "question",
          component_id: "trial-count",
          layout: { order: 3, at: 2, animation: "pop" }
        }
      });
      expect(componentLayout.structuredContent).toMatchObject({
        ok: true,
        version: 18
      });
      const componentStyle = await client.callTool({
        name: "update_slide_component",
        arguments: {
          project_id: firstProject.project_id,
          expected_version: 18,
          slide_id: "question",
          component_id: "trial-count",
          style: { background: "#102030", font_scale: 1.25 }
        }
      });
      expect(componentStyle.structuredContent).toMatchObject({
        ok: true,
        version: 19
      });
      const deleteParentComponent = await client.callTool({
        name: "delete_slide_component",
        arguments: {
          project_id: firstProject.project_id,
          expected_version: 19,
          slide_id: "question",
          component_id: "result-stack"
        }
      });
      expect(deleteParentComponent.isError).toBe(true);
      expect(deleteParentComponent.structuredContent).toMatchObject({
        ok: false,
        error: { code: "COMPONENT_HAS_CHILDREN" }
      });
      const adjustedSceneSlide = await readJsonResource(
        client,
        `research://projects/${firstProject.project_id}/slides/question`
      );
      expect(adjustedSceneSlide).toMatchObject({
        ok: true,
        version: 19,
        slide: {
          reveal_steps: 2,
          composition: {
            nodes: expect.arrayContaining([
              expect.objectContaining({
                id: "trial-count",
                order: 3,
                at: 2,
                animation: "pop",
                style: { background: "#102030", font_scale: 1.25 }
              })
            ])
          }
        }
      });
      const revisions = await readJsonResource(
        client,
        `research://projects/${firstProject.project_id}/revisions`
      );
      expect(revisions).toMatchObject({
        ok: true,
        current_version: 19,
        retained_limit: 50,
        selection_workflow: {
          restore_tool: "restore_draft_revision",
          current_project_uri: `research://projects/${firstProject.project_id}`
        },
        revisions: expect.arrayContaining([
          expect.objectContaining({ version: 19, source: "edit" }),
          expect.objectContaining({ version: 18, source: "edit" })
        ])
      });
      const restoredDraft = await client.callTool({
        name: "restore_draft_revision",
        arguments: {
          project_id: firstProject.project_id,
          expected_version: 19,
          target_version: 1
        }
      });
      expect(restoredDraft.structuredContent).toMatchObject({
        ok: true,
        version: 20,
        current_version: 20,
        restored_from_version: 1
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
          updates: [{ field: "heading_font", value: "mincho" }]
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
          updates: [
            { field: "heading_font", value: "mincho" },
            { field: "body_weight", value: 500 },
            { field: "line_height", value: 1.5 },
            { field: "motion_style", value: "calm" }
          ]
        }
      });
      await client.callTool({
        name: "configure_deck",
        arguments: {
          project_id: projectId,
          expected_version: 4,
          narration: {
            display: "subtitle",
            speaker: "案内役",
            appearance: {
              placement: "overlay-bottom",
              size: "compact",
              progress_visible: true,
              max_lines: 3
            }
          }
        }
      });
      await client.callTool({
        name: "set_voicevox_profile",
        arguments: {
          project_id: projectId,
          expected_version: 5,
          catalog_profile_id: "voicevox-style-3",
          profile_id: "guide-voice",
          label: "案内役",
          make_default: true
        }
      });
      const invalidCatalogProfile = await client.callTool({
        name: "set_voicevox_profile",
        arguments: {
          project_id: projectId,
          expected_version: 6,
          catalog_profile_id: "voicevox-style-999999"
        }
      });
      expect(invalidCatalogProfile.isError).toBe(true);
      expect(invalidCatalogProfile.structuredContent).toMatchObject({
        ok: false,
        current_version: null,
        error: { code: "INVALID_CHANGE" }
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
      const revisedNarration = await client.callTool({
        name: "set_slide_narration",
        arguments: {
          project_id: projectId,
          expected_version: 11,
          slide_id: "intro",
          at: 0,
          text: "研究のきっかけから始めます。"
        }
      });
      expect(revisedNarration.structuredContent).toMatchObject({
        ok: true,
        version: 12
      });

      await client.callTool({
        name: "configure_deck",
        arguments: {
          project_id: projectId,
          expected_version: 12,
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
          expected_version: 13,
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
          expected_version: 14,
          template_id: "research-paper",
          updates: [
            { field: "region_layout", value: "split" },
            { field: "accent_secondary", value: "#65ccff" },
            { field: "border", value: "#334155" }
          ]
        }
      });
      expect(expandedTemplate.structuredContent).toMatchObject({
        ok: true,
        version: 15
      });

      const voiceStatus = await client.callTool({
        name: "get_voice_generation_status",
        arguments: { project_id: projectId }
      });
      expect(voiceStatus.structuredContent).toMatchObject({
        ok: true,
        voice: {
          version: 15,
          configured: true,
          default_profile: {
            label: "案内役"
          },
          summary: { total: 1, ready: 0, needs_generation: 1 },
          details_uri: `research://projects/${projectId}/voice`,
          slide_details_uri_template: `research://projects/${projectId}/voice/slides/{slideId}`
        }
      });
      const voiceDetails = await readJsonResource(
        client,
        `research://projects/${projectId}/voice`
      );
      expect(voiceDetails).toMatchObject({
        ok: true,
        voice: {
          version: 15,
          default_profile: {
            tuning: { speedScale: 1.1, intonationScale: 1.2 }
          }
        },
        slides: [{
          slide_id: "intro",
          segment_count: 1,
          ready_count: 0,
          details_uri: `research://projects/${projectId}/voice/slides/intro`
        }]
      });
      expect((voiceDetails as { voice: object }).voice).not.toHaveProperty("segments");
      const slideVoiceDetails = await readJsonResource(
        client,
        `research://projects/${projectId}/voice/slides/intro`
      );
      expect(slideVoiceDetails).toMatchObject({
        ok: true,
        project_id: projectId,
        version: 15,
        slide_id: "intro",
        segments: [{
          profile_label: "案内役",
          effective_tuning: {
            speedScale: 1.1,
            pitchScale: -0.02,
            intonationScale: 1.2,
            volumeScale: 1,
            pauseLengthScale: 1,
            prePhonemeLength: 0.1,
            postPhonemeLength: 0.1
          }
        }]
      });
      const voiceBlockedPublication = await readJsonResource(
        client,
        `research://projects/${projectId}/publication`
      );
      expect(voiceBlockedPublication).toMatchObject({
        readiness: {
          next_action: "fix_blockers",
          preview_blockers: [
            expect.objectContaining({
              code: "VOICE_INCOMPLETE",
              ready: 0,
              total: 1
            })
          ],
          can_publish: false
        }
      });
      const deniedGeneration = await client.callTool({
        name: "generate_voice_audio",
        arguments: {
          project_id: projectId,
          expected_version: 15,
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
          version: 15,
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
                        text: "研究のきっかけから始めます。",
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
