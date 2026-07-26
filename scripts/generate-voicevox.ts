import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, stat, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  assertVoicevoxTuning,
  mergeVoicevoxTuning,
  type VoicevoxProfile,
  type VoicevoxTuning,
  type VoicevoxTuningOverride
} from "@ultimate-freestyle/research-schema/voice";
import type {
  NarrationSegment,
  ResearchDeck
} from "../components/presentation/types";
import { getDeck, researchDecks } from "../researches/registry";

type SpeakerStyle = {
  id: number;
  name: string;
  type?: "talk" | "sing" | "singing_teacher" | "frame_decode";
};

type Speaker = {
  name: string;
  speaker_uuid: string;
  version: string;
  styles: SpeakerStyle[];
};

type EngineIdentity = {
  build: string;
  version: string;
  coreVersions: string[];
  catalogRevision: string;
  dictionaryRevision: string;
};

type AudioManifestEntry = {
  fingerprint: string;
  textHash: string;
  profileId: string;
  speakerUuid: string;
  speakerName: string;
  speakerVersion: string;
  styleId: number;
  styleName: string;
  tuning: VoicevoxTuning;
  engine: EngineIdentity;
  codec: { format: "mp3"; channels: 1; sampleRate: 24000; bitrateKbps: number };
};

type AudioManifest = {
  version: 2;
  generatedWith: "unverified-local" | "verified-build";
  entries: Record<string, AudioManifestEntry>;
};

type ResolvedVoice = {
  profile: VoicevoxProfile;
  speaker: Speaker;
  style: SpeakerStyle;
  tuning: VoicevoxTuning;
};

const engineUrl = process.env.VOICEVOX_URL ?? "http://127.0.0.1:50021";
const fallbackSpeakerName = process.env.VOICEVOX_SPEAKER ?? "ずんだもん";
const fallbackStyleName = process.env.VOICEVOX_STYLE ?? "ノーマル";
const fallbackTuning: VoicevoxTuningOverride = {
  speedScale: numberSetting("VOICEVOX_SPEED", 1.05),
  pitchScale: numberSetting("VOICEVOX_PITCH", 0),
  intonationScale: numberSetting("VOICEVOX_INTONATION", 1),
  volumeScale: numberSetting("VOICEVOX_VOLUME", 1),
  pauseLengthScale: numberSetting("VOICEVOX_PAUSE_LENGTH", 1),
  prePhonemeLength: numberSetting("VOICEVOX_PRE_PHONEME", 0.1),
  postPhonemeLength: numberSetting("VOICEVOX_POST_PHONEME", 0.1)
};
const bitrateKbps = numberSetting("VOICEVOX_MP3_BITRATE", 64);
const engineBuild =
  process.env.VOICEVOX_ENGINE_IMAGE_DIGEST ?? "unverified-local";
const outputRoot = resolve(
  process.cwd(),
  process.env.VOICEVOX_OUTPUT_ROOT ?? "public/.voicevox-preview/researches"
);
const args = process.argv.slice(2);
const force = args.includes("--force");

function numberSetting(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number.`);
  }
  return value;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)])
    );
  }
  return value;
}

function hash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

async function isFile(path: string): Promise<boolean> {
  return stat(path)
    .then((value) => value.isFile())
    .catch(() => false);
}

async function readManifest(path: string): Promise<AudioManifest> {
  try {
    const manifest = JSON.parse(await readFile(path, "utf8")) as AudioManifest;
    if (manifest.version === 2 && manifest.entries) return manifest;
  } catch {
    // 初回生成、v1 manifest、破損cacheは全segmentを再生成する。
  }
  return {
    version: 2,
    generatedWith: engineBuild === "unverified-local" ? "unverified-local" : "verified-build",
    entries: {}
  };
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(`${engineUrl}${path}`, init);
  if (!response.ok) {
    throw new Error(`VOICEVOX API ${response.status}: ${await response.text()}`);
  }
  return response;
}

async function jsonRequest<T>(path: string): Promise<T> {
  return (await (await request(path)).json()) as T;
}

function talkStyles(speaker: Speaker): SpeakerStyle[] {
  return speaker.styles.filter(
    (style) => style.type === undefined || style.type === "talk"
  );
}

function resolveConfiguredVoice(
  deck: ResearchDeck,
  segment: NarrationSegment,
  speakers: Speaker[],
  fallbackProfile: VoicevoxProfile
): ResolvedVoice {
  const settings = deck.voicevox;
  const profile = settings
    ? settings.profiles.find(
        (candidate) =>
          candidate.id ===
          (segment.voiceProfileId ?? settings.defaultProfileId)
      )
    : fallbackProfile;
  if (profile === undefined) {
    throw new Error(
      `${deck.slug}: VOICEVOX profile not found: ${segment.voiceProfileId ?? settings?.defaultProfileId}`
    );
  }
  const speaker = speakers.find(
    (candidate) => candidate.speaker_uuid === profile.speakerUuid
  );
  const style = speaker
    ? talkStyles(speaker).find((candidate) => candidate.id === profile.styleId)
    : undefined;
  if (speaker === undefined || style === undefined) {
    throw new Error(
      `${deck.slug}: talk voice not found: ${profile.speakerUuid} / style ${profile.styleId}`
    );
  }
  if (
    speaker.name !== profile.speakerName ||
    style.name !== profile.styleName
  ) {
    console.warn(
      `catalog label changed: ${profile.speakerName} (${profile.styleName}) -> ${speaker.name} (${style.name})`
    );
  }
  const tuning = mergeVoicevoxTuning(
    profile.tuning,
    segment.voiceTuning
  );
  assertVoicevoxTuning(tuning);
  return { profile, speaker, style, tuning };
}

function fallbackProfile(speakers: Speaker[]): VoicevoxProfile {
  const speaker = speakers.find((candidate) => candidate.name === fallbackSpeakerName);
  const style = speaker
    ? talkStyles(speaker).find((candidate) => candidate.name === fallbackStyleName)
    : undefined;
  if (speaker === undefined || style === undefined) {
    throw new Error(
      `話者またはtalk styleが見つかりません: ${fallbackSpeakerName} / ${fallbackStyleName}`
    );
  }
  return {
    id: "environment-default",
    label: `${speaker.name}（${style.name}）`,
    speakerUuid: speaker.speaker_uuid,
    speakerName: speaker.name,
    styleId: style.id,
    styleName: style.name,
    tuning: fallbackTuning
  };
}

const speakers = await jsonRequest<Speaker[]>("/speakers").catch((error) => {
  console.error(`VOICEVOX ENGINEへ接続できません: ${engineUrl}`);
  console.error(error instanceof Error ? error.message : error);
  console.error("ENGINEを起動してから再実行してください。");
  process.exit(1);
});

if (args.includes("--list")) {
  for (const speaker of speakers) {
    for (const style of talkStyles(speaker)) {
      console.log(
        `${style.id}\t${speaker.speaker_uuid}\t${speaker.name}\t${style.name}`
      );
    }
  }
  process.exit(0);
}

const requestedSlug = args.find((argument) => !argument.startsWith("--"));
const decks = args.includes("--all")
  ? researchDecks
  : requestedSlug
    ? [getDeck(requestedSlug)].filter(
        (deck): deck is ResearchDeck => deck !== undefined
      )
    : [];

if (!args.includes("--all") && !requestedSlug) {
  console.error(
    "研究slugまたは--allを指定してください。例: bun run voicevox:generate -- starter"
  );
  process.exit(1);
}
if (decks.length === 0) {
  console.error(`研究が登録されていません: ${requestedSlug}`);
  process.exit(1);
}
if (!Number.isInteger(bitrateKbps) || bitrateKbps < 16 || bitrateKbps > 320) {
  throw new Error("VOICEVOX_MP3_BITRATE must be an integer from 16 to 320.");
}

const [engineVersion, coreVersions, userDictionary] = await Promise.all([
  jsonRequest<string>("/version"),
  jsonRequest<string[]>("/core_versions"),
  jsonRequest<Record<string, unknown>>("/user_dict")
]);
const engineIdentity: EngineIdentity = {
  build: engineBuild,
  version: engineVersion,
  coreVersions: [...coreVersions].sort(),
  catalogRevision: hash(
    speakers.map((speaker) => ({
      speakerUuid: speaker.speaker_uuid,
      version: speaker.version,
      styles: talkStyles(speaker).map((style) => ({ id: style.id, type: style.type }))
    }))
  ),
  dictionaryRevision: hash(userDictionary)
};
const environmentProfile = fallbackProfile(speakers);
const temporaryDirectory = await mkdtemp(
  join(tmpdir(), "ultimate-freestyle-voicevox-")
);
let generated = 0;
let skipped = 0;
const usedVoices = new Set<string>();

try {
  for (const deck of decks) {
    const outputDirectory = resolve(outputRoot, deck.slug, "audio");
    const manifestPath = resolve(outputDirectory, ".voicevox-manifest.json");
    await mkdir(outputDirectory, { recursive: true });
    const previousManifest = await readManifest(manifestPath);
    const nextManifest: AudioManifest = {
      version: 2,
      generatedWith:
        engineBuild === "unverified-local" ? "unverified-local" : "verified-build",
      entries: {}
    };

    for (const slide of deck.slides) {
      for (const segment of slide.narration?.segments ?? []) {
        const voice = resolveConfiguredVoice(
          deck,
          segment,
          speakers,
          environmentProfile
        );
        usedVoices.add(`${voice.speaker.name}（${voice.style.name}）`);
        const filename = `${slide.id}-${segment.at}.mp3`;
        const outputPath = resolve(outputDirectory, filename);
        const codec = {
          format: "mp3" as const,
          channels: 1 as const,
          sampleRate: 24000 as const,
          bitrateKbps
        };
        const textHash = hash(segment.text);
        const fingerprint = hash({
          text: segment.text,
          speakerUuid: voice.speaker.speaker_uuid,
          speakerVersion: voice.speaker.version,
          styleId: voice.style.id,
          tuning: voice.tuning,
          engine: engineIdentity,
          codec
        });
        nextManifest.entries[filename] = {
          fingerprint,
          textHash,
          profileId: voice.profile.id,
          speakerUuid: voice.speaker.speaker_uuid,
          speakerName: voice.speaker.name,
          speakerVersion: voice.speaker.version,
          styleId: voice.style.id,
          styleName: voice.style.name,
          tuning: voice.tuning,
          engine: engineIdentity,
          codec
        };

        if (
          !force &&
          previousManifest.entries[filename]?.fingerprint === fingerprint &&
          (await isFile(outputPath))
        ) {
          console.log(`cached ${deck.slug}/audio/${filename}`);
          skipped += 1;
          continue;
        }

        const queryUrl = new URL("/audio_query", engineUrl);
        queryUrl.searchParams.set("speaker", String(voice.style.id));
        queryUrl.searchParams.set("text", segment.text);
        const query = (await (
          await request(`${queryUrl.pathname}${queryUrl.search}`, {
            method: "POST"
          })
        ).json()) as Record<string, unknown>;
        Object.assign(query, voice.tuning);

        const synthesisUrl = new URL("/synthesis", engineUrl);
        synthesisUrl.searchParams.set("speaker", String(voice.style.id));
        const audio = await request(
          `${synthesisUrl.pathname}${synthesisUrl.search}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(query)
          }
        );

        const temporaryWav = resolve(
          temporaryDirectory,
          `${deck.slug}-${slide.id}-${segment.at}.wav`
        );
        await Bun.write(temporaryWav, await audio.arrayBuffer());
        const ffmpeg = Bun.spawn(
          [
            process.env.FFMPEG_PATH ?? "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            temporaryWav,
            "-vn",
            "-ac",
            "1",
            "-ar",
            "24000",
            "-codec:a",
            "libmp3lame",
            "-b:a",
            `${bitrateKbps}k`,
            "-map_metadata",
            "-1",
            outputPath
          ],
          { stdout: "inherit", stderr: "inherit" }
        );
        if ((await ffmpeg.exited) !== 0) {
          throw new Error(
            "MP3変換に失敗しました。ffmpegが利用可能か確認してください。"
          );
        }
        console.log(`generated ${deck.slug}/audio/${filename}`);
        generated += 1;
      }
    }

    for (const filename of Object.keys(previousManifest.entries)) {
      if (nextManifest.entries[filename]) continue;
      await unlink(resolve(outputDirectory, filename)).catch(() => undefined);
      console.log(`removed stale ${deck.slug}/audio/${filename}`);
    }
    await Bun.write(manifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`);
  }
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}

console.log(
  `完了: ${generated}生成・${skipped}再利用 / ${decks.length}研究 / ` +
    `${Array.from(usedVoices).join("、")} / MP3 mono ${bitrateKbps}kbps`
);
