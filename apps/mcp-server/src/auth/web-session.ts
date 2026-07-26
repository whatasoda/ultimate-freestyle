import { z } from "zod";

import {
  WEB_CSRF_COOKIE,
  WEB_SESSION_COOKIE,
  clearSecureCookie,
  createSecureCookie,
  hashToken,
  randomToken,
  readCookie,
  secureTokenEqual
} from "./security";

const SESSION_TTL_SECONDS = 24 * 60 * 60;
const SESSION_TOKEN_PATTERN = /^[0-9a-f]{64}$/;

const webSessionSchema = z.object({
  userId: z.string().min(1).max(128),
  twitchLogin: z.string().min(1).max(128),
  csrfToken: z.string().length(64),
  authenticatedAt: z.string().datetime(),
  expiresAt: z.string().datetime()
});

export type WebSession = z.infer<typeof webSessionSchema>;

type WebSessionRow = {
  user_id: string;
  twitch_login: string;
  csrf_token_hash: string;
  authenticated_at: string;
  expires_at: string;
};

export async function createWebSession(
  db: D1Database,
  options: { userId: string; now?: Date }
): Promise<{ cookies: string[] }> {
  const sessionToken = randomToken();
  const csrfToken = randomToken();
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const expiresAt = new Date(
    now.getTime() + SESSION_TTL_SECONDS * 1000
  ).toISOString();
  await db
    .prepare(
      `INSERT INTO web_sessions (
         token_hash, user_id, csrf_token_hash,
         authenticated_at, expires_at, created_at
       ) VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(
      await hashToken(sessionToken),
      options.userId,
      await hashToken(csrfToken),
      nowIso,
      expiresAt,
      nowIso
    )
    .run();
  return {
    cookies: [
      createSecureCookie(
        WEB_SESSION_COOKIE,
        sessionToken,
        SESSION_TTL_SECONDS
      ),
      createSecureCookie(WEB_CSRF_COOKIE, csrfToken, SESSION_TTL_SECONDS)
    ]
  };
}

export async function readWebSession(
  request: Request,
  db: D1Database,
  now = new Date()
): Promise<WebSession | null> {
  const sessionToken = readCookie(request, WEB_SESSION_COOKIE);
  const csrfToken = readCookie(request, WEB_CSRF_COOKIE);
  if (
    sessionToken === null ||
    csrfToken === null ||
    !SESSION_TOKEN_PATTERN.test(sessionToken) ||
    !SESSION_TOKEN_PATTERN.test(csrfToken)
  ) {
    return null;
  }
  const row = await db
    .prepare(
      `SELECT s.user_id, u.twitch_login, s.csrf_token_hash,
              s.authenticated_at, s.expires_at
       FROM web_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`
    )
    .bind(await hashToken(sessionToken), now.toISOString())
    .first<WebSessionRow>();
  if (
    row === null ||
    !(await secureTokenEqual(await hashToken(csrfToken), row.csrf_token_hash))
  ) {
    return null;
  }
  return webSessionSchema.parse({
    userId: row.user_id,
    twitchLogin: row.twitch_login,
    csrfToken,
    authenticatedAt: row.authenticated_at,
    expiresAt: row.expires_at
  });
}

export async function deleteWebSession(
  request: Request,
  db: D1Database
): Promise<void> {
  const token = readCookie(request, WEB_SESSION_COOKIE);
  if (token !== null && SESSION_TOKEN_PATTERN.test(token)) {
    await db
      .prepare("DELETE FROM web_sessions WHERE token_hash = ?")
      .bind(await hashToken(token))
      .run();
  }
}

export async function purgeExpiredWebSessions(
  db: D1Database,
  now = new Date()
): Promise<number> {
  const result = await db
    .prepare("DELETE FROM web_sessions WHERE expires_at <= ?")
    .bind(now.toISOString())
    .run();
  return result.meta.changes;
}

export function clearWebSessionCookies(): string[] {
  return [
    clearSecureCookie(WEB_SESSION_COOKIE),
    clearSecureCookie(WEB_CSRF_COOKIE)
  ];
}
