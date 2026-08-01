import { createMcpHandler } from "agents/mcp";

import { createOAuthProvider } from "./auth/oauth";
import { readAuthConfig } from "./auth/config";
import { purgeExpiredWebSessions } from "./auth/web-session";
import {
  createHealthResult,
  createServer
} from "./server";
import {
  dispatchPendingVoiceOutbox,
  failVoiceGenerationMessage,
  processVoiceGenerationMessage
} from "./voicevox/service";
import {
  isVoiceGenerationMessage,
  type VoiceGenerationMessage
} from "./voicevox/message";
import { readBytesCapped } from "./lib/http";
import {
  MAX_MCP_REQUEST_BYTES,
  MAX_OAUTH_PROTOCOL_REQUEST_BYTES
} from "./lib/limits";
import { drainStorageDeletionOutbox } from "./storage/deletion";
import { hashToken } from "./auth/security";
import { purgeExpiredAuditEvents } from "./auth/repository";
import { messagePage } from "./auth/pages";
import {
  isBlockedDuringMaintenance,
  readServiceMode
} from "./operations/service-mode";

export { VoicevoxContainer } from "./voicevox/container";

function jsonResponse(body: object, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "no-store");

  return Response.json(body, {
    ...init,
    headers
  });
}

function mcpRequestError(status: number, code: string, message: string): Response {
  return Response.json(
    {
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32600,
        message,
        data: { code, request_id: crypto.randomUUID() }
      }
    },
    {
      status,
      headers: { "cache-control": "no-store" }
    }
  );
}

function oauthProtocolError(
  status: number,
  error: string,
  description: string
): Response {
  return jsonResponse(
    {
      error,
      error_description: description,
      request_id: crypto.randomUUID()
    },
    { status }
  );
}

async function boundOAuthProtocolRequest(
  request: Request
): Promise<Request | Response> {
  if (
    request.method !== "POST" ||
    !["/register", "/token"].includes(new URL(request.url).pathname)
  ) {
    return request;
  }

  const read = await readBytesCapped(request, MAX_OAUTH_PROTOCOL_REQUEST_BYTES);
  if (!read.ok) {
    return read.reason === "over_cap"
      ? oauthProtocolError(
          413,
          "invalid_request",
          "The OAuth request exceeds the 16 KiB limit."
        )
      : oauthProtocolError(
          400,
          "invalid_request",
          "The OAuth request body could not be read."
        );
  }

  const headers = new Headers(request.headers);
  headers.set("content-length", String(read.value.byteLength));
  return new Request(request.url, {
    method: request.method,
    headers,
    body: read.value
  });
}

export async function handleMcpRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const authorization = request.headers.get("authorization") ?? "anonymous";
  const rateLimit = await env.MCP_RATE_LIMITER.limit({
    key: await hashToken(authorization)
  });
  if (!rateLimit.success) {
    const response = mcpRequestError(
      429,
      "MCP_RATE_LIMITED",
      "Too many MCP requests. Retry after a short delay."
    );
    response.headers.set("retry-after", "60");
    return response;
  }
  let boundedRequest = request;
  if (request.method === "POST") {
    const read = await readBytesCapped(request, MAX_MCP_REQUEST_BYTES);
    if (!read.ok) {
      return read.reason === "over_cap"
        ? mcpRequestError(413, "MCP_REQUEST_TOO_LARGE", "The MCP request exceeds the 256 KiB limit.")
        : mcpRequestError(400, "INVALID_MCP_REQUEST_BODY", "The MCP request body could not be read.");
    }
    const headers = new Headers(request.headers);
    headers.set("content-length", String(read.value.byteLength));
    boundedRequest = new Request(request.url, {
      method: request.method,
      headers,
      body: read.value
    });
  }
  const server = createServer(env);
  return createMcpHandler(server, {
    route: "/mcp",
    enableJsonResponse: true
  })(boundedRequest, env, ctx);
}

export default {
  async fetch(
    request: Request,
    _env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);

    try {
      const serviceMode =
        url.pathname === "/healthz" || isBlockedDuringMaintenance(request)
          ? await readServiceMode(_env)
          : "active";
      if (url.pathname === "/healthz") {
        return jsonResponse({ ...createHealthResult(_env), mode: serviceMode });
      }

      if (
        serviceMode === "maintenance" &&
        isBlockedDuringMaintenance(request)
      ) {
        if (url.pathname === "/mcp") {
          const response = mcpRequestError(
            503,
            "SERVICE_MAINTENANCE",
            "The service is temporarily paused for maintenance."
          );
          response.headers.set("retry-after", "300");
          return response;
        }
        const response = messagePage(
          "メンテナンス中 / Maintenance",
          "現在、制作・認証操作を一時停止しています。公開済みの発表は引き続き閲覧できます。しばらくしてからもう一度お試しください。 / Editing and authentication are temporarily paused. Please try again later.",
          503
        );
        response.headers.set("retry-after", "300");
        return response;
      }

      const authConfig = readAuthConfig(_env);
      if (authConfig.mode === "twitch") {
        const authPaths = new Set([
          "/login",
          "/authorize",
          "/oauth/twitch/callback",
          "/register",
          "/token"
        ]);
        if (authPaths.has(url.pathname)) {
          const actor =
            request.headers.get("cf-connecting-ip") ??
            request.headers.get("user-agent") ??
            "unknown";
          const authRateLimit = await _env.AUTH_RATE_LIMITER.limit({
            key: await hashToken(actor)
          });
          if (!authRateLimit.success) {
            return jsonResponse(
              {
                error: {
                  code: "AUTH_RATE_LIMITED",
                  message: "認証リクエストが集中しています。1分ほど待ってから、もう一度だけ操作してください。"
                },
                request_id: crypto.randomUUID()
              },
              {
                status: 429,
                headers: { "retry-after": "60" }
              }
            );
          }
        }
        const boundedRequest = await boundOAuthProtocolRequest(request);
        if (boundedRequest instanceof Response) {
          return boundedRequest;
        }
        return await createOAuthProvider(_env, handleMcpRequest).fetch(
          boundedRequest,
          _env,
          ctx
        );
      }

      if (url.pathname !== "/mcp") {
        return jsonResponse(
          {
            error: {
              code: "NOT_FOUND",
              message: "The requested endpoint does not exist."
            },
            request_id: crypto.randomUUID()
          },
          { status: 404 }
        );
      }

      return await handleMcpRequest(request, _env, ctx);
    } catch (error) {
      const requestId = crypto.randomUUID();
      console.error(
        JSON.stringify({
          message: "MCP request failed",
          request_id: requestId,
          error: error instanceof Error ? error.message : String(error)
        })
      );
      return jsonResponse(
        {
          error: {
            code: "INTERNAL_ERROR",
            message: "The MCP request could not be processed."
          },
          request_id: requestId
        },
        { status: 500 }
      );
    }
  },
  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    const serviceMode = await readServiceMode(env);
    if (controller.cron === "17 3 * * *") {
      const provider = createOAuthProvider(env, handleMcpRequest);
      ctx.waitUntil(
        Promise.all([
          provider.purgeExpiredData(env, { batchSize: 50 }),
          purgeExpiredWebSessions(env.DB),
          purgeExpiredAuditEvents(env.DB)
        ]).then(([result, webSessionsPurged, auditEventsPurged]) => {
          console.log(
            JSON.stringify({
              message: "OAuth KV cleanup completed",
              ...result,
              web_sessions_purged: webSessionsPurged,
              audit_events_purged: auditEventsPurged
            })
          );
        })
      );
    }
    if (serviceMode === "active") {
      ctx.waitUntil(
        dispatchPendingVoiceOutbox(env).then((voiceMessagesDispatched) => {
          if (voiceMessagesDispatched === 0) return;
          console.log(
            JSON.stringify({
              message: "VOICEVOX outbox dispatched",
              voice_messages_dispatched: voiceMessagesDispatched
            })
          );
        })
      );
    }
    ctx.waitUntil(
      drainStorageDeletionOutbox(env).then((storageDeletion) => {
        if (storageDeletion.selected === 0) return;
        console.log(
          JSON.stringify({
            message: "R2 deletion outbox processed",
            ...storageDeletion
          })
        );
      })
    );
  },
  async queue(
    batch: MessageBatch<VoiceGenerationMessage>,
    env: Env
  ): Promise<void> {
    for (const message of batch.messages) {
      if (!isVoiceGenerationMessage(message.body)) {
        console.error(
          JSON.stringify({
            message: "Invalid VOICEVOX queue message rejected",
            queue_message_id: message.id
          })
        );
        message.ack();
        continue;
      }
      try {
        await processVoiceGenerationMessage(env, message.body);
        message.ack();
      } catch (error) {
        const finalAttempt = message.attempts >= 3;
        await failVoiceGenerationMessage(
          env.DB,
          message.body,
          error,
          finalAttempt
        );
        console.error(
          JSON.stringify({
            message: "VOICEVOX queue message failed",
            queue_message_id: message.id,
            attempt: message.attempts,
            final_attempt: finalAttempt,
            error: error instanceof Error ? error.message : String(error)
          })
        );
        if (finalAttempt) message.ack();
        else message.retry({ delaySeconds: 60 });
      }
    }
  }
} satisfies ExportedHandler<Env, VoiceGenerationMessage>;
