import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("MCP Worker", () => {
  it("returns machine-readable health information", async () => {
    const response = await exports.default.fetch("https://example.com/healthz");
    const body = await response.json<{
      ok: boolean;
      service: string;
      version: string;
      renderer_version: string;
      request_id: string;
      eligibility: {
        broadcaster_id: string;
        broadcaster_login: string;
        min_follow_days: number;
      };
    }>();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toMatchObject({
      ok: true,
      service: "ultimate-freestyle-mcp",
      version: "0.14.0",
      renderer_version: "uf-renderer@65",
      eligibility: {
        broadcaster_id: "67879379",
        broadcaster_login: "kashiwo",
        min_follow_days: 30
      }
    });
    expect(body.request_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });

  it("returns a stable structured error for unknown routes", async () => {
    const response = await exports.default.fetch("https://example.com/unknown");
    const body = await response.json<{
      error: { code: string; message: string };
      request_id: string;
    }>();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.request_id).toBeTruthy();
  });

  it("protects MCP requests and advertises OAuth metadata", async () => {
    const response = await exports.default.fetch("https://example.com/mcp", {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "contract-test", version: "0.1.0" }
        }
      })
    });
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain(
      "resource_metadata"
    );

    const metadata = await exports.default.fetch(
      "https://example.com/.well-known/oauth-protected-resource"
    );
    expect(metadata.status).toBe(200);
    await expect(metadata.json()).resolves.toMatchObject({
      resource: "https://saijiyu-kenkyu.2764.moe/mcp",
      authorization_servers: ["https://saijiyu-kenkyu.2764.moe"],
      scopes_supported: [
        "research:read",
        "research:write",
        "research:publish"
      ]
    });
  });
});
