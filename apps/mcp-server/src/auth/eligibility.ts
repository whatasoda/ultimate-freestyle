export type EligibilityOverride = {
  value: "allow" | "deny";
  reason: string;
};

export type EligibilityEvidence = {
  followedAt: string | null;
  subscribed: boolean;
};

export type EligibilityDecision = {
  eligible: boolean;
  reason:
    | "deny_override"
    | "allow_override"
    | "subscriber"
    | "follow_duration"
    | "follow_too_recent"
    | "not_following";
  checked_at: string;
  expires_at: string;
  followed_at: string | null;
  follow_days: number | null;
  subscribed: boolean;
  override: "allow" | "deny" | null;
};

type EvaluateEligibilityOptions = {
  evidence: EligibilityEvidence;
  override: EligibilityOverride | null;
  minFollowDays: number;
  cacheTtlSeconds: number;
  now?: Date;
};

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export function evaluateEligibility({
  evidence,
  override,
  minFollowDays,
  cacheTtlSeconds,
  now = new Date()
}: EvaluateEligibilityOptions): EligibilityDecision {
  if (!Number.isSafeInteger(minFollowDays) || minFollowDays < 0) {
    throw new Error("minFollowDays must be a non-negative integer.");
  }
  if (!Number.isSafeInteger(cacheTtlSeconds) || cacheTtlSeconds <= 0) {
    throw new Error("cacheTtlSeconds must be a positive integer.");
  }
  if (!Number.isFinite(now.getTime())) {
    throw new Error("now must be a valid date.");
  }

  let followDays: number | null = null;
  if (evidence.followedAt !== null) {
    const followedAt = new Date(evidence.followedAt);
    if (!Number.isFinite(followedAt.getTime())) {
      throw new Error("followedAt must be an RFC 3339 timestamp.");
    }
    if (followedAt.getTime() > now.getTime()) {
      throw new Error("followedAt must not be in the future.");
    }
    followDays = Math.floor(
      (now.getTime() - followedAt.getTime()) / MILLISECONDS_PER_DAY
    );
  }

  let eligible = false;
  let reason: EligibilityDecision["reason"];

  if (override?.value === "deny") {
    reason = "deny_override";
  } else if (override?.value === "allow") {
    eligible = true;
    reason = "allow_override";
  } else if (evidence.subscribed) {
    eligible = true;
    reason = "subscriber";
  } else if (followDays !== null && followDays >= minFollowDays) {
    eligible = true;
    reason = "follow_duration";
  } else if (followDays !== null) {
    reason = "follow_too_recent";
  } else {
    reason = "not_following";
  }

  return {
    eligible,
    reason,
    checked_at: now.toISOString(),
    expires_at: new Date(
      now.getTime() + cacheTtlSeconds * 1000
    ).toISOString(),
    followed_at: evidence.followedAt,
    follow_days: followDays,
    subscribed: evidence.subscribed,
    override: override?.value ?? null
  };
}
