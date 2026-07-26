import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import {
  getEligibilityOverride,
  recordAuditEvent,
  upsertTwitchUser
} from "../src/auth/repository";

const identity = {
  client_id: "client-id",
  login: "viewer",
  scopes: ["user:read:follows", "user:read:subscriptions"],
  user_id: "viewer-id",
  expires_in: 3600
};

describe("auth repository", () => {
  it("upserts a Twitch account without persisting tokens", async () => {
    const now = "2026-07-26T12:00:00.000Z";
    const userId = await upsertTwitchUser(env.DB, identity, now);
    const row = await env.DB.prepare(
      `SELECT u.twitch_login, o.provider, o.scopes_json
       FROM users u
       JOIN oauth_accounts o ON o.user_id = u.id
       WHERE u.id = ?`
    )
      .bind(userId)
      .first<{
        twitch_login: string;
        provider: string;
        scopes_json: string;
      }>();

    expect(userId).toBe("twitch-viewer-id");
    expect(row).toMatchObject({
      twitch_login: "viewer",
      provider: "twitch"
    });
    expect(JSON.parse(row?.scopes_json ?? "[]")).toEqual(identity.scopes);
  });

  it("returns only an active allow or deny override", async () => {
    const now = "2026-07-26T12:00:00.000Z";
    const userId = await upsertTwitchUser(env.DB, identity, now);
    await env.DB.prepare(
      `INSERT INTO entitlements (
         user_id, access_override, reason, expires_at, updated_at
       ) VALUES (?, 'deny', 'manual stop', '2026-07-27T00:00:00.000Z', ?)
       ON CONFLICT(user_id) DO UPDATE SET
         access_override = excluded.access_override,
         reason = excluded.reason,
         expires_at = excluded.expires_at,
         updated_at = excluded.updated_at`
    )
      .bind(userId, now)
      .run();

    await expect(
      getEligibilityOverride(env.DB, userId, now)
    ).resolves.toEqual({ value: "deny", reason: "manual stop" });
    await expect(
      getEligibilityOverride(env.DB, userId, "2026-07-28T00:00:00.000Z")
    ).resolves.toBeNull();
  });

  it("records audit details without requiring secrets", async () => {
    const now = "2026-07-26T12:00:00.000Z";
    const userId = await upsertTwitchUser(env.DB, identity, now);
    await recordAuditEvent(env.DB, {
      userId,
      eventType: "eligibility.checked",
      outcome: "allowed",
      details: { reason: "subscriber" },
      createdAt: now
    });

    const row = await env.DB.prepare(
      "SELECT outcome, details_json FROM audit_events WHERE user_id = ?"
    )
      .bind(userId)
      .first<{ outcome: string; details_json: string }>();
    expect(row?.outcome).toBe("allowed");
    expect(JSON.parse(row?.details_json ?? "{}")).toEqual({
      reason: "subscriber"
    });
  });
});
