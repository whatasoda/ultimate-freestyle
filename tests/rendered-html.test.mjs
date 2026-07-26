import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${pathname}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept: "text/html" }
    }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} }
  );
}

test("renders the default presentation", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /研究タイトルを/);
  assert.match(html, /最自由研究 Web Presentation/);
  assert.match(html, /読み上げ進捗/);
  assert.match(html, /読み上げ音量/);
  assert.match(html, /発表レイアウト/);
  assert.match(html, />BIIM</);
  assert.doesNotMatch(html, />番組</);
  assert.match(html, /AUTHOR'S NOTE/);
  assert.match(html, /自動送りをオン/);
});

test("renders a registered research at its direct URL", async () => {
  const response = await render("/present/starter");
  assert.equal(response.status, 200);
  assert.match(await response.text(), /あなたの名前/);
});

test("keeps Claude and project assumptions in the repository", async () => {
  const [claude, assumptions, design, styles, skill, dialogue, rubric] = await Promise.all([
    readFile(new URL("../CLAUDE.md", import.meta.url), "utf8"),
    readFile(new URL("../docs/最自由研究2026.md", import.meta.url), "utf8"),
    readFile(new URL("../docs/設計.md", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../.agents/skills/research-companion/SKILL.md", import.meta.url), "utf8"),
    readFile(new URL("../.agents/skills/research-companion/references/dialogue-flow.md", import.meta.url), "utf8"),
    readFile(new URL("../.agents/skills/research-companion/references/evaluation-rubric.md", import.meta.url), "utf8")
  ]);
  assert.match(claude, /bun run test/);
  assert.match(assumptions, /2026年9月1日〜5日/);
  assert.match(design, /発表物間のリンク一覧や選択UIは作らない/);
  assert.match(design, /dialogue/);
  assert.match(design, /commentary/);
  assert.match(design, /inline/);
  assert.match(design, /16:9/);
  assert.match(styles, /aspect-ratio:\s*16 \/ 9/);
  assert.match(styles, /container-name:\s*presentation-stage/);
  assert.match(styles, /data-layout="biim"/);
  assert.match(styles, /data-layout="minimal"/);
  assert.doesNotMatch(styles, /data-layout="broadcast"/);
  assert.match(skill, /一度に一問/);
  assert.match(dialogue, /種を見つける/);
  assert.match(rubric, /8観点/);
  assert.match(rubric, /根拠不足は `NE`/);
});

test("includes generated VOICEVOX audio for every starter narration segment", async () => {
  const audioRoot = new URL("../public/researches/starter/audio/", import.meta.url);
  const files = (await readdir(audioRoot)).filter((file) => file.endsWith(".wav"));
  assert.equal(files.length, 20);

  const titleAudio = await readFile(new URL("title-0.wav", audioRoot));
  assert.equal(titleAudio.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(titleAudio.subarray(8, 12).toString("ascii"), "WAVE");
});

test("keeps VOICEVOX generation opt-in on GitHub Actions", async () => {
  const [workflow, generator] = await Promise.all([
    readFile(
      new URL("../.github/workflows/generate-voicevox.yml", import.meta.url),
      "utf8"
    ),
    readFile(
      new URL("../scripts/generate-voicevox.ts", import.meta.url),
      "utf8"
    )
  ]);

  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /"voice-\*"/);
  assert.doesNotMatch(workflow, /branches:/);
  assert.match(workflow, /retention-days: 7/);
  assert.match(generator, /args\.includes\("--all"\)/);
});

test("persists volume locally and presentation progress in the URL", async () => {
  const presentation = await readFile(
    new URL("../components/presentation/Presentation.tsx", import.meta.url),
    "utf8"
  );
  assert.match(presentation, /ultimate-freestyle:narration-volume/);
  assert.match(presentation, /localStorage\.setItem/);
  assert.match(presentation, /history\[.*pushState/);
  assert.match(presentation, /addEventListener\("popstate"/);
  assert.match(presentation, /searchParams\.set\("slide"/);
  assert.match(presentation, /searchParams\.set\("step"/);
  assert.match(presentation, /searchParams\.set\("layout"/);
});
