import { describe, expect, it } from "vitest";

import { isVoiceGenerationMessage } from "../src/voicevox/message";

const validMessage = {
  job_id: "10000000-0000-4000-8000-000000000001",
  segment_id: "20000000-0000-4000-8000-000000000002",
  fingerprint: "a".repeat(64)
};

describe("VOICEVOX queue message", () => {
  it("accepts only the serializable queue contract", () => {
    expect(isVoiceGenerationMessage(validMessage)).toBe(true);
    expect(isVoiceGenerationMessage(null)).toBe(false);
    expect(isVoiceGenerationMessage("message")).toBe(false);
    expect(isVoiceGenerationMessage({ ...validMessage, job_id: 1 })).toBe(
      false
    );
    expect(
      isVoiceGenerationMessage({ ...validMessage, segment_id: "short" })
    ).toBe(false);
    expect(
      isVoiceGenerationMessage({ ...validMessage, fingerprint: "A".repeat(64) })
    ).toBe(false);
  });
});
