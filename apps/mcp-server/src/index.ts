import { createMcpHandler } from "agents/mcp";

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

      const server = createServer(_env);
      return await createMcpHandler(server, {
        route: "/mcp",
        enableJsonResponse: true
      })(request, _env, ctx);
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
  }
} satisfies ExportedHandler<Env>;
