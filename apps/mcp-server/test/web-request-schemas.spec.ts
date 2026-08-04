import { describe, expect, it } from "vitest";

import {
  narrationSegmentRequestSchema,
  projectFieldsRequestSchema,
  projectListItemRequestSchema,
  reviewInstructionRequestSchema,
  sceneComponentActionRequestSchema,
  sceneComponentCreateRequestSchema,
  scenePatternCreateRequestSchema,
  slideActionRequestSchema,
  slideFieldsRequestSchema,
  slideNarrationRequestSchema,
  templateCreateRequestSchema,
  voiceJobRequestSchema,
  voiceSetupRequestSchema
} from "../src/web/request-schemas";

describe("Web request schemas", () => {
  it("requires an actual project or slide field update", () => {
    expect(
      projectFieldsRequestSchema.safeParse({ expected_version: 1 }).success
    ).toBe(false);
    expect(
      projectFieldsRequestSchema.safeParse({
        expected_version: 1,
        question: "氷は置く場所で融け方が変わるか？"
      }).success
    ).toBe(true);
    expect(
      projectFieldsRequestSchema.safeParse({
        expected_version: 1,
        question: "問い",
        unknown: true
      }).success
    ).toBe(false);

    expect(
      slideFieldsRequestSchema.safeParse({ expected_version: 1 }).success
    ).toBe(false);
    expect(
      slideFieldsRequestSchema.safeParse({
        expected_version: 1,
        sidebar_markdown: ""
      }).success
    ).toBe(true);
  });

  it("keeps discriminated actions and their bounds stable", () => {
    expect(
      projectListItemRequestSchema.safeParse({
        expected_version: 2,
        action: "move",
        list: "findings",
        index: 0
      }).success
    ).toBe(false);
    expect(
      projectListItemRequestSchema.safeParse({
        expected_version: 2,
        action: "update",
        list: "findings",
        index: 99,
        value: "観察結果"
      }).success
    ).toBe(true);
    expect(
      slideActionRequestSchema.safeParse({
        expected_version: 2,
        action: "move",
        position: 100
      }).success
    ).toBe(false);
  });

  it("rejects duplicate narration steps and incomplete segment tuning", () => {
    expect(
      slideNarrationRequestSchema.safeParse({
        expected_version: 3,
        segments: [
          { at: 0, text: "導入" },
          { at: 0, text: "重複" }
        ]
      }).success
    ).toBe(false);
    expect(
      slideNarrationRequestSchema.safeParse({
        expected_version: 3,
        segments: [
          { at: 0, text: "導入" },
          { at: 1, text: "結果" }
        ]
      }).success
    ).toBe(true);
    expect(
      narrationSegmentRequestSchema.safeParse({
        expected_version: 3,
        text: "読み上げ",
        speaker: null,
        voice_profile_id: null
      }).success
    ).toBe(false);
  });

  it("preserves voice defaults and idempotency requirements", () => {
    expect(
      voiceSetupRequestSchema.parse({ expected_version: 4 })
    ).toMatchObject({
      expected_version: 4,
      profile_id: "voicevox-style-3"
    });
    expect(
      voiceJobRequestSchema.safeParse({ expected_version: 4 }).success
    ).toBe(false);
    expect(
      voiceJobRequestSchema.safeParse({
        expected_version: 4,
        profile_id: "voicevox-style-3",
        idempotency_key: "00000000-0000-4000-8000-000000000001"
      }).success
    ).toBe(true);
  });

  it("keeps identifiers and bounded collections constrained", () => {
    expect(
      templateCreateRequestSchema.safeParse({
        expected_version: 1,
        template_id: "Ice Theme",
        name: "氷",
        visual_preset: "scientific",
        make_default: false
      }).success
    ).toBe(false);
    expect(
      sceneComponentCreateRequestSchema.safeParse({
        expected_version: 1,
        kind: "video",
        parent_id: null
      }).success
    ).toBe(false);
    expect(
      scenePatternCreateRequestSchema.safeParse({
        expected_version: 1,
        pattern: "pattern-key-metrics",
        parent_id: null
      }).success
    ).toBe(true);
    expect(
      scenePatternCreateRequestSchema.safeParse({
        expected_version: 1,
        pattern: "pattern-unknown",
        parent_id: null
      }).success
    ).toBe(false);
    expect(
      sceneComponentActionRequestSchema.safeParse({
        expected_version: 1,
        action: "delete_tree"
      }).success
    ).toBe(true);
    expect(
      sceneComponentActionRequestSchema.safeParse({
        expected_version: 1,
        action: "delete_all"
      }).success
    ).toBe(false);
    expect(
      reviewInstructionRequestSchema.safeParse({
        comment_ids: Array.from(
          { length: 21 },
          (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`
        )
      }).success
    ).toBe(false);
  });
});
