import { createHash } from "node:crypto";
import { appendFile, copyFile, mkdir, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { researchDecks } from "../researches/registry";

type AudioManifest = {
  version: 2;
  entries: Record<string, { textHash: string }>;
};

const cacheRoot = resolve(
  process.cwd(),
  process.env.VOICEVOX_CACHE_ROOT ?? ".voicevox-cache/researches"
);
const publicRoot = resolve(process.cwd(), "public/researches");

function hash(text: string) {
  return createHash("sha256").update(JSON.stringify(text)).digest("hex");
}

async function isFile(path: string) {
  return stat(path).then((value) => value.isFile()).catch(() => false);
}

let copied = 0;
let missing = 0;

for (const deck of researchDecks) {
  const cachedDirectory = resolve(cacheRoot, deck.slug, "audio");
  const manifestPath = resolve(cachedDirectory, ".voicevox-manifest.json");
  let manifest: AudioManifest | undefined;
  try {
    const candidate = JSON.parse(await readFile(manifestPath, "utf8")) as AudioManifest;
    if (candidate.version === 2) manifest = candidate;
  } catch {
    console.log(`cache missing ${deck.slug}`);
  }

  for (const slide of deck.slides) {
    for (const segment of slide.narration?.segments ?? []) {
      const filename = `${slide.id}-${segment.at}.mp3`;
      const cachedFile = resolve(cachedDirectory, filename);
      const matchesText = manifest?.entries[filename]?.textHash === hash(segment.text);
      if (!matchesText || !await isFile(cachedFile)) {
        console.log(`browser fallback ${deck.slug}/audio/${filename}`);
        missing += 1;
        continue;
      }

      const outputDirectory = resolve(publicRoot, deck.slug, "audio");
      await mkdir(outputDirectory, { recursive: true });
      await copyFile(cachedFile, resolve(outputDirectory, filename));
      console.log(`synced ${deck.slug}/audio/${filename}`);
      copied += 1;
    }
  }
}

if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, `count=${copied}\nmissing=${missing}\n`);
}

console.log(`完了: ${copied}ファイルを公開用に配置・${missing}segmentはブラウザ読み上げ`);
