import type { EligibilityOverride } from "./eligibility";
import type { TwitchIdentity } from "./types";

export function userIdForTwitch(twitchUserId: string): string {
  return `twitch-${twitchUserId}`;
}

export async function upsertTwitchUser(
  db: D1Database,
  identity: TwitchIdentity,
  now: string
): Promise<string> {
  const userId = userIdForTwitch(identity.user_id);
  await db.batch([
    db
      .prepare(
        `INSERT INTO users (id, twitch_user_id, twitch_login, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(twitch_user_id) DO UPDATE SET
           twitch_login = excluded.twitch_login,
           updated_at = excluded.updated_at`
      )
      .bind(userId, identity.user_id, identity.login, now, now),
    db
      .prepare(
        `INSERT INTO oauth_accounts (
           user_id, provider, provider_user_id, provider_login,
           scopes_json, last_validated_at, updated_at
         ) VALUES (?, 'twitch', ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           provider_user_id = excluded.provider_user_id,
           provider_login = excluded.provider_login,
           scopes_json = excluded.scopes_json,
           last_validated_at = excluded.last_validated_at,
           updated_at = excluded.updated_at`
      )
      .bind(
        userId,
        identity.user_id,
        identity.login,
        JSON.stringify(identity.scopes),
        now,
        now
      )
  ]);
  return userId;
}

export async function getEligibilityOverride(
  db: D1Database,
  userId: string,
  now: string
): Promise<EligibilityOverride | null> {
  const row = await db
    .prepare(
      `SELECT access_override, reason
       FROM entitlements
       WHERE user_id = ?
         AND (expires_at IS NULL OR expires_at > ?)`
    )
    .bind(userId, now)
    .first<{ access_override: "allow" | "deny"; reason: string }>();

  return row === null
    ? null
    : { value: row.access_override, reason: row.reason };
}

export async function recordAuditEvent(
  db: D1Database,
  event: {
    userId: string | null;
    eventType: string;
    outcome: string;
    details: Record<string, string | number | boolean | null>;
    createdAt: string;
  }
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO audit_events (
         id, user_id, event_type, outcome, details_json, created_at
       ) VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(
      crypto.randomUUID(),
      event.userId,
      event.eventType,
      event.outcome,
      JSON.stringify(event.details),
      event.createdAt
    )
    .run();
}
