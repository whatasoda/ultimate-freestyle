import { env } from "cloudflare:test";
import {
  createExecutionContext,
  waitOnExecutionContext
} from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { createOAuthProvider } from "../src/auth/oauth";
import type { Fetcher } from "../src/auth/twitch";

function createAuthEnv(): Env {
  return {
    OAUTH_KV: env.OAUTH_KV,
    AUTH_STATE_KV: env.AUTH_STATE_KV,
    DB: env.DB,
    MCP_AUTH_MODE: "twitch",
    TWITCH_BROADCASTER_ID: "67879379",
    TWITCH_BROADCASTER_LOGIN: "kashiwo",
    TWITCH_REDIRECT_URI: "https://saijiyu-kenkyu.2764.moe/oauth/twitch/callback",
    MIN_FOLLOW_DAYS: "30",
    ELIGIBILITY_CACHE_TTL_SECONDS: "1800",
    TWITCH_CLIENT_ID: "twitch-client-id",
    TWITCH_CLIENT_SECRET: "twitch-client-secret"
  };
}

function queuedFetch(responses: Response[]): Fetcher {
  return async () => {
    const response = responses.shift();
    if (response === undefined) {
      throw new Error("Unexpected Twitch fetch call.");
    }
    return response;
  };
}

function jsonResponse(body: object, status = 200): Response {
  return Response.json(body, { status });
}

async function requestProvider(
  provider: ReturnType<typeof createOAuthProvider>,
  request: Request,
  authEnv: Env
): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await provider.fetch(request, authEnv, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

async function codeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier)
  );
  const bytes = String.fromCharCode(...new Uint8Array(digest));
  return btoa(bytes).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

describe("Twitch OAuth proxy", () => {
  it("advertises OAuth and rejects an unauthenticated MCP request", async () => {
    const authEnv = createAuthEnv();
    const provider = createOAuthProvider(
      authEnv,
      async () => Response.json({ protected: true })
    );

    const metadata = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/.well-known/oauth-protected-resource"
      ),
      authEnv
    );
    expect(metadata.status).toBe(200);
    await expect(metadata.json()).resolves.toMatchObject({
      resource: "https://saijiyu-kenkyu.2764.moe/mcp",
      authorization_servers: ["https://saijiyu-kenkyu.2764.moe"]
    });

    const protectedResponse = await requestProvider(
      provider,
      new Request("https://saijiyu-kenkyu.2764.moe/mcp", { method: "POST" }),
      authEnv
    );
    expect(protectedResponse.status).toBe(401);
    expect(protectedResponse.headers.get("www-authenticate")).toContain(
      "resource_metadata"
    );
  });

  it("completes MCP PKCE through Twitch and grants an eligible follower", async () => {
    const authEnv = createAuthEnv();
    const twitchFetch = queuedFetch([
      jsonResponse({
        access_token: "twitch-access",
        refresh_token: "twitch-refresh",
        expires_in: 3600,
        scope: ["user:read:follows", "user:read:subscriptions"],
        token_type: "bearer"
      }),
      jsonResponse({
        client_id: "twitch-client-id",
        login: "viewer",
        scopes: ["user:read:follows", "user:read:subscriptions"],
        user_id: "viewer-id",
        expires_in: 3600
      }),
      jsonResponse({
        data: [
          {
            broadcaster_id: "67879379",
            followed_at: "2020-01-01T00:00:00.000Z"
          }
        ]
      }),
      jsonResponse({}, 404)
    ]);
    const provider = createOAuthProvider(
      authEnv,
      async () => Response.json({ protected: true }),
      twitchFetch
    );

    const registration = await requestProvider(
      provider,
      new Request("https://saijiyu-kenkyu.2764.moe/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          redirect_uris: ["https://client.example/callback"],
          client_name: "Contract Test Client",
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
          token_endpoint_auth_method: "none"
        })
      }),
      authEnv
    );
    expect(registration.status).toBe(201);
    const client = await registration.json<{ client_id: string }>();

    const verifier = "contract-test-verifier-0000000000000000000000000000";
    const authorizeUrl = new URL("https://saijiyu-kenkyu.2764.moe/authorize");
    authorizeUrl.search = new URLSearchParams({
      response_type: "code",
      client_id: client.client_id,
      redirect_uri: "https://client.example/callback",
      scope: "research:read",
      state: "client-state",
      code_challenge: await codeChallenge(verifier),
      code_challenge_method: "S256",
      resource: "https://saijiyu-kenkyu.2764.moe/mcp"
    }).toString();

    const consent = await requestProvider(
      provider,
      new Request(authorizeUrl),
      authEnv
    );
    expect(consent.status).toBe(200);
    const consentHtml = await consent.text();
    const csrfToken = consentHtml.match(/name="csrf_token" value="([^"]+)"/)?.[1];
    expect(csrfToken).toBeTruthy();

    const formBody = new URLSearchParams({ csrf_token: csrfToken ?? "" });
    const upstreamRedirect = await requestProvider(
      provider,
      new Request(authorizeUrl, {
        method: "POST",
        headers: {
          cookie: consent.headers.get("set-cookie") ?? "",
          "content-length": String(formBody.toString().length),
          "content-type": "application/x-www-form-urlencoded"
        },
        body: formBody
      }),
      authEnv
    );
    expect(upstreamRedirect.status).toBe(302);
    const twitchAuthorize = new URL(
      upstreamRedirect.headers.get("location") ?? "https://invalid.example"
    );
    expect(twitchAuthorize.origin).toBe("https://id.twitch.tv");

    const callbackUrl = new URL(authEnv.TWITCH_REDIRECT_URI);
    callbackUrl.search = new URLSearchParams({
      code: "twitch-code",
      state: twitchAuthorize.searchParams.get("state") ?? ""
    }).toString();
    const clientRedirect = await requestProvider(
      provider,
      new Request(callbackUrl, {
        headers: {
          cookie: upstreamRedirect.headers.get("set-cookie") ?? ""
        }
      }),
      authEnv
    );
    expect(clientRedirect.status).toBe(302);
    const clientCallback = new URL(
      clientRedirect.headers.get("location") ?? "https://invalid.example"
    );
    expect(clientCallback.origin).toBe("https://client.example");
    expect(clientCallback.searchParams.get("state")).toBe("client-state");

    const tokenBody = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: client.client_id,
      redirect_uri: "https://client.example/callback",
      code: clientCallback.searchParams.get("code") ?? "",
      code_verifier: verifier,
      resource: "https://saijiyu-kenkyu.2764.moe/mcp"
    });
    const tokenResponse = await requestProvider(
      provider,
      new Request("https://saijiyu-kenkyu.2764.moe/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: tokenBody
      }),
      authEnv
    );
    expect(tokenResponse.status).toBe(200);
    const mcpToken = await tokenResponse.json<{ access_token: string }>();

    const protectedResponse = await requestProvider(
      provider,
      new Request("https://saijiyu-kenkyu.2764.moe/mcp", {
        method: "POST",
        headers: { authorization: `Bearer ${mcpToken.access_token}` }
      }),
      authEnv
    );
    expect(protectedResponse.status).toBe(200);
    await expect(protectedResponse.json()).resolves.toEqual({ protected: true });

    const user = await env.DB.prepare(
      "SELECT twitch_login FROM users WHERE twitch_user_id = 'viewer-id'"
    ).first<{ twitch_login: string }>();
    expect(user?.twitch_login).toBe("viewer");
  });
});
