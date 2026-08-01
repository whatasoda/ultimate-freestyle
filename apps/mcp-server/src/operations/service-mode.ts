export const SERVICE_MODE_KEY = "ops:service_mode";

export type ServiceMode = "active" | "maintenance";

export async function readServiceMode(env: Env): Promise<ServiceMode> {
  try {
    return (await env.AUTH_STATE_KV.get(SERVICE_MODE_KEY)) === "maintenance"
      ? "maintenance"
      : "active";
  } catch (error) {
    console.error(
      JSON.stringify({
        message: "Service mode could not be read; continuing in active mode",
        error: error instanceof Error ? error.message : String(error)
      })
    );
    return "active";
  }
}

export function isBlockedDuringMaintenance(request: Request): boolean {
  const path = new URL(request.url).pathname;
  if (!["GET", "HEAD"].includes(request.method)) return true;
  return new Set([
    "/login",
    "/authorize",
    "/oauth/twitch/callback",
    "/register",
    "/token",
    "/mcp"
  ]).has(path);
}
