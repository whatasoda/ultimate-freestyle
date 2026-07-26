import type { TwitchConfig } from "./twitch";

export type AuthConfig = {
  mode: "disabled" | "twitch";
  twitch: TwitchConfig;
  minFollowDays: number;
  eligibilityCacheTtlSeconds: number;
};

function parseInteger(name: string, value: string, minimum: number): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
    throw new Error(`${name} must be an integer greater than or equal to ${minimum}.`);
  }
  return parsed;
}

export function readAuthConfig(env: Env): AuthConfig {
  const mode: string = env.MCP_AUTH_MODE;
  if (mode !== "disabled" && mode !== "twitch") {
    throw new Error("MCP_AUTH_MODE must be disabled or twitch.");
  }
  if (
    mode === "twitch" &&
    (!env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET)
  ) {
    throw new Error("Twitch OAuth secrets are not configured.");
  }

  return {
    mode,
    twitch: {
      clientId: env.TWITCH_CLIENT_ID,
      clientSecret: env.TWITCH_CLIENT_SECRET,
      redirectUri: env.TWITCH_REDIRECT_URI,
      broadcasterId: env.TWITCH_BROADCASTER_ID
    },
    minFollowDays: parseInteger(
      "MIN_FOLLOW_DAYS",
      env.MIN_FOLLOW_DAYS,
      0
    ),
    eligibilityCacheTtlSeconds: parseInteger(
      "ELIGIBILITY_CACHE_TTL_SECONDS",
      env.ELIGIBILITY_CACHE_TTL_SECONDS,
      1
    )
  };
}
