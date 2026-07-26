import { z } from "zod";

import {
  TWITCH_SCOPES,
  twitchIdentitySchema,
  twitchTokenSchema,
  type TwitchIdentity,
  type TwitchToken
} from "./types";
import type { EligibilityEvidence } from "./eligibility";

export type TwitchConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  broadcasterId: string;
};

export type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

export class TwitchApiError extends Error {
  constructor(
    readonly code:
      | "TWITCH_TOKEN_EXCHANGE_FAILED"
      | "TWITCH_TOKEN_REFRESH_FAILED"
      | "TWITCH_TOKEN_INVALID"
      | "TWITCH_SCOPE_MISSING"
      | "TWITCH_API_FAILED"
      | "TWITCH_RATE_LIMITED"
      | "TWITCH_RESPONSE_INVALID",
    message: string,
    readonly status: number,
    readonly retryAfter: string | null = null
  ) {
    super(message);
    this.name = "TwitchApiError";
  }
}

const followedChannelsSchema = z.object({
  data: z.array(
    z.object({
      broadcaster_id: z.string(),
      followed_at: z.string().datetime()
    })
  )
});

const subscriptionSchema = z.object({
  data: z.array(
    z.object({
      broadcaster_id: z.string(),
      is_gift: z.boolean(),
      tier: z.string()
    })
  )
});

async function parseJson<T>(
  response: Response,
  schema: z.ZodType<T>
): Promise<T> {
  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 64 * 1024) {
    throw new TwitchApiError(
      "TWITCH_RESPONSE_INVALID",
      "Twitch returned an unexpectedly large response.",
      502
    );
  }

  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) {
    throw new TwitchApiError(
      "TWITCH_RESPONSE_INVALID",
      "Twitch returned an invalid response.",
      502
    );
  }
  return parsed.data;
}

function apiError(response: Response, message: string): TwitchApiError {
  if (response.status === 401) {
    return new TwitchApiError("TWITCH_TOKEN_INVALID", message, 401);
  }
  if (response.status === 429) {
    return new TwitchApiError(
      "TWITCH_RATE_LIMITED",
      message,
      429,
      response.headers.get("retry-after")
    );
  }
  return new TwitchApiError("TWITCH_API_FAILED", message, response.status);
}

export class TwitchClient {
  constructor(
    private readonly config: TwitchConfig,
    private readonly fetcher: Fetcher = fetch
  ) {}

  createAuthorizationUrl(state: string): URL {
    const url = new URL("https://id.twitch.tv/oauth2/authorize");
    url.search = new URLSearchParams({
      response_type: "code",
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: TWITCH_SCOPES.join(" "),
      state
    }).toString();
    return url;
  }

  async exchangeAuthorizationCode(code: string): Promise<TwitchToken> {
    return this.requestToken(
      new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: this.config.redirectUri
      }),
      "TWITCH_TOKEN_EXCHANGE_FAILED"
    );
  }

  async refreshAccessToken(refreshToken: string): Promise<TwitchToken> {
    return this.requestToken(
      new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken
      }),
      "TWITCH_TOKEN_REFRESH_FAILED"
    );
  }

  private async requestToken(
    body: URLSearchParams,
    code:
      | "TWITCH_TOKEN_EXCHANGE_FAILED"
      | "TWITCH_TOKEN_REFRESH_FAILED"
  ): Promise<TwitchToken> {
    const response = await this.fetcher("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body
    });
    if (!response.ok) {
      throw new TwitchApiError(
        code,
        "Twitch token exchange failed.",
        response.status,
        response.headers.get("retry-after")
      );
    }
    return parseJson(response, twitchTokenSchema);
  }

  async validateAccessToken(accessToken: string): Promise<TwitchIdentity> {
    const response = await this.fetcher(
      "https://id.twitch.tv/oauth2/validate",
      { headers: { authorization: `Bearer ${accessToken}` } }
    );
    if (!response.ok) {
      throw new TwitchApiError(
        "TWITCH_TOKEN_INVALID",
        "Twitch access token is invalid.",
        response.status
      );
    }

    const identity = await parseJson(response, twitchIdentitySchema);
    if (identity.client_id !== this.config.clientId) {
      throw new TwitchApiError(
        "TWITCH_TOKEN_INVALID",
        "Twitch access token belongs to another client.",
        401
      );
    }
    const missingScopes = TWITCH_SCOPES.filter(
      (scope) => !identity.scopes.includes(scope)
    );
    if (missingScopes.length > 0) {
      throw new TwitchApiError(
        "TWITCH_SCOPE_MISSING",
        "Twitch access token is missing a required scope.",
        403
      );
    }
    return identity;
  }

  async getEligibilityEvidence(
    accessToken: string,
    userId: string
  ): Promise<EligibilityEvidence> {
    const [followedAt, subscribed] = await Promise.all([
      this.getFollowedAt(accessToken, userId),
      this.checkSubscription(accessToken, userId)
    ]);
    return { followedAt, subscribed };
  }

  private async getFollowedAt(
    accessToken: string,
    userId: string
  ): Promise<string | null> {
    const url = new URL("https://api.twitch.tv/helix/channels/followed");
    url.search = new URLSearchParams({
      user_id: userId,
      broadcaster_id: this.config.broadcasterId
    }).toString();
    const response = await this.helixFetch(url, accessToken);
    if (!response.ok) {
      throw apiError(response, "Could not read Twitch follow status.");
    }
    const result = await parseJson(response, followedChannelsSchema);
    const follow = result.data.find(
      (entry) => entry.broadcaster_id === this.config.broadcasterId
    );
    return follow?.followed_at ?? null;
  }

  private async checkSubscription(
    accessToken: string,
    userId: string
  ): Promise<boolean> {
    const url = new URL("https://api.twitch.tv/helix/subscriptions/user");
    url.search = new URLSearchParams({
      user_id: userId,
      broadcaster_id: this.config.broadcasterId
    }).toString();
    const response = await this.helixFetch(url, accessToken);
    if (response.status === 404) {
      return false;
    }
    if (!response.ok) {
      throw apiError(response, "Could not read Twitch subscription status.");
    }
    const result = await parseJson(response, subscriptionSchema);
    return result.data.some(
      (entry) => entry.broadcaster_id === this.config.broadcasterId
    );
  }

  private helixFetch(url: URL, accessToken: string): Promise<Response> {
    return this.fetcher(url, {
      headers: {
        authorization: `Bearer ${accessToken}`,
        "client-id": this.config.clientId
      }
    });
  }
}
