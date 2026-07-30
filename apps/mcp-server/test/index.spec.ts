import { exports } from "cloudflare:workers";
import { createExecutionContext, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { handleMcpRequest } from "../src/index";
import { MAX_MCP_REQUEST_BYTES } from "../src/lib/limits";

describe("MCP Worker", () => {
  it("passes a bounded MCP request to the Streamable HTTP handler", async () => {
    const response = await handleMcpRequest(
      new Request("https://example.com/mcp", {
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
            clientInfo: { name: "bounded-request-test", version: "0.1.0" }
          }
        })
      }),
      env,
      createExecutionContext()
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("protocolVersion");
  });

  it("rejects oversized MCP bodies before the SDK parses them", async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(MAX_MCP_REQUEST_BYTES + 1));
      },
      cancel() {
        cancelled = true;
      }
    });
    const response = await handleMcpRequest(
      new Request("https://example.com/mcp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: stream
      }),
      env,
      createExecutionContext()
    );
    const body = await response.json<{
      jsonrpc: string;
      error: { code: number; data: { code: string; request_id: string } };
    }>();

    expect(response.status).toBe(413);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toMatchObject({
      jsonrpc: "2.0",
      error: {
        code: -32600,
        data: { code: "MCP_REQUEST_TOO_LARGE" }
      }
    });
    expect(body.error.data.request_id).toBeTruthy();
    expect(cancelled).toBe(true);
  });

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
      version: "0.15.0",
      renderer_version: "uf-renderer@114",
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
