import {
  mergeVoicevoxTuning,
  type VoicevoxTuning,
  type VoicevoxTuningOverride
} from "./voice";

export const VOICEVOX_ENGINE = {
  version: "0.25.1",
  imageDigest:
    "sha256:0434decfca36449b6ade271b5d970e880a875f0806b86acb31830624d2830412",
  catalogRevision: "voicevox-engine-0.25.1",
  dictionaryRevision: "voicevox-engine-0.25.1-default-dictionary"
} as const;

export const VOICEVOX_MP3_CODEC = {
  format: "mp3",
  channels: 1,
  sampleRate: 24_000,
  bitrateKbps: 64
} as const;

export const ZUNDAMON_NORMAL_PROFILE = {
  id: "voicevox-style-3",
  label: "ずんだもん・ノーマル",
  speakerUuid: "388f246b-8c41-4ac1-8e2d-5d79f3ff56d9",
  speakerName: "ずんだもん",
  styleId: 3,
  styleName: "ノーマル",
  tuning: {
    speedScale: 1.05,
    pitchScale: 0,
    intonationScale: 1,
    volumeScale: 1,
    pauseLengthScale: 1,
    prePhonemeLength: 0.1,
    postPhonemeLength: 0.1
  }
} as const;

export type VoiceGenerationInput = {
  text: string;
  speakerUuid: string;
  styleId: number;
  tuning: VoicevoxTuning;
  engine: typeof VOICEVOX_ENGINE;
  codec: typeof VOICEVOX_MP3_CODEC;
};

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)])
    );
  }
  return value;
}

export function createVoiceGenerationInput(options: {
  text: string;
  speakerUuid: string;
  styleId: number;
  profileTuning?: VoicevoxTuningOverride | null;
  segmentTuning?: VoicevoxTuningOverride | null;
}): VoiceGenerationInput {
  return {
    text: options.text,
    speakerUuid: options.speakerUuid,
    styleId: options.styleId,
    tuning: mergeVoicevoxTuning(
      options.profileTuning ?? undefined,
      options.segmentTuning ?? undefined
    ),
    engine: VOICEVOX_ENGINE,
    codec: VOICEVOX_MP3_CODEC
  };
}

export function serializeVoiceGenerationInput(
  input: VoiceGenerationInput
): string {
  return JSON.stringify(canonicalize(input));
}

export async function fingerprintVoiceGenerationInput(
  input: VoiceGenerationInput
): Promise<string> {
  const bytes = new TextEncoder().encode(serializeVoiceGenerationInput(input));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
