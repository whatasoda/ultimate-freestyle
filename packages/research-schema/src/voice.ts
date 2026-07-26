export type VoicevoxTuning = {
  speedScale: number;
  pitchScale: number;
  intonationScale: number;
  volumeScale: number;
  pauseLengthScale: number;
  prePhonemeLength: number;
  postPhonemeLength: number;
};

export type VoicevoxTuningOverride = Partial<VoicevoxTuning>;

export type VoicevoxProfile = {
  id: string;
  label: string;
  speakerUuid: string;
  speakerName: string;
  styleId: number;
  styleName: string;
  tuning?: VoicevoxTuningOverride;
};

export type VoicevoxSettings = {
  /** `/speakers` のsnapshotを識別する値。生成時のmanifestには実値も残す。 */
  catalogRevision: string;
  defaultProfileId: string;
  profiles: VoicevoxProfile[];
};

export const DEFAULT_VOICEVOX_TUNING: Readonly<VoicevoxTuning> = {
  speedScale: 1,
  pitchScale: 0,
  intonationScale: 1,
  volumeScale: 1,
  pauseLengthScale: 1,
  prePhonemeLength: 0.1,
  postPhonemeLength: 0.1
};

export const VOICEVOX_TUNING_LIMITS = {
  speedScale: { min: 0.5, max: 2 },
  pitchScale: { min: -0.15, max: 0.15 },
  intonationScale: { min: 0, max: 2 },
  volumeScale: { min: 0, max: 2 },
  pauseLengthScale: { min: 0, max: 2 },
  prePhonemeLength: { min: 0, max: 1.5 },
  postPhonemeLength: { min: 0, max: 1.5 }
} as const satisfies Record<keyof VoicevoxTuning, { min: number; max: number }>;

export function mergeVoicevoxTuning(
  ...overrides: Array<VoicevoxTuningOverride | undefined>
): VoicevoxTuning {
  return Object.assign({}, DEFAULT_VOICEVOX_TUNING, ...overrides);
}

export function assertVoicevoxTuning(tuning: VoicevoxTuning): void {
  for (const key of Object.keys(VOICEVOX_TUNING_LIMITS) as Array<
    keyof VoicevoxTuning
  >) {
    const value = tuning[key];
    const range = VOICEVOX_TUNING_LIMITS[key];
    if (
      !Number.isFinite(value) ||
      value < range.min ||
      value > range.max ||
      Math.abs(value * 100 - Math.round(value * 100)) > 1e-8
    ) {
      throw new Error(
        `${key} must be between ${range.min} and ${range.max} in 0.01 steps.`
      );
    }
  }
}
