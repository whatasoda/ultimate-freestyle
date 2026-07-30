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
  processVoiceGenerationMessage,
  type VoiceGenerationMessage
} from "./voicevox/service";
import { readBytesCapped } from "./lib/http";

export { VoicevoxContainer } from "./voicevox/container";

export const MAX_MCP_REQUEST_BYTES = 256 * 1024;

function isVoiceGenerationMessage(value: unknown): value is VoiceGenerationMessage {
  if (value === null || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  return (
    typeof message.job_id === "string" &&
    /^[0-9a-f-]{36}$/i.test(message.job_id) &&
    typeof message.segment_id === "string" &&
    /^[0-9a-f-]{36}$/i.test(message.segment_id) &&
    typeof message.fingerprint === "string" &&
    /^[0-9a-f]{64}$/.test(message.fingerprint)
  );
}

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

export async function handleMcpRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
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
      if (url.pathname === "/healthz") {
        return jsonResponse(createHealthResult(_env));
      }

      const authConfig = readAuthConfig(_env);
      if (authConfig.mode === "twitch") {
        return await createOAuthProvider(_env, handleMcpRequest).fetch(
          request,
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
    if (controller.cron === "17 3 * * *") {
      const provider = createOAuthProvider(env, handleMcpRequest);
      ctx.waitUntil(
        Promise.all([
          provider.purgeExpiredData(env, { batchSize: 50 }),
          purgeExpiredWebSessions(env.DB)
        ]).then(([result, webSessionsPurged]) => {
          console.log(
            JSON.stringify({
              message: "OAuth KV cleanup completed",
              ...result,
              web_sessions_purged: webSessionsPurged
            })
          );
        })
      );
    }
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
