import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";

import { createServer } from "../src/server";

const eligibilityConfig = {
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

      const result = await client.callTool({ name: "health", arguments: {} });
      expect(result.structuredContent).toMatchObject({
        ok: true,
        service: "ultimate-freestyle-mcp",
        version: "0.1.0",
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
});
