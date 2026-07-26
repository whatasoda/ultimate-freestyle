import type { AuthRequest } from "@cloudflare/workers-oauth-provider";
import { z } from "zod";

import {
  TWITCH_STATE_COOKIE,
  createSecureCookie,
  hashToken,
  randomToken,
  readCookie,
  secureTokenEqual
} from "./security";
import { oauthAuthRequestSchema } from "./types";

const STATE_TTL_SECONDS = 600;
const STATE_KEY_PREFIX = "oauth:twitch:state:";

const pendingTwitchStateSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("mcp"),
    authRequest: oauthAuthRequestSchema
  }),
  z.object({
    kind: z.literal("web")
  })
]);

export type PendingTwitchState = z.infer<typeof pendingTwitchStateSchema>;

export function mcpTwitchState(authRequest: AuthRequest): PendingTwitchState {
  return { kind: "mcp", authRequest };
}

export function webTwitchState(): PendingTwitchState {
  return { kind: "web" };
}

export async function storeTwitchState(
  env: Env,
  pendingState: PendingTwitchState
): Promise<{ state: string; cookie: string }> {
  const state = randomToken();
  await env.AUTH_STATE_KV.put(
    `${STATE_KEY_PREFIX}${state}`,
    JSON.stringify(pendingState),
    { expirationTtl: STATE_TTL_SECONDS }
  );
  return {
    state,
    cookie: createSecureCookie(
      TWITCH_STATE_COOKIE,
      await hashToken(state),
      STATE_TTL_SECONDS
    )
  };
}

export async function consumeTwitchState(
  request: Request,
  env: Env,
  state: string
): Promise<PendingTwitchState | null> {
  if (!/^[0-9a-f]{64}$/.test(state)) {
    return null;
  }
  const key = `${STATE_KEY_PREFIX}${state}`;
  const [stored, expectedHash] = await Promise.all([
    env.AUTH_STATE_KV.get(key, "json"),
    hashToken(state)
  ]);
  await env.AUTH_STATE_KV.delete(key);

  const cookieHash = readCookie(request, TWITCH_STATE_COOKIE);
  if (
    stored === null ||
    cookieHash === null ||
    !(await secureTokenEqual(cookieHash, expectedHash))
  ) {
    return null;
  }
  const parsed = pendingTwitchStateSchema.safeParse(stored);
  return parsed.success ? parsed.data : null;
}

export const TWITCH_STATE_TTL_SECONDS = STATE_TTL_SECONDS;
