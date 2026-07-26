import { z } from "zod";

import {
  WEB_SESSION_COOKIE,
  createSecureCookie,
  hashToken,
  randomToken,
  readCookie
} from "./security";

const SESSION_KEY_PREFIX = "auth:web:session:";
const SESSION_TTL_SECONDS = 24 * 60 * 60;
const SESSION_TOKEN_PATTERN = /^[0-9a-f]{64}$/;

const webSessionSchema = z.object({
  userId: z.string().min(1).max(128),
  twitchLogin: z.string().min(1).max(128),
  csrfToken: z.string().length(64),
  expiresAt: z.string().datetime()
});

export type WebSession = z.infer<typeof webSessionSchema>;

async function sessionKey(token: string): Promise<string> {
  return `${SESSION_KEY_PREFIX}${await hashToken(token)}`;
}

export async function createWebSession(
  kv: KVNamespace,
  options: { userId: string; twitchLogin: string; now?: Date }
): Promise<{ session: WebSession; cookie: string }> {
  const token = randomToken();
  const now = options.now ?? new Date();
  const session = webSessionSchema.parse({
    userId: options.userId,
    twitchLogin: options.twitchLogin,
    csrfToken: randomToken(),
    expiresAt: new Date(now.getTime() + SESSION_TTL_SECONDS * 1000).toISOString()
  });
  await kv.put(await sessionKey(token), JSON.stringify(session), {
    expirationTtl: SESSION_TTL_SECONDS
  });
  return {
    session,
    cookie: createSecureCookie(
      WEB_SESSION_COOKIE,
      token,
      SESSION_TTL_SECONDS
    )
  };
}

export async function readWebSession(
  request: Request,
  kv: KVNamespace,
  now = new Date()
): Promise<WebSession | null> {
  const token = readCookie(request, WEB_SESSION_COOKIE);
  if (token === null || !SESSION_TOKEN_PATTERN.test(token)) {
    return null;
  }
  const stored = await kv.get(await sessionKey(token), "json");
  const parsed = webSessionSchema.safeParse(stored);
  if (!parsed.success || Date.parse(parsed.data.expiresAt) <= now.getTime()) {
    return null;
  }
  return parsed.data;
}

export async function deleteWebSession(
  request: Request,
  kv: KVNamespace
): Promise<void> {
  const token = readCookie(request, WEB_SESSION_COOKIE);
  if (token !== null && SESSION_TOKEN_PATTERN.test(token)) {
    await kv.delete(await sessionKey(token));
  }
}
