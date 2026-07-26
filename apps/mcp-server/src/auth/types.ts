import { z } from "zod";

export const oauthAuthRequestSchema = z.object({
  responseType: z.string(),
  clientId: z.string(),
  redirectUri: z.string().url(),
  scope: z.array(z.string()),
  state: z.string(),
  codeChallenge: z.string().optional(),
  codeChallengeMethod: z.string().optional(),
  resource: z.union([z.string(), z.array(z.string())]).optional()
});

export const MCP_SCOPES = [
  "research:read",
  "research:write",
  "research:publish"
] as const;

export const TWITCH_SCOPES = [
  "user:read:follows",
  "user:read:subscriptions"
] as const;

export const eligibilityReasonSchema = z.enum([
  "deny_override",
  "allow_override",
  "subscriber",
  "follow_duration",
  "follow_too_recent",
  "not_following"
]);

export const twitchTokenSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  refresh_token: z.string().min(1),
  scope: z.array(z.string()),
  token_type: z.string()
});

export type TwitchToken = z.infer<typeof twitchTokenSchema>;

export const twitchIdentitySchema = z.object({
  client_id: z.string().min(1),
  login: z.string().min(1),
  scopes: z.array(z.string()),
  user_id: z.string().min(1),
  expires_in: z.number().int().positive()
});

export type TwitchIdentity = z.infer<typeof twitchIdentitySchema>;

export const twitchGrantPropsSchema = z.object({
  mcp_scopes: z.array(z.enum(MCP_SCOPES)),
  identity: z.object({
    user_id: z.string().min(1),
    login: z.string().min(1)
  }),
  eligibility: z.object({
    eligible: z.boolean(),
    reason: eligibilityReasonSchema,
    checked_at: z.string().datetime(),
    expires_at: z.string().datetime(),
    followed_at: z.string().datetime().nullable(),
    follow_days: z.number().int().nonnegative().nullable(),
    subscribed: z.boolean(),
    override: z.enum(["allow", "deny"]).nullable()
  }),
  twitch_tokens: z.object({
    access_token: z.string().min(1),
    refresh_token: z.string().min(1),
    expires_at: z.string().datetime(),
    scopes: z.array(z.string())
  })
});

export type TwitchGrantProps = z.infer<typeof twitchGrantPropsSchema>;
