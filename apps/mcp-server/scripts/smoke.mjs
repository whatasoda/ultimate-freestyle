import assert from "node:assert/strict";

const baseUrl = new URL(
  process.env.MCP_BASE_URL ?? "https://saijiyu-kenkyu.2764.moe"
);

async function fetchJson(path, init) {
  const url = new URL(path, baseUrl);
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(15_000)
  });

  const contentType = response.headers.get("content-type") ?? "";
  assert.match(
    contentType,
    /^application\/json\b/,
    `${url} returned unexpected content-type: ${contentType}`
  );

  return { response, body: await response.json() };
}

const health = await fetchJson("/healthz");
assert.equal(health.response.status, 200);
assert.equal(health.body.ok, true);
assert.equal(health.body.service, "ultimate-freestyle-mcp");
assert.equal(health.body.eligibility?.broadcaster_id, "67879379");

const initialize = await fetchJson("/mcp", {
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
      clientInfo: { name: "production-smoke-test", version: "0.1.0" }
    }
  })
});
assert.equal(initialize.response.status, 200);
assert.equal(initialize.body.jsonrpc, "2.0");
assert.equal(initialize.body.id, 1);
assert.deepEqual(initialize.body.result?.serverInfo, {
  name: "ultimate-freestyle-mcp",
  version: "0.2.0"
});

console.log(
  JSON.stringify({
    ok: true,
    origin: baseUrl.origin,
    service: health.body.service,
    version: health.body.version,
    mcp_server: initialize.body.result.serverInfo
  })
);
