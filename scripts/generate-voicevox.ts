import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  unlink
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { getDeck, researchDecks } from "../researches/registry";

type Speaker = {
  name: string;
  styles: Array<{ id: number; name: string }>;
};

type AudioManifestEntry = {
  fingerprint: string;
  textHash: string;
  speaker: string;
  style: string;
  styleId: number;
  engineVersion: string;
  bitrateKbps: number;
};

type AudioManifest = {
  version: 1;
  entries: Record<string, AudioManifestEntry>;
};

const engineUrl = process.env.VOICEVOX_URL ?? "http://127.0.0.1:50021";
const speakerName = process.env.VOICEVOX_SPEAKER ?? "ずんだもん";
const styleName = process.env.VOICEVOX_STYLE ?? "ノーマル";
const speedScale = Number(process.env.VOICEVOX_SPEED ?? 1.05);
const intonationScale = Number(process.env.VOICEVOX_INTONATION ?? 1);
const volumeScale = Number(process.env.VOICEVOX_VOLUME ?? 1);
const bitrateKbps = Number(process.env.VOICEVOX_MP3_BITRATE ?? 64);
const outputRoot = resolve(
  process.cwd(),
  process.env.VOICEVOX_OUTPUT_ROOT ?? "public/.voicevox-preview/researches"
);
const args = process.argv.slice(2);
const force = args.includes("--force");

function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function isFile(path: string) {
  return stat(path).then((value) => value.isFile()).catch(() => false);
}

async function readManifest(path: string): Promise<AudioManifest> {
  try {
    const manifest = JSON.parse(await readFile(path, "utf8")) as AudioManifest;
    if (manifest.version === 1 && manifest.entries) return manifest;
  } catch {
    // 初回生成または壊れたキャッシュでは、全segmentを生成し直す。
  }
  return { version: 1, entries: {} };
}

async function request(path: string, init?: RequestInit) {
  const response = await fetch(`${engineUrl}${path}`, init);
  if (!response.ok) {
    throw new Error(`VOICEVOX API ${response.status}: ${await response.text()}`);
  }
  return response;
}

async function getSpeakers() {
  return (await (await request("/speakers")).json()) as Speaker[];
}

const speakers = await getSpeakers().catch((error) => {
  console.error(`VOICEVOX ENGINEへ接続できません: ${engineUrl}`);
  console.error(error instanceof Error ? error.message : error);
  console.error("ENGINEを起動してから再実行してください。");
  process.exit(1);
});

if (args.includes("--list")) {
  for (const speaker of speakers) {
    for (const style of speaker.styles) {
      console.log(`${style.id}\t${speaker.name}\t${style.name}`);
    }
  }
  process.exit(0);
}

const requestedSlug = args.find((arg) => !arg.startsWith("--"));
const decks = args.includes("--all")
  ? researchDecks
  : requestedSlug
    ? [getDeck(requestedSlug)].filter((deck) => deck !== undefined)
    : [];

if (!args.includes("--all") && !requestedSlug) {
  console.error(
    "研究slugまたは--allを指定してください。例: bun run voicevox:generate -- starter"
  );
  process.exit(1);
}

if (!decks.length) {
  console.error(`研究が登録されていません: ${requestedSlug}`);
  process.exit(1);
}

if (
  ![speedScale, intonationScale, volumeScale, bitrateKbps].every(Number.isFinite) ||
  bitrateKbps <= 0
) {
  console.error("VOICEVOXまたはMP3の数値設定が不正です。");
  process.exit(1);
}

const speaker = speakers.find((item) => item.name === speakerName);
const style = speaker?.styles.find((item) => item.name === styleName);
if (!speaker || !style) {
  console.error(`話者またはスタイルが見つかりません: ${speakerName} / ${styleName}`);
  console.error("bun run voicevox:list で利用可能な組み合わせを確認してください。");
  process.exit(1);
}

const engineVersion = (await (await request("/version")).json()) as string;
const temporaryDirectory = await mkdtemp(join(tmpdir(), "ultimate-freestyle-voicevox-"));
let generated = 0;
let skipped = 0;

try {
  for (const deck of decks) {
    const outputDirectory = resolve(outputRoot, deck.slug, "audio");
    const manifestPath = resolve(outputDirectory, ".voicevox-manifest.json");
    await mkdir(outputDirectory, { recursive: true });
    const previousManifest = await readManifest(manifestPath);
    const nextManifest: AudioManifest = { version: 1, entries: {} };

    for (const slide of deck.slides) {
      for (const segment of slide.narration?.segments ?? []) {
        const filename = `${slide.id}-${segment.at}.mp3`;
        const outputPath = resolve(outputDirectory, filename);
        const textHash = hash(segment.text);
        const fingerprint = hash({
          text: segment.text,
          speakerName,
          styleName,
          styleId: style.id,
          speedScale,
          intonationScale,
          volumeScale,
          bitrateKbps,
          engineVersion,
          format: "mp3-mono-v1"
        });
        const entry: AudioManifestEntry = {
          fingerprint,
          textHash,
          speaker: speakerName,
          style: styleName,
          styleId: style.id,
          engineVersion,
          bitrateKbps
        };
        nextManifest.entries[filename] = entry;

        if (
          !force &&
          previousManifest.entries[filename]?.fingerprint === fingerprint &&
          await isFile(outputPath)
        ) {
          console.log(`cached ${deck.slug}/audio/${filename}`);
          skipped += 1;
          continue;
        }

        const queryUrl = new URL("/audio_query", engineUrl);
        queryUrl.searchParams.set("speaker", String(style.id));
        queryUrl.searchParams.set("text", segment.text);

        const query = (await (
          await request(`${queryUrl.pathname}${queryUrl.search}`, { method: "POST" })
        ).json()) as Record<string, unknown>;

        query.speedScale = speedScale;
        query.intonationScale = intonationScale;
        query.volumeScale = volumeScale;

        const synthesisUrl = new URL("/synthesis", engineUrl);
        synthesisUrl.searchParams.set("speaker", String(style.id));
        const audio = await request(`${synthesisUrl.pathname}${synthesisUrl.search}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(query)
        });

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
        if (await ffmpeg.exited !== 0) {
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
  `${speaker.name}（${style.name}, style ${style.id}）/ MP3 mono ${bitrateKbps}kbps`
);
