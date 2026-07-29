import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8")
);
const expectedVersion = packageJson.version;
const rendererSource = await readFile(
  new URL("../src/presentation/render.ts", import.meta.url),
  "utf8"
);
const expectedRendererVersion = rendererSource.match(
  /PRESENTATION_RENDERER_VERSION = "([^"]+)"/
)?.[1];
assert.ok(expectedRendererVersion, "renderer version was not found");

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

async function waitForDeployedHealth() {
  let latest;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    latest = await fetchJson(`/healthz?deployment_check=${Date.now()}`);
    if (
      latest.body.version === expectedVersion &&
      latest.body.renderer_version === expectedRendererVersion
    ) return latest;
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
  assert.equal(latest?.body.version, expectedVersion);
  assert.equal(latest?.body.renderer_version, expectedRendererVersion);
}

const health = await waitForDeployedHealth();
assert.equal(health.response.status, 200);
assert.equal(health.body.ok, true);
assert.equal(health.body.service, "ultimate-freestyle-mcp");
assert.equal(health.body.version, expectedVersion);
assert.equal(health.body.renderer_version, expectedRendererVersion);
assert.equal(health.body.eligibility?.broadcaster_id, "67879379");

const landingResponse = await fetch(new URL("/", baseUrl), {
  redirect: "manual",
  signal: AbortSignal.timeout(15_000)
});
assert.equal(landingResponse.status, 200);
assert.match(
  landingResponse.headers.get("content-type") ?? "",
  /^text\/html\b/
);
assert.match(
  landingResponse.headers.get("content-security-policy") ?? "",
  /default-src 'none'/
);
assert.match(await landingResponse.text(), /Twitchでログイン/);

const dashboardResponse = await fetch(new URL("/dashboard", baseUrl), {
  redirect: "manual",
  signal: AbortSignal.timeout(15_000)
});
assert.equal(dashboardResponse.status, 303);
assert.equal(dashboardResponse.headers.get("location"), "/");

const protectedResponse = await fetch(new URL("/mcp", baseUrl), {
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
  }),
  signal: AbortSignal.timeout(15_000)
});
assert.equal(protectedResponse.status, 401);
assert.match(
  protectedResponse.headers.get("www-authenticate") ?? "",
  /resource_metadata=/
);

const metadata = await fetchJson("/.well-known/oauth-protected-resource");
assert.equal(metadata.response.status, 200);
assert.deepEqual(metadata.body.authorization_servers, [
  "https://saijiyu-kenkyu.2764.moe"
]);
assert.equal(
  metadata.body.resource,
  "https://saijiyu-kenkyu.2764.moe/mcp"
);
assert.deepEqual(metadata.body.scopes_supported, [
  "research:read",
  "research:write",
  "research:publish"
]);

const authorizationMetadata = await fetchJson(
  "/.well-known/oauth-authorization-server"
);
assert.equal(authorizationMetadata.response.status, 200);
assert.equal(
  authorizationMetadata.body.authorization_endpoint,
  "https://saijiyu-kenkyu.2764.moe/authorize"
);
assert.equal(
  authorizationMetadata.body.token_endpoint,
  "https://saijiyu-kenkyu.2764.moe/token"
);
assert.equal(
  authorizationMetadata.body.registration_endpoint,
  "https://saijiyu-kenkyu.2764.moe/register"
);
assert.deepEqual(authorizationMetadata.body.code_challenge_methods_supported, [
  "S256"
]);

console.log(
  JSON.stringify({
    ok: true,
    origin: baseUrl.origin,
    service: health.body.service,
    version: health.body.version,
    renderer_version: health.body.renderer_version,
    mcp_auth: "required",
    web_dashboard: "available",
    authorization_endpoint: authorizationMetadata.body.authorization_endpoint
  })
);
