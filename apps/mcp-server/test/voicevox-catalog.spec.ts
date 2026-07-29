import { describe, expect, it } from "vitest";

import {
  VOICEVOX_CATALOG,
  findVoicevoxCatalogProfile
} from "@ultimate-freestyle/research-schema/voicevox-catalog";
import { ZUNDAMON_NORMAL_PROFILE } from "@ultimate-freestyle/research-schema/voice-generation";

describe("VOICEVOX catalog", () => {
  it("contains every talk style from ENGINE 0.25.1 and the exact Zundamon identity", () => {
    expect(VOICEVOX_CATALOG).toHaveLength(118);
    expect(findVoicevoxCatalogProfile("voicevox-style-3")).toMatchObject({
      speakerName: "ずんだもん",
      speakerUuid: "388f246b-8c41-4ac1-8e2d-5d79f3ff56d9",
      styleId: 3,
      styleName: "ノーマル"
    });
    expect(ZUNDAMON_NORMAL_PROFILE).toMatchObject({
      id: "voicevox-style-3",
      speakerUuid: "388f246b-8c41-4ac1-8e2d-5d79f3ff56d9"
    });
    expect(new Set(VOICEVOX_CATALOG.map((profile) => profile.styleId)).size).toBe(
      VOICEVOX_CATALOG.length
    );
  });
});
