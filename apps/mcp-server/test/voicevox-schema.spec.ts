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

  it("accepts optional presentation presets and narration appearance without migrating version 1", () => {
    const project = voiceProject();
    project.deck!.aspect_ratio = "4:3";
    project.deck!.loading_screen = {
      enabled: true,
      style: "research-log",
      message: "準備しています",
      show_progress: true,
      minimum_duration_ms: 500
    };
    project.deck!.templates = [
      {
        id: "retro",
        name: "レトロ",
        region_layout: "sidebar-right",
        sidebar_width_percent: 32,
        background: "#151515",
        surface: "#252525",
        foreground: "#fff7d6",
        muted: "#b8d86f",
        accent: "#ffcf4a",
        accent_secondary: "#65ccff",
        border: "#334155",
        corner_radius_px: 0,
        spacing_scale: 0.95,
        font_scale: 0.95,
        enter_animation: "slide-right",
        reveal_animation: "pop",
        visual_preset: "retro-game",
        body_font: "monospace",
        heading_font: "display",
        density: "compact",
        motion_style: "snappy",
        body_weight: 500,
        heading_weight: 800,
        line_height: 1.4,
        letter_spacing_em: 0.02
      }
    ];
    project.deck!.narration_defaults!.display = "subtitle";
    project.deck!.narration_defaults!.appearance = {
      placement: "overlay-bottom",
      size: "compact",
      text_align: "center",
      speaker_visible: false,
      progress_visible: true,
      text_scale: 0.9,
      max_lines: 3
    };
    const narration = project.deck!.slides[0]!.narration!;
    project.deck!.slides[0]!.role = "cover";
    project.deck!.slides[0]!.cover_layout = "split";
    narration.display = "minimal";
    narration.appearance = { placement: "bottom", max_lines: 2 };
    narration.segments[0]!.speaker = "ずんだもん";

    const parsed = projectDocumentSchema.safeParse(project);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.schema_version).toBe(1);
      expect(parsed.data.deck?.aspect_ratio).toBe("4:3");
      expect(parsed.data.deck?.slides[0]?.cover_layout).toBe("split");
    }
  });

  it("rejects arbitrary presentation tokens and unsafe typography bounds", () => {
    const project = voiceProject();
    project.deck!.aspect_ratio = "21:9" as "16:9";
    project.deck!.loading_screen = {
      enabled: true,
      style: "pulse",
      message: "準備中",
      show_progress: true,
      minimum_duration_ms: 5_100
    };
    project.deck!.templates = [
      {
        id: "unsafe",
        name: "unsafe",
        region_layout: "single",
        sidebar_width_percent: 28,
        background: "#ffffff",
        surface: "#eeeeee",
        foreground: "#111111",
        muted: "#555555",
        accent: "#0055aa",
        corner_radius_px: 8,
        spacing_scale: 1,
        font_scale: 1,
        enter_animation: "fade",
        reveal_animation: "rise",
        body_font: "url(https://example.com/font.woff2)" as "gothic",
        line_height: 2.05
      }
    ];
    project.deck!.slides[0]!.narration!.appearance = {
      text_scale: 1.55,
      max_lines: 9
    };

    expect(projectDocumentSchema.safeParse(project).success).toBe(false);
  });
});
