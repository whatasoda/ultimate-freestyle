import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { getDeck, researchDecks } from "../researches/registry";

type Speaker = {
  name: string;
  styles: Array<{ id: number; name: string }>;
};

const engineUrl = process.env.VOICEVOX_URL ?? "http://127.0.0.1:50021";
const speakerName = process.env.VOICEVOX_SPEAKER ?? "ずんだもん";
const styleName = process.env.VOICEVOX_STYLE ?? "ノーマル";
const args = process.argv.slice(2);

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

const speaker = speakers.find((item) => item.name === speakerName);
const style = speaker?.styles.find((item) => item.name === styleName);
if (!speaker || !style) {
  console.error(`話者またはスタイルが見つかりません: ${speakerName} / ${styleName}`);
  console.error("bun run voicevox:list で利用可能な組み合わせを確認してください。");
  process.exit(1);
}

let generated = 0;
for (const deck of decks) {
  const outputDirectory = resolve(
    process.cwd(),
    "public",
    "researches",
    deck.slug,
    "audio"
  );
  await mkdir(outputDirectory, { recursive: true });

  for (const slide of deck.slides) {
    for (const segment of slide.narration?.segments ?? []) {
      const queryUrl = new URL("/audio_query", engineUrl);
      queryUrl.searchParams.set("speaker", String(style.id));
      queryUrl.searchParams.set("text", segment.text);

      const query = (await (
        await request(`${queryUrl.pathname}${queryUrl.search}`, { method: "POST" })
      ).json()) as Record<string, unknown>;

      query.speedScale = Number(process.env.VOICEVOX_SPEED ?? 1.05);
      query.intonationScale = Number(process.env.VOICEVOX_INTONATION ?? 1);
      query.volumeScale = Number(process.env.VOICEVOX_VOLUME ?? 1);

      const synthesisUrl = new URL("/synthesis", engineUrl);
      synthesisUrl.searchParams.set("speaker", String(style.id));
      const audio = await request(`${synthesisUrl.pathname}${synthesisUrl.search}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(query)
      });

      const filename = `${slide.id}-${segment.at}.wav`;
      await Bun.write(resolve(outputDirectory, filename), await audio.arrayBuffer());
      console.log(`generated ${deck.slug}/audio/${filename}`);
      generated += 1;
    }
  }
}

console.log(
  `完了: ${generated}ファイル / ${decks.length}研究 / ${speaker.name}（${style.name}, style ${style.id}）`
);
