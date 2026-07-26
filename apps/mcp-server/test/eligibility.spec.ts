import { describe, expect, it } from "vitest";

import { evaluateEligibility } from "../src/auth/eligibility";

const now = new Date("2026-07-26T12:00:00.000Z");

describe("Twitch eligibility policy", () => {
  it.each([
    {
      name: "deny override wins over a subscription",
      evidence: { followedAt: "2020-01-01T00:00:00.000Z", subscribed: true },
      override: { value: "deny" as const, reason: "abuse" },
      eligible: false,
      reason: "deny_override"
    },
    {
      name: "allow override permits a new follower",
      evidence: { followedAt: null, subscribed: false },
      override: { value: "allow" as const, reason: "pilot" },
      eligible: true,
      reason: "allow_override"
    },
    {
      name: "an active subscriber is eligible",
      evidence: { followedAt: null, subscribed: true },
      override: null,
      eligible: true,
      reason: "subscriber"
    },
    {
      name: "exactly thirty follow days is eligible",
      evidence: { followedAt: "2026-06-26T12:00:00.000Z", subscribed: false },
      override: null,
      eligible: true,
      reason: "follow_duration"
    },
    {
      name: "a recent re-follow is not eligible",
      evidence: { followedAt: "2026-07-25T12:00:00.000Z", subscribed: false },
      override: null,
      eligible: false,
      reason: "follow_too_recent"
    },
    {
      name: "a non-follower is not eligible",
      evidence: { followedAt: null, subscribed: false },
      override: null,
      eligible: false,
      reason: "not_following"
    }
  ])("$name", ({ evidence, override, eligible, reason }) => {
    const decision = evaluateEligibility({
      evidence,
      override,
      minFollowDays: 30,
      cacheTtlSeconds: 1800,
      now
    });

    expect(decision).toMatchObject({ eligible, reason });
    expect(decision.expires_at).toBe("2026-07-26T12:30:00.000Z");
  });
});
