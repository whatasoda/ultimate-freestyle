import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import {
  deleteUserAccount,
  getEligibilityOverride,
  recordAuditEvent,
  purgeExpiredAuditEvents,
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

  it("removes audit events older than the retention window", async () => {
    const userId = await upsertTwitchUser(
      env.DB,
      identity,
      "2026-08-01T00:00:00.000Z"
    );
    await Promise.all([
      recordAuditEvent(env.DB, {
        userId,
        eventType: "retention.old",
        outcome: "succeeded",
        details: {},
        createdAt: "2025-12-31T23:59:59.000Z"
      }),
      recordAuditEvent(env.DB, {
        userId,
        eventType: "retention.current",
        outcome: "succeeded",
        details: {},
        createdAt: "2026-02-03T00:00:00.000Z"
      })
    ]);

    await expect(
      purgeExpiredAuditEvents(
        env.DB,
        new Date("2026-08-01T00:00:00.000Z"),
        180
      )
    ).resolves.toBeGreaterThanOrEqual(1);
    const events = await env.DB.prepare(
      "SELECT event_type FROM audit_events WHERE event_type LIKE 'retention.%' ORDER BY event_type"
    ).all<{ event_type: string }>();
    expect(events.results).toEqual([
      { event_type: "retention.current" }
    ]);
  });

  it("deletes Twitch identity, audit records, and owned projects together", async () => {
    const now = "2026-08-01T00:00:00.000Z";
    const userId = await upsertTwitchUser(
      env.DB,
      { ...identity, user_id: "delete-account-viewer" },
      now
    );
    await env.DB.prepare(
      `INSERT INTO research_projects (
         id, owner_user_id, title, stage, document_json,
         version, idempotency_key, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`
    )
      .bind(
        "de1e7e00-0000-4000-8000-000000000001",
        userId,
        "削除対象",
        "planning",
        "{}",
        "delete-account-test",
        now,
        now
      )
      .run();
    await recordAuditEvent(env.DB, {
      userId,
      eventType: "account.delete.test",
      outcome: "succeeded",
      details: {},
      createdAt: now
    });

    await deleteUserAccount(env.DB, userId);

    await expect(
      env.DB.prepare("SELECT id FROM users WHERE id = ?").bind(userId).first()
    ).resolves.toBeNull();
    await expect(
      env.DB.prepare("SELECT id FROM research_projects WHERE owner_user_id = ?")
        .bind(userId)
        .first()
    ).resolves.toBeNull();
    await expect(
      env.DB.prepare("SELECT id FROM audit_events WHERE user_id = ?")
        .bind(userId)
        .first()
    ).resolves.toBeNull();
  });
});
