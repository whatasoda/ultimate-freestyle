import {
  GrantType,
  OAuthError,
  OAuthProvider,
  type AuthRequest,
  type OAuthHelpers
} from "@cloudflare/workers-oauth-provider";

import { evaluateEligibility } from "./eligibility";
import { readAuthConfig } from "./config";
import {
  authorizationCompletePage,
  consentPage,
  externalAuthorizationPage,
  messagePage
} from "./pages";
import {
  getEligibilityOverride,
  recordAuditEvent,
  upsertTwitchUser
} from "./repository";
import {
  CSRF_COOKIE,
  TWITCH_STATE_COOKIE,
  clearSecureCookie,
  createSecureCookie,
  hashToken,
  randomToken,
  readCookie,
  secureTokenEqual
} from "./security";
import {
  consumeTwitchState,
  mcpTwitchState,
  storeTwitchState,
  TWITCH_STATE_TTL_SECONDS
} from "./twitch-state";
import { createWebSession } from "./web-session";
import {
  defaultFetcher,
  TwitchApiError,
  TwitchClient,
  type Fetcher
} from "./twitch";
import {
  MCP_SCOPES,
  twitchGrantPropsSchema,
  type TwitchGrantProps
} from "./types";
import { webLoginCompletePage } from "../web/pages";
import { handleWebRequest } from "../web/router";
import { readUrlEncodedFormCapped } from "../lib/http";

const STATE_TTL_SECONDS = TWITCH_STATE_TTL_SECONDS;

type McpRequestHandler = (
  request: Request,
  env: Env,
  ctx: ExecutionContext
) => Promise<Response>;

function getOAuthHelpers(env: Env): OAuthHelpers {
  const helpers = Reflect.get(env, "OAUTH_PROVIDER");
  if (helpers === null || typeof helpers !== "object") {
    throw new Error("OAuth helpers are unavailable.");
  }
  return helpers as OAuthHelpers;
}

async function revokeUserGrants(env: Env, userId: string): Promise<number> {
  const oauth = getOAuthHelpers(env);
  let cursor: string | undefined;
  let revoked = 0;
  do {
    const page = await oauth.listUserGrants(userId, { limit: 50, cursor });
    for (const grant of page.items) {
      await oauth.revokeGrant(grant.id, userId);
      revoked += 1;
    }
    cursor = page.cursor;
  } while (cursor !== undefined);
  return revoked;
}

function validateRequestedScopes(request: AuthRequest): string[] {
  const supportedScopes = new Set<string>(MCP_SCOPES);
  if (
    request.scope.length === 0 ||
    request.scope.some((scope) => !supportedScopes.has(scope))
  ) {
    throw new OAuthError("invalid_scope", {
      description: "The requested MCP scope is not supported."
    });
  }
  return request.scope;
}

function createGrantProps(options: {
  subjectId: string;
  scopes: string[];
  identity: { user_id: string; login: string };
  eligibility: TwitchGrantProps["eligibility"];
  token: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope: string[];
  };
  now: Date;
}): TwitchGrantProps {
  return twitchGrantPropsSchema.parse({
    subject_id: options.subjectId,
    mcp_scopes: options.scopes,
    identity: options.identity,
    eligibility: options.eligibility,
    twitch_tokens: {
      access_token: options.token.access_token,
      refresh_token: options.token.refresh_token,
      expires_at: new Date(
        options.now.getTime() + options.token.expires_in * 1000
      ).toISOString(),
      scopes: options.token.scope
    }
  });
}

async function handleAuthorize(
  request: Request,
  env: Env,
  fetcher: Fetcher
): Promise<Response> {
  const oauth = getOAuthHelpers(env);
  const authRequest = await oauth.parseAuthRequest(request);
  const scopes = validateRequestedScopes(authRequest);
  const client = await oauth.lookupClient(authRequest.clientId);
  if (client === null) {
    return messagePage("接続エラー", "MCPクライアントを確認できません。", 400);
  }

  if (request.method === "GET") {
    const csrfToken = randomToken();
    return consentPage({
      client,
      scopes,
      csrfToken,
      setCookie: createSecureCookie(
        CSRF_COOKIE,
        await hashToken(csrfToken),
        STATE_TTL_SECONDS
      )
    });
  }

  if (request.method !== "POST") {
    return new Response(null, {
      status: 405,
      headers: { allow: "GET, POST" }
    });
  }

  const form = await readUrlEncodedFormCapped(request, 16 * 1024);
  if (!form.ok) {
    return messagePage(
      "接続エラー",
      form.reason === "over_cap"
        ? "認可リクエストが大きすぎます。"
        : "認可リクエストを読み取れませんでした。",
      form.reason === "over_cap" ? 413 : 400
    );
  }
  const csrfToken = form.value.get("csrf_token");
  const csrfCookie = readCookie(request, CSRF_COOKIE);
  if (
    typeof csrfToken !== "string" ||
    csrfCookie === null ||
    !(await secureTokenEqual(csrfCookie, await hashToken(csrfToken)))
  ) {
    return messagePage("接続エラー", "認可画面の有効期限が切れました。", 403);
  }

  const authConfig = readAuthConfig(env);
  const twitch = new TwitchClient(authConfig.twitch, fetcher);
  const pending = await storeTwitchState(env, mcpTwitchState(authRequest));
  return externalAuthorizationPage(
    twitch.createAuthorizationUrl(pending.state),
    [pending.cookie, clearSecureCookie(CSRF_COOKIE)]
  );
}

async function handleTwitchCallback(
  request: Request,
  env: Env,
  fetcher: Fetcher
): Promise<Response> {
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  if (state === null) {
    return messagePage("認証エラー", "Twitch stateがありません。", 400);
  }
  const pendingState = await consumeTwitchState(request, env, state);
  if (pendingState === null) {
    return messagePage(
      "認証エラー",
      "認証リクエストが無効または期限切れです。",
      403,
      clearSecureCookie(TWITCH_STATE_COOKIE)
    );
  }
  if (url.searchParams.has("error")) {
    return messagePage(
      "認証を中止しました",
      "Twitchでの許可が完了しませんでした。",
      403,
      clearSecureCookie(TWITCH_STATE_COOKIE)
    );
  }
  const code = url.searchParams.get("code");
  if (code === null) {
    return messagePage("認証エラー", "Twitch codeがありません。", 400);
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const config = readAuthConfig(env);
  const twitch = new TwitchClient(config.twitch, fetcher);
  const token = await twitch.exchangeAuthorizationCode(code);
  const identity = await twitch.validateAccessToken(token.access_token);
  const userId = await upsertTwitchUser(env.DB, identity, nowIso);
  const [evidence, override] = await Promise.all([
    twitch.getEligibilityEvidence(token.access_token, identity.user_id),
    getEligibilityOverride(env.DB, userId, nowIso)
  ]);
  const eligibility = evaluateEligibility({
    evidence,
    override,
    minFollowDays: config.minFollowDays,
    cacheTtlSeconds: config.eligibilityCacheTtlSeconds,
    now
  });
  await recordAuditEvent(env.DB, {
    userId,
    eventType: "eligibility.checked",
    outcome: eligibility.eligible ? "allowed" : "denied",
    details: {
      reason: eligibility.reason,
      subscribed: eligibility.subscribed,
      follow_days: eligibility.follow_days
    },
    createdAt: nowIso
  });

  if (!eligibility.eligible) {
    return messagePage(
      "利用条件を満たしていません",
      `現在の判定理由は ${eligibility.reason} です。`,
      403,
      clearSecureCookie(TWITCH_STATE_COOKIE)
    );
  }

  if (pendingState.kind === "web") {
    const webSession = await createWebSession(env.DB, {
      userId,
      now
    });
    await recordAuditEvent(env.DB, {
      userId,
      eventType: "web.login",
      outcome: "allowed",
      details: { eligibility_reason: eligibility.reason },
      createdAt: nowIso
    });
    return webLoginCompletePage([
      ...webSession.cookies,
      clearSecureCookie(TWITCH_STATE_COOKIE)
    ]);
  }

  const authRequest = pendingState.authRequest;
  const scopes = validateRequestedScopes(authRequest);
  const props = createGrantProps({
    subjectId: userId,
    scopes,
    identity,
    eligibility,
    token,
    now
  });
  const oauth = getOAuthHelpers(env);
  const { redirectTo } = await oauth.completeAuthorization({
    request: authRequest,
    userId,
    metadata: {
      twitch_user_id: identity.user_id,
      twitch_login: identity.login,
      eligibility_reason: eligibility.reason,
      checked_at: eligibility.checked_at
    },
    scope: scopes,
    props
  });
  return authorizationCompletePage(
    redirectTo,
    clearSecureCookie(TWITCH_STATE_COOKIE)
  );
}

function toOAuthError(error: unknown): OAuthError {
  if (error instanceof TwitchApiError) {
    if (
      error.code === "TWITCH_TOKEN_INVALID" ||
      error.code === "TWITCH_SCOPE_MISSING" ||
      (error.code === "TWITCH_TOKEN_REFRESH_FAILED" && error.status < 500)
    ) {
      return new OAuthError("invalid_grant", {
        description: "The Twitch authorization is no longer valid."
      });
    }
    return new OAuthError("temporarily_unavailable", {
      description: "Twitch eligibility could not be checked.",
      statusCode: error.status === 429 ? 429 : 503,
      headers: error.retryAfter ? { "retry-after": error.retryAfter } : undefined
    });
  }
  return new OAuthError("server_error", {
    description: "The authorization could not be refreshed.",
    statusCode: 500
  });
}

function validateClientRegistration(
  metadata: Record<string, unknown>,
  request: Request
): { code: string; description: string; status: number } | undefined {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > 16 * 1024) {
    return {
      code: "invalid_client_metadata",
      description: "Client metadata is too large.",
      status: 413
    };
  }

  const clientName = metadata.client_name;
  if (typeof clientName === "string" && clientName.length > 120) {
    return {
      code: "invalid_client_metadata",
      description: "Client name is too long.",
      status: 400
    };
  }

  const redirectUris = metadata.redirect_uris;
  if (!Array.isArray(redirectUris) || redirectUris.length > 10) {
    return {
      code: "invalid_redirect_uri",
      description: "A limited list of redirect URIs is required.",
      status: 400
    };
  }
  const validRedirects = redirectUris.every((value) => {
    if (typeof value !== "string") {
      return false;
    }
    try {
      const url = new URL(value);
      return (
        url.protocol === "https:" ||
        (url.protocol === "http:" &&
          ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
      );
    } catch {
      return false;
    }
  });
  if (!validRedirects) {
    return {
      code: "invalid_redirect_uri",
      description: "Redirect URIs must use HTTPS or an HTTP loopback host.",
      status: 400
    };
  }
}

export function createOAuthProvider(
  env: Env,
  handleMcpRequest: McpRequestHandler,
  fetcher: Fetcher = defaultFetcher
): OAuthProvider<Env> {
  const config = readAuthConfig(env);
  const defaultHandler = {
    async fetch(request: Request, requestEnv: Env): Promise<Response> {
      const path = new URL(request.url).pathname;
      try {
        const webResponse = await handleWebRequest(request, requestEnv, fetcher, {
          revokeUserGrants: (userId) => revokeUserGrants(requestEnv, userId)
        });
        if (webResponse !== null) {
          return webResponse;
        }
        if (path === "/authorize") {
          return await handleAuthorize(request, requestEnv, fetcher);
        }
        if (path === "/oauth/twitch/callback" && request.method === "GET") {
          return await handleTwitchCallback(request, requestEnv, fetcher);
        }
        return Response.json(
          {
            error: { code: "NOT_FOUND", message: "Endpoint not found." },
            request_id: crypto.randomUUID()
          },
          { status: 404 }
        );
      } catch (error) {
        const twitchError =
          error instanceof TwitchApiError
            ? { code: error.code, status: error.status }
            : undefined;
        console.error(
          JSON.stringify({
            message: "OAuth request failed",
            path,
            error: error instanceof Error ? error.message : String(error),
            twitch_error: twitchError
          })
        );
        return messagePage(
          "認証エラー",
          "認証処理を完了できませんでした。もう一度接続してください。",
          500
        );
      }
    }
  } satisfies ExportedHandler<Env>;

  return new OAuthProvider<Env>({
    apiRoute: "/mcp",
    apiHandler: {
      fetch: handleMcpRequest
    },
    defaultHandler,
    authorizeEndpoint: "/authorize",
    tokenEndpoint: "/token",
    clientRegistrationEndpoint: "/register",
    scopesSupported: [...MCP_SCOPES],
    allowImplicitFlow: false,
    allowPlainPKCE: false,
    allowTokenExchangeGrant: false,
    accessTokenTTL: config.eligibilityCacheTtlSeconds,
    refreshTokenTTL: 30 * 24 * 60 * 60,
    clientRegistrationTTL: 90 * 24 * 60 * 60,
    clientRegistrationCallback({ clientMetadata, request }) {
      return validateClientRegistration(clientMetadata, request);
    },
    resourceMetadata: {
      resource: "https://saijiyu-kenkyu.2764.moe/mcp",
      authorization_servers: ["https://saijiyu-kenkyu.2764.moe"],
      scopes_supported: [...MCP_SCOPES],
      bearer_methods_supported: ["header"],
      resource_name: "最自由研究 Remote MCP"
    },
    tokenExchangeCallback: async (options) => {
      if (options.grantType === GrantType.AUTHORIZATION_CODE) {
        return { accessTokenTTL: config.eligibilityCacheTtlSeconds };
      }
      if (options.grantType !== GrantType.REFRESH_TOKEN) {
        return;
      }

      try {
        const previous = twitchGrantPropsSchema.parse(options.props);
        const twitch = new TwitchClient(config.twitch, fetcher);
        const token = await twitch.refreshAccessToken(
          previous.twitch_tokens.refresh_token
        );
        const identity = await twitch.validateAccessToken(token.access_token);
        if (identity.user_id !== previous.identity.user_id) {
          throw new TwitchApiError(
            "TWITCH_TOKEN_INVALID",
            "Twitch identity changed during refresh.",
            401
          );
        }
        const now = new Date();
        const nowIso = now.toISOString();
        const userId = await upsertTwitchUser(env.DB, identity, nowIso);
        const [evidence, override] = await Promise.all([
          twitch.getEligibilityEvidence(token.access_token, identity.user_id),
          getEligibilityOverride(env.DB, userId, nowIso)
        ]);
        const eligibility = evaluateEligibility({
          evidence,
          override,
          minFollowDays: config.minFollowDays,
          cacheTtlSeconds: config.eligibilityCacheTtlSeconds,
          now
        });
        await recordAuditEvent(env.DB, {
          userId,
          eventType: "eligibility.refreshed",
          outcome: eligibility.eligible ? "allowed" : "denied",
          details: { reason: eligibility.reason },
          createdAt: nowIso
        });
        if (!eligibility.eligible) {
          throw new OAuthError("invalid_grant", {
            description: "The Twitch account is no longer eligible."
          });
        }

        return {
          newProps: createGrantProps({
            subjectId: userId,
            scopes: previous.mcp_scopes,
            identity,
            eligibility,
            token,
            now
          }),
          accessTokenTTL: Math.min(
            config.eligibilityCacheTtlSeconds,
            token.expires_in
          )
        };
      } catch (error) {
        if (error instanceof OAuthError) {
          throw error;
        }
        throw toOAuthError(error);
      }
    },
    onError(error) {
      console.warn(
        JSON.stringify({
          message: "OAuth provider rejected request",
          code: error.code,
          status: error.status,
          internal_category: error.internal?.category,
          internal_reason: error.internal?.reason
        })
      );
    }
  });
}
