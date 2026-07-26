import { describe, expect, it } from "vitest";

import { TwitchApiError, TwitchClient, type Fetcher } from "../src/auth/twitch";

const config = {
  clientId: "client-id",
  clientSecret: "client-secret",
  redirectUri: "https://example.com/oauth/twitch/callback",
  broadcasterId: "67879379"
};

function queuedFetch(responses: Response[]) {
  const requests: Request[] = [];
  const fetcher: Fetcher = async (input, init) => {
    requests.push(new Request(input, init));
    const response = responses.shift();
    if (response === undefined) {
      throw new Error("Unexpected fetch call.");
    }
    return response;
  };
  return { fetcher, requests };
}

function jsonResponse(body: object, status = 200): Response {
  return Response.json(body, { status });
}

describe("TwitchClient", () => {
  it("uses the server-side authorization code flow", async () => {
    const mock = queuedFetch([
      jsonResponse({
        access_token: "access",
        refresh_token: "refresh",
        expires_in: 3600,
        scope: ["user:read:follows", "user:read:subscriptions"],
        token_type: "bearer"
      })
    ]);
    const client = new TwitchClient(config, mock.fetcher);

    await expect(client.exchangeAuthorizationCode("code")).resolves.toMatchObject({
      access_token: "access",
      refresh_token: "refresh"
    });
    const requestBody = await mock.requests[0].formData();
    expect(requestBody.get("grant_type")).toBe("authorization_code");
    expect(requestBody.get("access_token")).toBeNull();
  });

  it("validates identity and reads follow and subscription evidence", async () => {
    const mock = queuedFetch([
      jsonResponse({
        client_id: "client-id",
        login: "viewer",
        scopes: ["user:read:follows", "user:read:subscriptions"],
        user_id: "viewer-id",
        expires_in: 3600
      }),
      jsonResponse({
        data: [
          {
            broadcaster_id: "67879379",
            followed_at: "2026-01-01T00:00:00.000Z"
          }
        ]
      }),
      jsonResponse({}, 404)
    ]);
    const client = new TwitchClient(config, mock.fetcher);

    const identity = await client.validateAccessToken("access");
    const evidence = await client.getEligibilityEvidence("access", identity.user_id);

    expect(identity.login).toBe("viewer");
    expect(evidence).toEqual({
      followedAt: "2026-01-01T00:00:00.000Z",
      subscribed: false
    });
    expect(mock.requests[1].headers.get("authorization")).toBe("Bearer access");
    expect(mock.requests[1].headers.get("client-id")).toBe("client-id");
  });

  it("rejects a token missing an eligibility scope", async () => {
    const mock = queuedFetch([
      jsonResponse({
        client_id: "client-id",
        login: "viewer",
        scopes: ["user:read:follows"],
        user_id: "viewer-id",
        expires_in: 3600
      })
    ]);
    const client = new TwitchClient(config, mock.fetcher);

    await expect(client.validateAccessToken("access")).rejects.toMatchObject({
      code: "TWITCH_SCOPE_MISSING",
      status: 403
    } satisfies Partial<TwitchApiError>);
  });
});
