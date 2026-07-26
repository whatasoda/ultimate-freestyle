import { describe, expect, it } from "vitest";

import {
  createEmptyProject,
  projectDocumentSchema
} from "../src/projects/schema";

function voiceProject() {
  const project = createEmptyProject("複数話者テスト");
  project.deck = {
    short_title: "声テスト",
    description: "",
    author: "tester",
    year: 2026,
    accent: "#88cc44",
    layout: "biim",
    narration_defaults: {
      display: "dialogue",
      speaker: null,
      credit: null
    },
    voicevox: {
      catalog_revision: "voicevox-engine-0.25.1",
      default_profile_id: "zundamon-normal",
      profiles: [
        {
          id: "zundamon-normal",
          label: "ずんだもん（ノーマル）",
          speaker_uuid: "388f246b-8c41-4ac1-8e2d-5d79f3ff56d9",
          speaker_name: "ずんだもん",
          style_id: 3,
          style_name: "ノーマル",
          tuning: { speedScale: 1.05, pitchScale: -0.02 }
        }
      ]
    },
    slides: [
      {
        id: "voice",
        title: "声",
        duration_seconds: 10,
        reveal_steps: 0,
        tone: "dark",
        content_markdown: "# voice",
        reveal_blocks: [],
        sidebar_markdown: null,
        narration: {
          display: "dialogue",
          speaker: null,
          segments: [
            {
              at: 0,
              text: "声色を調整します。",
              audio_src: null,
              voice_profile_id: "zundamon-normal",
              voice_tuning: { intonationScale: 1.1 }
            }
          ]
        }
      }
    ]
  };
  return project;
}

describe("VOICEVOX project schema", () => {
  it("accepts stable speaker/style profiles and per-segment tuning", () => {
    expect(projectDocumentSchema.safeParse(voiceProject()).success).toBe(true);
  });

  it("rejects missing profile references and unsafe tuning ranges", () => {
    const project = voiceProject();
    const segment = project.deck!.slides[0]!.narration!.segments[0]!;
    segment.voice_profile_id = "missing-profile";
    segment.voice_tuning = { speedScale: 2.01 };
    const parsed = projectDocumentSchema.safeParse(project);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(
        parsed.error.issues.some(
          (issue) => issue.path.at(-1) === "speedScale"
        )
      ).toBe(true);
      expect(parsed.error.issues.map((issue) => issue.message)).toContain(
        "The referenced VOICEVOX profile does not exist."
      );
    }
  });

  it("rejects duplicate profile IDs and a missing default", () => {
    const project = voiceProject();
    const settings = project.deck!.voicevox!;
    settings.profiles.push({ ...settings.profiles[0]! });
    settings.default_profile_id = "missing-profile";
    const parsed = projectDocumentSchema.safeParse(project);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.map((issue) => issue.message)).toEqual(
        expect.arrayContaining([
          "VOICEVOX profile IDs must be unique.",
          "The default VOICEVOX profile must exist in profiles."
        ])
      );
    }
  });
});
