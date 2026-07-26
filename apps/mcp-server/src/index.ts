import { createMcpHandler } from "agents/mcp";

import { createOAuthProvider } from "./auth/oauth";
import { readAuthConfig } from "./auth/config";
import {
  createHealthResult,
  createServer
} from "./server";

function jsonResponse(body: object, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "no-store");

  return Response.json(body, {
    ...init,
    headers
  });
}

async function handleMcpRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const server = createServer(env);
  return createMcpHandler(server, {
    route: "/mcp",
    enableJsonResponse: true
  })(request, env, ctx);
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
    _controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    const provider = createOAuthProvider(env, handleMcpRequest);
    ctx.waitUntil(
      provider.purgeExpiredData(env, { batchSize: 50 }).then((result) => {
        console.log(
          JSON.stringify({
            message: "OAuth KV cleanup completed",
            ...result
          })
        );
      })
    );
  }
} satisfies ExportedHandler<Env>;
