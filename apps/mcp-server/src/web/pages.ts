import { escapeHtml } from "../auth/pages";
import type { ProjectAsset } from "../assets/schema";
import type {
  ProjectRecord,
  ProjectSummary,
  SlideSceneNode
} from "../projects/schema";
import {
  DEFAULT_VOICEVOX_TUNING,
  VOICEVOX_TUNING_LIMITS,
  mergeVoicevoxTuning,
  type VoicevoxTuning
} from "@ultimate-freestyle/research-schema/voice";
import type { PublicationStatus } from "../publications/service";
import { VOICEVOX_CATALOG } from "@ultimate-freestyle/research-schema/voicevox-catalog";
import { resolveSlideTypography } from "../projects/typography";

const STAGE_LABELS: Record<ProjectSummary["stage"], string> = {
  discovery: "発見",
  design: "設計",
  fieldwork: "調査・実験",
  story: "構成",
  production: "制作",
  review: "見直し"
};

const TONE_LABELS = {
  dark: "ダーク",
  light: "ライト",
  signal: "アクセント",
  quiet: "静かな明色"
} as const;

const ANIMATION_LABELS = {
  none: "なし",
  fade: "フェード",
  rise: "下から浮上",
  zoom: "ズーム",
  wipe: "ワイプ",
  "slide-left": "左へスライド",
  "slide-right": "右へスライド",
  pop: "ポップ",
  blur: "ぼかし解除"
} as const;

const VISUAL_LABELS = {
  studio: "スタジオ",
  paper: "紙面",
  editorial: "エディトリアル",
  neon: "ネオン",
  "retro-game": "レトロゲーム",
  "soft-pop": "ソフトポップ",
  scientific: "サイエンス"
} as const;

const FONT_LABELS = {
  "system-sans": "端末標準ゴシック",
  gothic: "モダンゴシック",
  rounded: "丸ゴシック",
  mincho: "明朝",
  serif: "クラシックセリフ",
  monospace: "等幅",
  display: "強調見出し"
} as const;

const DENSITY_LABELS = {
  spacious: "ゆったり",
  comfortable: "標準",
  compact: "コンパクト"
} as const;

const SLIDE_TYPOGRAPHY_LABELS = {
  statement: "一言を大きく",
  standard: "標準（短文・箇条書き）",
  article: "読み物（長文）",
  columns: "2段組み（長文）",
  dense: "高密度（最終調整）"
} as const;

const MOTION_LABELS = {
  calm: "穏やか",
  snappy: "小気味よい",
  dramatic: "ドラマチック"
} as const;

const NARRATION_DISPLAY_LABELS = {
  dialogue: "ADV会話枠",
  commentary: "実況字幕",
  inline: "全文追従",
  subtitle: "映像字幕",
  minimal: "最小表示"
} as const;

const DASHBOARD_SCRIPT_SRC = "/assets/dashboard.js?v=11";

const TUNING_LABELS: Record<keyof VoicevoxTuning, string> = {
  speedScale: "話速",
  pitchScale: "音高",
  intonationScale: "抑揚",
  volumeScale: "音量",
  pauseLengthScale: "句読点の間",
  prePhonemeLength: "読み始め前の無音",
  postPhonemeLength: "読み終わり後の無音"
};

const VOICE_SEGMENT_STATUS_LABELS: Record<string, string> = {
  not_configured: "声未設定",
  needs_generation: "要生成",
  queued: "待機中",
  running: "生成中",
  generating: "生成中",
  ready: "生成済み",
  failed: "失敗",
  superseded: "設定変更あり"
};

const VOICE_JOB_STATUS_LABELS: Record<string, string> = {
  queued: "生成待ち",
  starting: "音声エンジン準備中",
  starting_engine: "音声エンジン準備中",
  running: "音声を生成中",
  synthesizing: "音声を生成中",
  encoding: "MP3へ変換中",
  storing: "音声を保存中",
  attaching: "発表へ反映中",
  completed: "生成完了",
  partially_failed: "一部の生成に失敗",
  failed: "生成に失敗",
  cancelled: "キャンセル済み"
};

function headers(setCookies: string[] = []): Headers {
  const result = new Headers({
    "cache-control": "no-store",
    "content-security-policy": [
      "default-src 'none'",
      "style-src 'unsafe-inline'",
      "script-src 'self'",
      "connect-src 'self'",
      "img-src 'self' blob: data:",
      "frame-src 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "base-uri 'none'"
    ].join("; "),
    "content-type": "text/html; charset=utf-8",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY"
  });
  for (const cookie of setCookies) {
    result.append("set-cookie", cookie);
  }
  return result;
}

function shell(title: string, body: string): string {
  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <style>
      :root { color-scheme: dark; font-family: Inter, "Noto Sans JP", system-ui, sans-serif; --ink: #eef3fa; --muted: #9aa9bb; --line: #2c3a4e; --panel: #121c2aee; --accent: #9d7bff; }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; background: radial-gradient(circle at 15% -10%, #3a285c 0, transparent 36rem), radial-gradient(circle at 85% 0%, #173e57 0, transparent 32rem), #090f18; color: var(--ink); }
      a { color: inherit; }
      .site-header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; width: min(92vw, 72rem); margin: 0 auto; padding: 1.4rem 0; }
      .brand { text-decoration: none; font-weight: 850; letter-spacing: .02em; }
      .account { display: flex; align-items: center; gap: .75rem; color: var(--muted); }
      .account strong { color: var(--ink); }
      main { width: min(92vw, 72rem); margin: 0 auto; padding: clamp(2rem, 7vw, 6rem) 0 5rem; }
      .hero { max-width: 49rem; }
      .eyebrow { margin: 0 0 .7rem; color: #91ddff; font-size: .78rem; font-weight: 850; letter-spacing: .14em; text-transform: uppercase; }
      h1 { margin: 0; font-size: clamp(2.25rem, 7vw, 5.4rem); line-height: 1.02; letter-spacing: -.045em; }
      .lead { max-width: 42rem; margin: 1.5rem 0 0; color: #bdc9d8; font-size: clamp(1rem, 2vw, 1.2rem); line-height: 1.8; }
      .button, button { display: inline-flex; align-items: center; justify-content: center; min-height: 2.8rem; padding: .7rem 1rem; border: 0; border-radius: .7rem; background: var(--accent); color: white; font: inherit; font-weight: 780; text-decoration: none; cursor: pointer; }
      :where(a, button, input, textarea, select, summary):focus-visible { outline: .2rem solid #91ddff; outline-offset: .18rem; }
      .button.primary { margin-top: 1.7rem; padding: .9rem 1.25rem; }
      .ghost { border: 1px solid var(--line); background: #152131; color: #d6dfeb; }
      .section-head { display: flex; align-items: end; justify-content: space-between; gap: 1rem; margin: 0 0 1.25rem; }
      .section-head h1 { font-size: clamp(2rem, 5vw, 3.6rem); }
      .count { color: var(--muted); }
      .dashboard-tools { display: flex; align-items: end; justify-content: space-between; gap: 1rem; margin: 0 0 1rem; }
      .dashboard-search { display: grid; gap: .35rem; width: min(100%, 28rem); color: #c9d5e4; font-size: .86rem; }
      .dashboard-search input { width: 100%; min-height: 2.8rem; padding: .7rem .85rem; border: 1px solid var(--line); border-radius: .7rem; background: #0a111b; color: var(--ink); font: inherit; }
      .search-empty { margin: 1rem 0; padding: 1rem; border: 1px dashed #52647c; border-radius: .8rem; color: var(--muted); text-align: center; }
      .connection-guide { margin-top: 1.25rem; border: 1px solid #52647c; border-radius: 1rem; background: #101b2aee; }
      .connection-guide > summary { padding: 1rem 1.2rem; cursor: pointer; font-weight: 820; }
      .connection-guide[open] > summary { border-bottom: 1px solid var(--line); }
      .connection-body { display: grid; gap: 1rem; padding: 1.2rem; }
      .connection-body > p { margin: 0; color: var(--muted); line-height: 1.7; }
      .setup-steps { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .7rem; margin: 0; padding: 0; list-style: none; counter-reset: setup; }
      .setup-steps li { padding: .85rem; border: 1px solid var(--line); border-radius: .75rem; background: #08111b; color: #c9d5e4; line-height: 1.6; counter-increment: setup; }
      .setup-steps li::before { content: counter(setup); display: grid; place-items: center; width: 1.55rem; height: 1.55rem; margin-bottom: .55rem; border-radius: 50%; background: var(--accent); color: white; font-weight: 850; }
      .endpoint-box { display: flex; align-items: center; flex-wrap: wrap; gap: .65rem; padding: .75rem; border: 1px dashed #52647c; border-radius: .7rem; background: #07101a; }
      .endpoint-box code { min-width: 0; flex: 1; color: #91ddff; overflow-wrap: anywhere; }
      .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 19rem), 1fr)); gap: 1rem; }
      .card, .empty { border: 1px solid var(--line); border-radius: 1rem; background: linear-gradient(150deg, #182437e8, #101925e8); box-shadow: 0 1rem 3rem #0004; }
      .card-link { display: block; border-radius: 1rem; color: inherit; text-decoration: none; }
      .card-link:hover .card { border-color: #8062dfaa; transform: translateY(-2px); }
      .card-link:focus-visible { outline: .2rem solid #c4b5fd; outline-offset: .2rem; }
      .card { min-height: 13rem; padding: 1.25rem; }
      .card { transition: border-color .15s ease, transform .15s ease; }
      .card-top { display: flex; align-items: center; justify-content: space-between; gap: .75rem; }
      .stage { display: inline-flex; padding: .3rem .58rem; border: 1px solid #7f68c977; border-radius: 999px; background: #8062df20; color: #c7b9ff; font-size: .78rem; font-weight: 800; }
      .version { color: var(--muted); font-size: .78rem; }
      .card h2 { margin: 1.2rem 0 .6rem; font-size: 1.35rem; overflow-wrap: anywhere; }
      .meta { margin: 0; color: var(--muted); font-size: .88rem; line-height: 1.6; }
      .empty { padding: clamp(1.5rem, 5vw, 3rem); text-align: center; }
      .empty h2 { margin-top: 0; }
      .empty p { color: var(--muted); line-height: 1.7; }
      .hint { margin: 1.5rem 0 0; padding: 1rem 1.15rem; border-left: .2rem solid #62d6ff; background: #112334; color: #bfcedd; line-height: 1.7; }
      .journey { display: grid; gap: 1rem; margin: 1.5rem 0; padding: clamp(1rem, 3vw, 1.5rem); border: 1px solid #52647c; border-radius: 1rem; background: linear-gradient(135deg, #16253aee, #111827ee); box-shadow: 0 1rem 3rem #0003; }
      .journey-head { display: flex; align-items: start; justify-content: space-between; gap: 1rem; }
      .journey-head h2, .journey-next h3 { margin: 0; }
      .journey-head p, .journey-next p { margin: .35rem 0 0; color: var(--muted); line-height: 1.65; }
      .journey-progress { min-width: 8rem; text-align: right; }
      .journey-progress strong { display: block; font-size: 1.35rem; }
      .journey-progress progress { width: 8rem; accent-color: #74e6b2; }
      .journey-steps { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .55rem; margin: 0; padding: 0; list-style: none; }
      .journey-step { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: .55rem; align-items: center; padding: .7rem; border: 1px solid var(--line); border-radius: .7rem; color: var(--muted); }
      .journey-step::before { content: "○"; color: #6f8096; font-weight: 900; }
      .journey-step[data-complete="true"] { border-color: #36785b; background: #15312566; color: #c9f7df; }
      .journey-step[data-complete="true"]::before { content: "✓"; color: #74e6b2; }
      .journey-step small { display: block; margin-top: .15rem; color: inherit; opacity: .72; }
      .journey-next { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 1rem; align-items: center; padding: 1rem; border-radius: .8rem; background: #08111baa; }
      .copy-box { display: grid; gap: .65rem; margin-top: 1rem; padding: 1rem; border: 1px dashed #52647c; border-radius: .8rem; background: #0c1724; text-align: left; }
      .copy-box code { color: #dce6f3; line-height: 1.65; white-space: pre-wrap; overflow-wrap: anywhere; }
      .back { display: inline-flex; margin-bottom: 1.5rem; color: #b9c7d8; text-decoration: none; }
      .detail-title { font-size: clamp(2rem, 6vw, 4.5rem); overflow-wrap: anywhere; }
      .detail-grid { display: grid; grid-template-columns: minmax(0, 2fr) minmax(16rem, 1fr); gap: 1rem; margin-top: 1.5rem; }
      .detail-column { display: grid; align-content: start; gap: 1rem; }
      .panel { padding: 1.25rem; border: 1px solid var(--line); border-radius: 1rem; background: var(--panel); }
      .panel-disclosure { padding: 0; }
      .panel-disclosure > summary { padding: 1.15rem 1.25rem; cursor: pointer; font-weight: 820; }
      .panel-disclosure[open] > summary { border-bottom: 1px solid var(--line); }
      .disclosure-body { padding: 1.25rem; }
      .panel h2 { margin: 0 0 .8rem; font-size: 1.05rem; }
      .panel h3 { margin: 1rem 0 .35rem; font-size: .95rem; }
      .panel p, .panel li { color: #bdc9d8; line-height: 1.75; }
      .prose { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
      .plain-list { margin: 0; padding-left: 1.25rem; }
      .plain-list li + li { margin-top: .45rem; }
      .stat-list { display: grid; grid-template-columns: 1fr auto; gap: .55rem 1rem; margin: 0; }
      .stat-list dt { color: var(--muted); }
      .stat-list dd { margin: 0; font-weight: 750; text-align: right; }
      .log { padding: .8rem 0; border-top: 1px solid var(--line); }
      .log:first-of-type { padding-top: 0; border-top: 0; }
      .log small { color: var(--muted); }
      .slide-row { display: grid; grid-template-columns: 2.5rem minmax(0, 1fr) auto; gap: .75rem; align-items: baseline; padding: .7rem 0; border-top: 1px solid var(--line); }
      a.slide-row { color: inherit; text-decoration: none; }
      a.slide-row:hover strong { color: #c7b9ff; }
      a.slide-row:focus-visible { outline: 2px solid #c4b5fd; outline-offset: 3px; }
      .slide-row:first-of-type { border-top: 0; }
      .slide-row span { color: var(--muted); font-size: .85rem; }
      .slide-row strong { overflow-wrap: anywhere; }
      .slide-list { max-height: 32rem; overflow: auto; overscroll-behavior: contain; }
      .asset-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr)); gap: .8rem; }
      .asset { overflow: hidden; border: 1px solid var(--line); border-radius: .8rem; background: #0b1420; }
      .asset img { display: block; width: 100%; aspect-ratio: 16 / 10; object-fit: cover; background: #08101a; }
      .asset-body { display: grid; gap: .55rem; padding: .75rem; }
      .asset-body p { margin: 0; font-size: .86rem; }
      .asset-body button { justify-self: start; min-height: 2.2rem; padding: .45rem .7rem; font-size: .8rem; }
      .upload { display: grid; gap: .8rem; margin-bottom: 1rem; padding: 1rem; border: 1px dashed #52647c; border-radius: .8rem; background: #0c1724; }
      .upload label { display: grid; gap: .35rem; color: #c9d5e4; font-size: .9rem; }
      .upload input { width: 100%; padding: .65rem; border: 1px solid var(--line); border-radius: .55rem; background: #0a111b; color: var(--ink); font: inherit; }
      .upload-preview { display: grid; grid-template-columns: 7rem minmax(0, 1fr); gap: .8rem; align-items: center; padding: .7rem; border: 1px solid var(--line); border-radius: .7rem; background: #08111b; }
      .upload-preview[hidden] { display: none; }
      .upload-preview img { display: block; width: 7rem; aspect-ratio: 16 / 10; object-fit: contain; border-radius: .45rem; background: #05080d; }
      .upload-preview p { margin: 0; color: #dce6f3; font-size: .82rem; overflow-wrap: anywhere; }
      .upload-preview small { display: block; margin-top: .25rem; color: var(--muted); }
      .editor { display: grid; gap: 1rem; }
      .editor-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .9rem; }
      .editor label { display: grid; gap: .4rem; color: #c9d5e4; font-size: .9rem; }
      .editor label.wide { grid-column: 1 / -1; }
      .editor input, .editor textarea, .editor select { width: 100%; padding: .72rem; border: 1px solid var(--line); border-radius: .55rem; background: #0a111b; color: var(--ink); font: inherit; line-height: 1.5; }
      .editor textarea { min-height: 7rem; resize: vertical; }
      .actions { display: flex; align-items: center; flex-wrap: wrap; gap: .7rem; }
      button:disabled { cursor: not-allowed; opacity: .55; }
      button[aria-busy="true"] { cursor: wait; }
      .character-count { justify-self: end; margin-top: -.2rem; color: var(--muted); font-size: .7rem; font-variant-numeric: tabular-nums; }
      .character-count[data-near-limit="true"] { color: #ffd681; font-weight: 750; }
      .publish-state { display: grid; gap: .8rem; }
      .preflight-list { display: grid; gap: .45rem; margin: 0; padding: 0; list-style: none; }
      .preflight-item { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: .65rem; align-items: start; padding: .65rem .7rem; border: 1px solid var(--line); border-radius: .65rem; background: #0a131f; color: #c7d3e1; font-size: .82rem; line-height: 1.55; }
      .preflight-item::before { content: "✓"; display: grid; place-items: center; width: 1.35rem; height: 1.35rem; border-radius: 50%; background: #174d3a; color: #91efc4; font-weight: 900; }
      .preflight-item[data-state="attention"]::before { content: "!"; background: #5a4618; color: #ffe29a; }
      .preflight-item strong, .preflight-item small { display: block; }
      .preflight-item small { margin-top: .12rem; color: var(--muted); }
      .status-row { display: flex; justify-content: space-between; gap: 1rem; padding: .65rem 0; border-top: 1px solid var(--line); }
      .status-row:first-of-type { border-top: 0; }
      .status-row span { color: var(--muted); }
      .success { color: #74e6b2 !important; }
      .warning { color: #ffd681 !important; }
      .upload-actions { display: flex; align-items: center; flex-wrap: wrap; gap: .75rem; }
      .feedback { min-height: 1.4em; margin: 0; color: #9fddf5; font-size: .88rem; }
      .notice { max-width: 42rem; margin: 3rem auto; text-align: center; }
      main.workspace-main { width: min(96vw, 100rem); padding-top: 1rem; }
      .workspace-head { display: flex; align-items: end; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; }
      .workspace-head h1 { font-size: clamp(1.65rem, 3vw, 2.8rem); }
      .workspace-version { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: .55rem; color: var(--muted); }
      .slide-workspace { display: grid; grid-template-columns: minmax(10rem, 15rem) minmax(0, 1fr) minmax(17rem, 22rem); gap: 1rem; align-items: start; }
      body[data-preview-focus="true"] .slide-workspace { grid-template-columns: minmax(0, 1fr); }
      body[data-preview-focus="true"] .filmstrip, body[data-preview-focus="true"] .inspector { display: none; }
      body[data-preview-focus="true"] .workspace-preview { width: min(100%, 96rem); margin: 0 auto; }
      .filmstrip, .inspector { display: grid; gap: .65rem; align-content: start; max-height: calc(100vh - 10rem); overflow: auto; }
      .filmstrip-link { display: grid; grid-template-columns: 2rem minmax(0, 1fr); gap: .55rem; padding: .7rem; border: 1px solid var(--line); border-radius: .65rem; color: #bdc9d8; text-decoration: none; }
      .filmstrip-link span { color: var(--muted); font: 700 .76rem/1.3 ui-monospace, monospace; }
      .filmstrip-link strong { overflow-wrap: anywhere; font-size: .86rem; line-height: 1.35; }
      .filmstrip-link[data-active="true"] { border-color: #9d7bff; background: #8062df20; color: white; }
      .workspace-preview { min-width: 0; padding: .8rem; }
      .workspace-frame { position: relative; width: 100%; aspect-ratio: var(--workspace-aspect, 16 / 9); overflow: hidden; border: 1px solid #40516a; border-radius: .65rem; background: #05080d; box-shadow: 0 1.5rem 4rem #0006; }
      .workspace-frame iframe { position: relative; z-index: 1; display: block; width: 100%; height: 100%; border: 0; }
      .frame-loading { position: absolute; z-index: 2; inset: 0; display: grid; place-items: center; background: #05080de8; color: var(--muted); font-size: .85rem; letter-spacing: .03em; }
      .frame-loading[hidden] { display: none; }
      .step-control { display: flex; align-items: center; justify-content: center; gap: .7rem; margin-top: .8rem; }
      .step-control button { min-height: 2.2rem; padding: .45rem .75rem; }
      .step-control output { min-width: 6rem; color: var(--muted); text-align: center; font: 700 .8rem/1 ui-monospace, monospace; }
      .component-outline { display: grid; gap: .45rem; margin: 0; padding: 0; list-style: none; }
      .component-outline li { overflow: hidden; border: 1px solid var(--line); border-radius: .55rem; color: #bdc9d8; font-size: .8rem; }
      .component-outline-row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: .55rem; align-items: center; padding: .55rem; }
      .component-outline .component-outline { gap: .35rem; margin: 0 .45rem .45rem .85rem; padding-left: .65rem; border-left: 1px solid #52647c; }
      .component-outline .component-outline li { background: #08111b66; }
      .component-outline code { color: #91ddff; }
      .component-outline small { display: block; color: var(--muted); overflow-wrap: anywhere; }
      .component-step { padding: .2rem .38rem; border-radius: 999px; background: #8062df20; color: #c7b9ff; font: 750 .68rem/1 ui-monospace, monospace; white-space: nowrap; }
      .narration-head { display: flex; align-items: center; justify-content: space-between; gap: .75rem; }
      .narration-head .stage { font-size: .68rem; }
      .narration-outline { display: grid; gap: .55rem; margin: 0; padding: 0; list-style: none; }
      .narration-outline li { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: .65rem; padding: .7rem; border: 1px solid var(--line); border-radius: .6rem; background: #08111b66; }
      .narration-outline .component-step { align-self: start; margin-top: .18rem; }
      .narration-outline p { margin: 0; color: #d3dce8; font-size: .83rem; line-height: 1.65; }
      .narration-outline textarea { width: 100%; min-height: 5.5rem; padding: .65rem; border: 1px solid #40516a; border-radius: .5rem; background: #060d16; color: var(--ink); font: inherit; line-height: 1.65; resize: vertical; }
      .mode-note { margin: 0; padding: .75rem; border-left: 3px solid var(--accent); background: #0c1724; color: #bdc9d8; font-size: .84rem; line-height: 1.6; }
      .setting-summary { display: flex; flex-wrap: wrap; gap: .45rem; margin: 0 0 1rem; }
      .setting-chip { display: inline-flex; gap: .35rem; align-items: center; padding: .38rem .58rem; border: 1px solid #52647c; border-radius: 999px; background: #0c1724; color: #d6dfeb; font-size: .75rem; }
      .setting-chip small { color: var(--muted); }
      .inspector-section { overflow: hidden; border: 1px solid var(--line); border-radius: 1rem; background: var(--panel); }
      .inspector-section > summary { display: flex; align-items: center; justify-content: space-between; gap: .7rem; padding: 1rem 1.15rem; cursor: pointer; font-weight: 820; }
      .inspector-section > summary::marker { color: var(--accent); }
      .inspector-section[open] > summary { border-bottom: 1px solid var(--line); }
      .inspector-body { display: grid; gap: .9rem; padding: 1rem; }
      .editor fieldset { display: grid; gap: .7rem; min-width: 0; margin: 0; padding: .8rem; border: 1px solid var(--line); border-radius: .7rem; }
      .editor legend { padding: 0 .35rem; color: #dce6f3; font-size: .82rem; font-weight: 800; }
      .editor input[type="color"] { min-height: 2.7rem; padding: .3rem; }
      .ratio-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .75rem; }
      .ratio-option { display: grid; grid-template-columns: auto 1fr; align-items: center; gap: .65rem; padding: .8rem; border: 1px solid var(--line); border-radius: .75rem; background: #0b1420; cursor: pointer; }
      .ratio-option:has(input:checked) { border-color: #9d7bff; box-shadow: 0 0 0 1px #9d7bff; }
      .ratio-preview { display: block; width: 3.3rem; border: 1px solid #6f8096; background: #1d2b3d; }
      .ratio-preview.wide { aspect-ratio: 16 / 9; }
      .ratio-preview.standard { width: 2.8rem; aspect-ratio: 4 / 3; }
      .editor input[type="checkbox"] { width: auto; accent-color: var(--accent); }
      .check-label { display: flex !important; grid-template-columns: auto 1fr; align-items: center; }
      .setting-table { display: grid; grid-template-columns: minmax(6rem, auto) minmax(0, 1fr); gap: .35rem .75rem; margin: 0; font-size: .78rem; }
      .setting-table dt { color: var(--muted); overflow-wrap: anywhere; }
      .setting-table dd { margin: 0; color: #dce6f3; overflow-wrap: anywhere; }
      .component-detail { border-top: 1px solid var(--line); }
      .component-detail > summary { padding: .55rem; cursor: pointer; color: #dce6f3; }
      .component-detail .setting-table { padding: 0 .65rem .7rem; }
      .voice-segment { display: grid; gap: .75rem; padding: .8rem; border: 1px solid var(--line); border-radius: .75rem; background: #08111b66; }
      .voice-segment-head { display: flex; justify-content: space-between; gap: .65rem; align-items: center; }
      .audio-state { color: #ffd681; font-size: .75rem; }
      .audio-state.ready { color: #74e6b2; }
      .tuning-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .55rem; }
      .tuning-grid label { font-size: .78rem; }
      .inherit-note { color: var(--muted); font-size: .74rem; line-height: 1.55; }
      .quality-status { display: flex; align-items: center; gap: .6rem; margin: 0; padding: .75rem; border: 1px solid #35506a; border-radius: .7rem; background: #0a1b29; color: #bfe6f7; font-size: .84rem; line-height: 1.55; }
      .quality-status[data-level="warning"] { border-color: #826b30; background: #2a210d; color: #ffe09a; }
      .quality-list { display: grid; gap: .45rem; margin: 0; padding-left: 1.2rem; color: #bdc9d8; font-size: .8rem; line-height: 1.55; }
      .swatches { display: flex; gap: .35rem; }
      .swatch { width: 1.2rem; height: 1.2rem; border: 1px solid #ffffff55; border-radius: .3rem; background: var(--swatch); }
      [data-dirty="true"] button[type="submit"]::after { content: " · 未保存"; }
      main.voice-main { width: min(94vw, 84rem); padding-top: 1rem; }
      .voice-hero { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 1rem; align-items: end; margin-bottom: 1.2rem; }
      .voice-hero h1 { font-size: clamp(2rem, 5vw, 4rem); }
      .voice-hero .lead { margin-top: .8rem; }
      .voice-flow { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(18rem, .8fr); gap: 1rem; align-items: start; }
      .voice-column { display: grid; gap: 1rem; }
      .voice-step { display: grid; gap: .9rem; }
      .voice-step-head { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: .8rem; align-items: start; }
      .voice-step-number { display: grid; place-items: center; width: 2rem; height: 2rem; border-radius: 50%; background: var(--accent); color: white; font: 850 .8rem/1 ui-monospace, monospace; }
      .voice-step h2 { margin: .2rem 0 0; }
      .voice-step-head p { margin: .3rem 0 0; color: var(--muted); font-size: .85rem; line-height: 1.55; }
      .voice-preset { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: .85rem; align-items: center; padding: .9rem; border: 1px solid #52647c; border-radius: .8rem; background: linear-gradient(135deg, #102531, #111827); }
      .voice-character { display: grid; place-items: center; width: 3.2rem; height: 3.2rem; border: 2px solid #b6ef78; border-radius: 48% 52% 45% 55%; background: #6bbd45; color: #10230d; font-size: 1.4rem; box-shadow: inset 0 0 0 .35rem #d6f6a8; }
      .voice-preset strong, .voice-preset small { display: block; }
      .voice-preset label { display: grid; gap: .35rem; min-width: 0; }
      .voice-preset select { width: 100%; padding: .65rem; border: 1px solid #52647c; border-radius: .55rem; background: #08111b; color: var(--ink); font: inherit; }
      .voice-preset small { margin-top: .25rem; color: var(--muted); line-height: 1.5; }
      .voice-preset .stage { justify-self: end; }
      .voice-quick { display: flex; flex-wrap: wrap; gap: .45rem; }
      .voice-quick button { min-height: 2.2rem; padding: .45rem .7rem; font-size: .78rem; }
      .voice-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .55rem; }
      .voice-stat { padding: .75rem; border: 1px solid var(--line); border-radius: .7rem; background: #08111b88; }
      .voice-stat span, .voice-stat strong { display: block; }
      .voice-stat span { color: var(--muted); font-size: .72rem; }
      .voice-stat strong { margin-top: .25rem; font-size: 1.35rem; }
      .voice-stat.ready strong { color: #74e6b2; }
      .voice-stat.pending strong { color: #ffd681; }
      .job-card { display: grid; gap: .7rem; padding: .9rem; border: 1px solid #52647c; border-radius: .8rem; background: #0b1724; }
      .job-card[data-state="completed"] { border-color: #36785b; }
      .job-card[data-state="failed"], .job-card[data-state="partially_failed"] { border-color: #8b514f; }
      .job-head { display: flex; justify-content: space-between; gap: .8rem; align-items: center; }
      .job-progress { width: 100%; height: .65rem; accent-color: var(--accent); }
      .job-numbers { display: flex; flex-wrap: wrap; gap: .75rem; color: var(--muted); font-size: .78rem; }
      .voice-segment-list { display: grid; gap: .55rem; }
      .voice-filter { display: flex; flex-wrap: wrap; gap: .45rem; }
      .voice-filter button { min-height: 2.2rem; padding: .45rem .7rem; font-size: .78rem; }
      .voice-filter button[aria-pressed="true"] { border-color: #9d7bff; background: #8062df30; color: white; }
      .voice-review { overflow: hidden; border: 1px solid var(--line); border-radius: .75rem; background: #08111b77; }
      .voice-review > summary { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: .7rem; align-items: center; padding: .8rem; cursor: pointer; }
      .voice-review > summary::marker { color: var(--accent); }
      .voice-review-title { min-width: 0; }
      .voice-review-title strong, .voice-review-title small { display: block; overflow-wrap: anywhere; }
      .voice-review-title small { margin-top: .2rem; color: var(--muted); }
      .voice-review-body { display: grid; gap: .75rem; padding: 0 .8rem .8rem; }
      .voice-review-body p { margin: 0; color: #d7e0eb; line-height: 1.7; white-space: pre-wrap; overflow-wrap: anywhere; }
      .voice-status { display: inline-flex; padding: .28rem .5rem; border-radius: 999px; background: #354052; color: #d8e1eb; font-size: .7rem; font-weight: 800; white-space: nowrap; }
      .voice-status.ready, .voice-status.completed { background: #174d3a; color: #91efc4; }
      .voice-status.needs_generation, .voice-status.queued, .voice-status.running, .voice-status.generating { background: #5a4618; color: #ffe29a; }
      .voice-status.failed, .voice-status.partially_failed { background: #622f33; color: #ffb6b6; }
      .voice-play[aria-pressed="true"] { border-color: #74e6b2; background: #164a38; }
      .voice-next { display: grid; gap: .7rem; position: sticky; top: 1rem; }
      .voice-next ol { margin: 0; padding-left: 1.3rem; color: #bdc9d8; font-size: .85rem; line-height: 1.7; }
      .voice-next li + li { margin-top: .35rem; }
      form { margin: 0; }
      @media (max-width: 72rem) { .slide-workspace { grid-template-columns: minmax(9rem, 13rem) minmax(0, 1fr); } .inspector { grid-column: 1 / -1; max-height: none; } }
      @media (max-width: 48rem) { .detail-grid, .editor-grid, .slide-workspace, .tuning-grid, .voice-flow, .voice-hero, .journey-next, .setup-steps { grid-template-columns: 1fr; } .editor label.wide { grid-column: auto; } .filmstrip { display: flex; max-height: none; overflow-x: auto; } .filmstrip-link { min-width: 12rem; } .inspector { grid-column: auto; } .voice-stats, .journey-steps { grid-template-columns: repeat(2, minmax(0, 1fr)); } .voice-next { position: static; } }
      @media (max-width: 38rem) { .site-header, .account { align-items: flex-start; } .site-header { flex-direction: column; } .section-head { align-items: flex-start; flex-direction: column; } }
      @media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; } }
    </style>
  </head>
  <body>${body}</body>
</html>`;
}

function formatDate(iso: string): string {
  const [date] = iso.split("T");
  return date?.replaceAll("-", "/") ?? iso;
}

function accountHeader(twitchLogin: string, csrfToken: string): string {
  return `<header class="site-header">
    <a class="brand" href="/dashboard">最自由研究</a>
    <div class="account"><span><strong>${escapeHtml(twitchLogin)}</strong> でログイン中</span>
      <form method="post" action="/logout"><input type="hidden" name="csrf_token" value="${escapeHtml(csrfToken)}"><button class="ghost" type="submit">ログアウト</button></form>
    </div>
  </header>`;
}

function slideCompositionLabel(
  slide: NonNullable<ProjectRecord["document"]["deck"]>["slides"][number]
): string {
  if (slide.composition?.mode === "canvas") {
    return `自由配置 ${slide.composition.blocks.length} block`;
  }
  if (slide.composition?.mode === "scene") {
    return `リッチ構成 ${slide.composition.nodes.length} component`;
  }
  return "定型flow";
}

function settingValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "未設定（継承）";
  if (typeof value === "boolean") return value ? "有効" : "無効";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function settingTable(entries: Array<[string, unknown]>): string {
  return `<dl class="setting-table">${entries
    .map(
      ([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(settingValue(value))}</dd>`
    )
    .join("")}</dl>`;
}

function componentSettings(node: SlideSceneNode): string {
  return settingTable(
    Object.entries(node).map(([key, value]) => [key, value])
  );
}

function sceneComponentOutline(nodes: SlideSceneNode[]): string {
  const children = new Map<string | null, SlideSceneNode[]>();
  for (const node of nodes) {
    const siblings = children.get(node.parent_id) ?? [];
    siblings.push(node);
    children.set(node.parent_id, siblings);
  }
  for (const siblings of children.values()) {
    siblings.sort(
      (left, right) => left.order - right.order || left.id.localeCompare(right.id)
    );
  }
  const renderChildren = (parentId: string | null): string => {
    const items = (children.get(parentId) ?? [])
      .map((node) => {
        const descendants = renderChildren(node.id);
        return `<li><div class="component-outline-row"><code>uf-${escapeHtml(node.kind.replaceAll("_", "-"))}</code><span>${escapeHtml(node.id)}<small>${node.frame === null || node.frame === undefined ? "自動配置" : "自由配置"}</small></span><span class="component-step">STEP ${node.at}</span></div><details class="component-detail"><summary>全設定を確認</summary>${componentSettings(node)}</details>${descendants}</li>`;
      })
      .join("");
    return items.length > 0 ? `<ul class="component-outline">${items}</ul>` : "";
  };
  return renderChildren(null);
}

export function landingPage(): Response {
  return new Response(
    shell(
      "最自由研究",
      `<header class="site-header"><a class="brand" href="/">最自由研究</a></header>
       <main><section class="hero">
         <p class="eyebrow">Ultimate freestyle research</p>
         <h1>気になったことを、研究にする。</h1>
         <p class="lead">AIとの対話で自由研究を育て、発表用のWebスライドまで一つの場所で管理します。Twitchで本人確認すると、自分の研究一覧を確認できます。</p>
         <a class="button primary" href="/login">Twitchでログイン</a>
       </section></main>`
    ),
    { headers: headers() }
  );
}

export function dashboardPage(options: {
  twitchLogin: string;
  csrfToken: string;
  projects: ProjectSummary[];
}): Response {
  const cards = options.projects
    .map(
      (project) => `<a class="card-link" data-project-card data-search-text="${escapeHtml(`${project.title} ${STAGE_LABELS[project.stage]}`.toLocaleLowerCase("ja"))}" href="/dashboard/projects/${escapeHtml(project.project_id)}"><article class="card" data-project-id="${escapeHtml(project.project_id)}">
        <div class="card-top"><span class="stage">${STAGE_LABELS[project.stage]}</span><span class="version">v${project.version}</span></div>
        <h2>${escapeHtml(project.title)}</h2>
        <p class="meta">最終更新 ${escapeHtml(formatDate(project.updated_at))}</p>
      </article></a>`
    )
    .join("");
  const content =
    cards.length > 0
      ? `<div class="dashboard-tools"><label class="dashboard-search">研究を絞り込む<input type="search" data-project-search placeholder="タイトル・制作段階" autocomplete="off"></label><span class="count" data-project-count>${options.projects.length}件を表示</span></div><div class="grid">${cards}</div><p class="search-empty" data-project-search-empty hidden>一致する研究がありません。別の言葉で試してください。</p>`
      : `<section class="empty"><h2>まだ研究がありません</h2><p>Codexなどの対応AIクライアントへ、下の文を貼り付けると最初の研究を始められます。</p><div class="copy-box"><code>最自由研究MCPを使って、新しい研究を対話しながら作りたいです。まず興味のあることを聞いてください。</code><div class="actions"><button type="button" data-copy-text="最自由研究MCPを使って、新しい研究を対話しながら作りたいです。まず興味のあることを聞いてください。">AIに頼む文をコピー</button><span class="feedback" data-copy-feedback aria-live="polite"></span></div></div></section>`;
  const connectionGuide = `<details class="connection-guide"${options.projects.length === 0 ? " open" : ""}><summary>AIクライアントとの接続方法</summary><div class="connection-body"><p>Remote MCPに対応したCodex、ChatGPT、Claudeなどから接続します。アプリによって設定画面の名前は「MCP」「コネクタ」「連携」など異なります。</p><ol class="setup-steps"><li>AIクライアントの連携設定で、下のMCP URLを追加します。</li><li>開いた画面でTwitchログインを完了します。</li><li>AIへ「最自由研究MCPを使いたい」と伝えます。</li></ol><div class="endpoint-box"><code>https://saijiyu-kenkyu.2764.moe/mcp</code><button type="button" data-copy-text="https://saijiyu-kenkyu.2764.moe/mcp">MCP URLをコピー</button><span class="feedback" data-copy-feedback aria-live="polite"></span></div><p class="inherit-note">TwitchのパスワードやtokenをAIへ貼る必要はありません。認証はTwitchの画面で行います。</p></div></details>`;

  return new Response(
    shell(
      "自分の研究 — 最自由研究",
      `${accountHeader(options.twitchLogin, options.csrfToken)}
       <main>
         <div class="section-head"><div><p class="eyebrow">My research</p><h1>自分の研究</h1></div><span class="count">${options.projects.length} / 20 件</span></div>
         ${content}
         ${connectionGuide}
         <p class="hint">研究を開くと、内容確認、文言の微調整、発表プレビュー、公開操作を行えます。大きな構成変更は接続したAIクライアントから進めます。</p>
       </main><script src="${DASHBOARD_SCRIPT_SRC}" defer></script>`
    ),
    { headers: headers() }
  );
}

export function projectDetailPage(options: {
  twitchLogin: string;
  csrfToken: string;
  project: ProjectRecord;
  assets: ProjectAsset[];
  publication: PublicationStatus;
}): Response {
  const document = options.project.document;
  const recentLogs = document.logs.slice(-20).reverse();
  const logs = recentLogs.length
    ? recentLogs
        .map(
          (entry) => `<article class="log"><small>${escapeHtml(formatDate(entry.occurred_at))} · ${escapeHtml(entry.kind)}</small><p class="prose">${escapeHtml(entry.text)}</p></article>`
        )
        .join("")
    : `<p class="prose">まだ研究ログがありません。</p>`;
  const slides = document.deck?.slides ?? [];
  const deck = document.deck;
  const loadingScreen = {
    enabled: true,
    style: "pulse",
    message: "発表の準備をしています",
    show_progress: true,
    minimum_duration_ms: 500,
    ...(deck?.loading_screen ?? {})
  };
  const slideRows = slides.length
    ? slides
        .map(
          (slide, index) => `<a class="slide-row" href="/dashboard/projects/${escapeHtml(options.project.project_id)}/slides/${escapeHtml(slide.id)}"><span>${index + 1}</span><strong>${escapeHtml(slide.title)}<small class="stage">${slide.role === "cover" ? "表紙 · " : ""}${escapeHtml(slideCompositionLabel(slide))}</small></strong><span>${slide.duration_seconds}秒 · ${slide.reveal_steps + 1}段階</span></a>`
        )
        .join("")
    : `<p class="prose">発表スライドはまだ構成されていません。</p>`;
  const assetCards = options.assets.length
    ? `<div class="asset-grid">${options.assets
        .map(
          (asset) => `<article class="asset" data-asset><img src="${escapeHtml(asset.content_url)}" alt="${escapeHtml(asset.alt_text)}" loading="lazy"><div class="asset-body"><p>${escapeHtml(asset.alt_text || "装飾画像")}</p><p class="meta">${asset.width}×${asset.height} · ${Math.ceil(asset.byte_size / 1024)} KiB</p><button class="ghost" type="button" data-image-delete="/api/images/${escapeHtml(asset.asset_id)}" data-csrf="${escapeHtml(options.csrfToken)}">削除</button><span class="feedback" data-delete-feedback aria-live="polite"></span></div></article>`
        )
        .join("")}</div>`
    : `<p class="prose">まだ画像がありません。</p>`;
  const narrationSegments = slides.flatMap(
    (slide) => slide.narration?.segments ?? []
  );
  const readyVoiceSegments = narrationSegments.filter(
    (segment) => segment.audio_src !== null
  ).length;
  const voiceConfigured = deck?.voicevox !== null && deck?.voicevox !== undefined;
  const voiceIncomplete =
    voiceConfigured && readyVoiceSegments !== narrationSegments.length;
  const preview = options.publication.latest_preview;
  const published = options.publication.published;
  const previewDraftCurrent = preview?.project_version === options.project.version;
  const previewRendererCurrent =
    preview?.renderer_version === options.publication.current_renderer_version;
  const previewCurrent = previewDraftCurrent && previewRendererCurrent;
  const publishedCurrent =
    published?.project_version === options.project.version &&
    published.renderer_version === options.publication.current_renderer_version;
  const researchReady =
    (document.question?.trim().length ?? 0) > 0 &&
    (document.method?.trim().length ?? 0) > 0;
  const slidesReady = slides.length > 0;
  const totalDurationSeconds = slides.reduce(
    (total, slide) => total + slide.duration_seconds,
    0
  );
  const coverSlideCount = slides.filter((slide) => slide.role === "cover").length;
  const narratedSlideCount = slides.filter(
    (slide) => (slide.narration?.segments.length ?? 0) > 0
  ).length;
  const slidesWithMissingAlt = slides.filter((slide) => {
    if (slide.composition?.mode === "canvas") {
      return slide.composition.blocks.some(
        (block) => block.kind === "image" && block.alt_text.trim() === ""
      );
    }
    if (slide.composition?.mode === "scene") {
      return slide.composition.nodes.some(
        (node) => node.kind === "image" && node.alt_text.trim() === ""
      );
    }
    return false;
  }).length;
  const assetsWithMissingAlt = options.assets.filter(
    (asset) => asset.alt_text.trim() === ""
  ).length;
  const journeySteps = [
    { label: "研究内容", detail: "問いと方法", complete: researchReady },
    { label: "発表構成", detail: `${slides.length}枚`, complete: slidesReady },
    { label: "プレビュー", detail: previewCurrent ? "確認可能" : "未確認", complete: previewCurrent },
    { label: "公開", detail: publishedCurrent ? "最新版" : "未反映", complete: publishedCurrent }
  ];
  const journeyCompleted = journeySteps.filter((step) => step.complete).length;
  const slidePrompt = `「${document.title}」の研究内容をもとに、発表スライドの構成を対話しながら作ってください。`;
  const nextJourneyAction = !researchReady
    ? {
        title: "研究の問いと方法を整理する",
        description: "まず基本情報を埋めると、AIが発表構成を作りやすくなります。",
        action: `<a class="button" href="#basic-information">基本情報を編集</a>`
      }
    : !slidesReady
      ? {
          title: "AIと発表スライドを作る",
          description: "接続中のAIクライアントへ依頼文を貼り付けて、構成づくりを始めます。",
          action: `<button type="button" data-copy-text="${escapeHtml(slidePrompt)}">AIに頼む文をコピー</button><span class="feedback" data-copy-feedback aria-live="polite"></span>`
        }
      : !previewCurrent
        ? {
            title: "現在の見た目をプレビューする",
            description: "固定された確認用URLを開き、文字・音声・ページ送りを通して確認します。",
            action: `<a class="button" href="#publication">プレビューへ進む</a>`
          }
        : !publishedCurrent
          ? {
              title: "確認したプレビューを公開する",
              description: "公開操作をしても、確認した固定版だけが公開されます。",
              action: `<a class="button" href="#publication">公開へ進む</a>`
            }
          : {
              title: "最新版が公開されています",
              description: "修正すると公開版はそのまま残り、次のプレビュー確認が必要になります。",
              action: options.publication.slug === null
                ? `<a class="button ghost" href="#publication">公開状態を確認</a>`
                : `<a class="button ghost" href="/p/${escapeHtml(options.publication.slug)}" target="_blank" rel="noopener">公開ページを開く</a>`
            };
  const workflowPanel = `<section class="journey" aria-labelledby="journey-title">
    <div class="journey-head"><div><p class="eyebrow">Next action</p><h2 id="journey-title">完成までの流れ</h2><p>研究内容から公開まで、現在地と次の操作をまとめています。</p></div><div class="journey-progress"><strong>${journeyCompleted} / ${journeySteps.length}</strong><progress max="${journeySteps.length}" value="${journeyCompleted}">${journeyCompleted} / ${journeySteps.length}</progress></div></div>
    <ol class="journey-steps">${journeySteps.map((step) => `<li class="journey-step" data-complete="${String(step.complete)}"><span>${step.label}<small>${step.detail}</small></span></li>`).join("")}</ol>
    <div class="journey-next"><div><h3>${nextJourneyAction.title}</h3><p>${nextJourneyAction.description}${voiceIncomplete ? ` VOICEVOXは${readyVoiceSegments}/${narrationSegments.length}区間まで生成済みですが、ブラウザ音声でプレビューできます。` : ""}</p></div><div class="actions">${nextJourneyAction.action}</div></div>
  </section>`;
  const previewStaleMessage = !previewDraftCurrent
    ? "下書きが変わったため、新しいプレビューの確認が必要です。"
    : !previewRendererCurrent
      ? "表示エンジンが更新されたため、新しいプレビューの確認が必要です。"
      : "公開中の版は、下書きを編集しても自動では変わりません。";
  const preflightItems = [
    {
      complete: researchReady,
      label: "研究の問いと方法",
      detail: researchReady ? "発表の前提を確認できます。" : "基本情報で問いと方法を入力してください。"
    },
    {
      complete: coverSlideCount > 0,
      label: "表紙スライド",
      detail: coverSlideCount > 0 ? `${coverSlideCount}枚を表紙として設定済みです。` : "任意ですが、発表の題名と作者を伝えやすくなります。"
    },
    {
      complete: slidesWithMissingAlt + assetsWithMissingAlt === 0,
      label: "画像の説明",
      detail: slidesWithMissingAlt + assetsWithMissingAlt === 0
        ? "説明が必要な画像に未入力はありません。"
        : `${slidesWithMissingAlt}枚のスライドと${assetsWithMissingAlt}件の素材に未入力があります。`
    },
    {
      complete: slides.length > 0 && narratedSlideCount === slides.length,
      label: "表示・読み上げ文",
      detail: slides.length === 0
        ? "スライドを作ると確認できます。"
        : narratedSlideCount === slides.length
          ? `全${slides.length}枚に読み上げ文があります。`
          : `${narratedSlideCount}/${slides.length}枚に設定済みです。音声を使わない構成なら省略できます。`
    },
    {
      complete: totalDurationSeconds > 0,
      label: "想定発表時間",
      detail: totalDurationSeconds > 0
        ? `${Math.floor(totalDurationSeconds / 60)}分${String(totalDurationSeconds % 60).padStart(2, "0")}秒です。`
        : "各スライドの想定秒数を確認してください。"
    },
    {
      complete: previewCurrent,
      label: "固定プレビュー",
      detail: previewCurrent ? "現在の下書きと表示エンジンで作成済みです。" : "現在の下書きから作り、最後まで操作して確認してください。"
    }
  ];
  const preflightChecklist = `<details${previewCurrent ? "" : " open"}><summary>公開前チェック · ${preflightItems.filter((item) => item.complete).length}/${preflightItems.length}</summary><ul class="preflight-list">${preflightItems.map((item) => `<li class="preflight-item" data-state="${item.complete ? "complete" : "attention"}"><span><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.detail)}</small></span></li>`).join("")}</ul></details>`;
  const publicationPanel = `<section class="panel publish-state" id="publication" data-publication>
    <h2>プレビューと公開</h2>
    ${preflightChecklist}
    <div class="status-row"><span>下書き</span><strong>v${options.project.version}</strong></div>
    <div class="status-row"><span>表示エンジン</span><strong>${escapeHtml(options.publication.current_renderer_version)}</strong></div>
    <div class="status-row"><span>最新プレビュー</span><strong data-preview-status>${preview === null ? "未作成" : `v${preview.project_version} · ${escapeHtml(preview.renderer_version)}${previewCurrent ? "" : " · 要再生成"}`}</strong></div>
    <div class="status-row"><span>公開中</span><strong data-published-status>${published === null ? "未公開" : `v${published.project_version} · ${escapeHtml(published.renderer_version)}`}</strong></div>
    <a class="button ghost" data-preview-link href="${preview === null ? "#" : `/preview/${escapeHtml(preview.revision_id)}`}" target="_blank" rel="noopener"${preview === null ? " hidden" : ""}>最新プレビューを開く</a>
    <a class="button ghost" data-public-link href="${published !== null && options.publication.slug !== null ? `/p/${escapeHtml(options.publication.slug)}` : "#"}" target="_blank" rel="noopener"${published === null || options.publication.slug === null ? " hidden" : ""}>公開ページを開く</a>
    <div class="actions">
      <button type="button" data-create-preview="/api/projects/${escapeHtml(options.project.project_id)}/previews" data-version="${options.project.version}" data-csrf="${escapeHtml(options.csrfToken)}"${slides.length === 0 ? " disabled" : ""}>現在の下書きをプレビュー</button>
      <button class="ghost" type="button" data-publish-preview="/api/projects/${escapeHtml(options.project.project_id)}/publish" data-revision="${escapeHtml(preview?.revision_id ?? "")}" data-csrf="${escapeHtml(options.csrfToken)}"${previewCurrent ? "" : " disabled"}>確認した版を公開</button>
    </div>
    <p class="feedback${voiceIncomplete || (preview !== null && !previewCurrent) ? " warning" : ""}" data-publish-feedback aria-live="polite">${slides.length === 0 ? "スライドを1枚以上作るとプレビューできます。" : voiceIncomplete ? `VOICEVOX音声は ${readyVoiceSegments} / ${narrationSegments.length} 区間まで生成済みです。未生成区間はブラウザ音声で代替してプレビューできます。` : preview !== null && !previewCurrent ? previewStaleMessage : "公開中の版は、下書きや表示エンジンを更新しても自動では変わりません。"}</p>
  </section>`;
  const voicePanel = `<section class="panel publish-state"><h2>読み上げ音声</h2>
    <div class="status-row"><span>読み上げ区間</span><strong>${narrationSegments.length}件</strong></div>
    <div class="status-row"><span>VOICEVOX生成済み</span><strong>${readyVoiceSegments} / ${narrationSegments.length}</strong></div>
    <a class="button" href="/dashboard/projects/${escapeHtml(options.project.project_id)}/voice">音声を仕上げる</a>
    <p class="feedback">VOICEVOXの話者・スタイル・調声、生成状況、区間ごとの試聴を一つの画面で確認できます。</p>
  </section>`;
  const presentationSettingsPanel = deck === null
    ? ""
    : `<details class="panel panel-disclosure"><summary>発表画面と0ページ目</summary><div class="disclosure-body">
       <form class="editor" data-deck-editor data-versioned-form action="/api/projects/${escapeHtml(options.project.project_id)}/presentation/settings" data-version="${options.project.version}" data-csrf="${escapeHtml(options.csrfToken)}">
         <fieldset><legend>スライド比率</legend><div class="ratio-options">
           <label class="ratio-option"><input type="radio" name="aspect_ratio" value="16:9"${(deck.aspect_ratio ?? "16:9") === "16:9" ? " checked" : ""}><span class="ratio-preview wide"></span><span><strong>ワイド 16:9</strong><small>PC・配信向け</small></span></label>
           <label class="ratio-option"><input type="radio" name="aspect_ratio" value="4:3"${deck.aspect_ratio === "4:3" ? " checked" : ""}><span class="ratio-preview standard"></span><span><strong>標準 4:3</strong><small>資料・旧型画面向け</small></span></label>
         </div></fieldset>
         <fieldset><legend>0ページ目</legend>
           <label class="check-label"><input type="checkbox" name="loading_enabled"${loadingScreen.enabled ? " checked" : ""}>表紙の前に準備画面を表示</label>
           <div class="editor-grid"><label>見た目<select name="loading_style">${[["minimal", "ミニマル"], ["pulse", "光のパルス"], ["orbit", "軌道"], ["research-log", "研究ノート"]].map(([value, label]) => `<option value="${value}"${loadingScreen.style === value ? " selected" : ""}>${label}</option>`).join("")}</select></label><label>最低表示時間（ms）<input name="loading_minimum_duration_ms" type="number" min="0" max="5000" step="100" value="${loadingScreen.minimum_duration_ms}"></label></div>
           <label>案内文<input name="loading_message" maxlength="160" value="${escapeHtml(loadingScreen.message)}"></label>
           <label class="check-label"><input type="checkbox" name="loading_show_progress"${loadingScreen.show_progress ? " checked" : ""}>プリロード件数を表示</label>
           <p class="inherit-note">画像・生成音声・利用可能なフォントを準備し、失敗やタイムアウトがあっても発表は開始できます。</p>
         </fieldset>
         <div class="actions"><button type="submit">発表画面を保存</button><span class="version" data-version-label>v${options.project.version}</span></div><p class="feedback" data-form-feedback aria-live="polite"></p>
       </form>
     </div></details>`;

  return new Response(
    shell(
      `${document.title} — 最自由研究`,
      `${accountHeader(options.twitchLogin, options.csrfToken)}
       <main>
         <a class="back" href="/dashboard">← 自分の研究へ戻る</a>
         <div class="card-top"><span class="stage">${STAGE_LABELS[document.stage]}</span><span class="version">v${options.project.version}</span></div>
         <h1 class="detail-title">${escapeHtml(document.title)}</h1>
         <p class="lead">${escapeHtml(document.summary || "概要はまだ記入されていません。")}</p>
         ${workflowPanel}
         <div class="detail-grid">
           <div class="detail-column">
             <details class="panel panel-disclosure" id="basic-information"${researchReady ? "" : " open"}><summary>研究内容を編集</summary><div class="disclosure-body">
               <form class="editor" data-project-editor action="/api/projects/${escapeHtml(options.project.project_id)}/fields" data-version="${options.project.version}" data-csrf="${escapeHtml(options.csrfToken)}">
                 <div class="editor-grid">
                   <label>タイトル<input name="title" maxlength="120" required value="${escapeHtml(document.title)}"></label>
                   <label>段階<select name="stage">${Object.entries(STAGE_LABELS).map(([value, label]) => `<option value="${value}"${document.stage === value ? " selected" : ""}>${label}</option>`).join("")}</select></label>
                   <label class="wide">概要<textarea name="summary" maxlength="2000">${escapeHtml(document.summary)}</textarea></label>
                   <label class="wide">研究の問い<textarea name="question" maxlength="2000">${escapeHtml(document.question ?? "")}</textarea></label>
                   <label class="wide">仮説<textarea name="hypothesis" maxlength="4000">${escapeHtml(document.hypothesis ?? "")}</textarea></label>
                   <label class="wide">方法<textarea name="method" maxlength="20000">${escapeHtml(document.method ?? "")}</textarea></label>
                   <label class="wide">わかったこと<textarea name="findings" maxlength="20000" placeholder="1行に1件">${escapeHtml(document.findings.join("\n"))}</textarea><small class="inherit-note">1行を1件として保存します。</small></label>
                   <label class="wide">限界・今後の課題<textarea name="limitations" maxlength="20000" placeholder="1行に1件">${escapeHtml(document.limitations.join("\n"))}</textarea><small class="inherit-note">1行を1件として保存します。</small></label>
                 </div>
                 <div class="actions"><button type="submit">変更を保存</button><span class="version" data-editor-version>v${options.project.version}</span></div>
                 <p class="feedback" data-editor-feedback aria-live="polite"></p>
               </form>
             </div></details>
             ${presentationSettingsPanel}
             <section class="panel"><h2>研究画像</h2>
               <form class="upload" action="/api/projects/${escapeHtml(options.project.project_id)}/images" data-image-upload data-csrf="${escapeHtml(options.csrfToken)}">
                 <label>画像ファイル<input type="file" accept="image/jpeg,image/png,image/webp" required></label>
                 <div class="upload-preview" data-upload-preview hidden><img data-upload-preview-image alt="選択した画像の確認"><p><strong data-upload-preview-name></strong><small data-upload-preview-meta></small></p></div>
                 <label>画像の説明<input name="alt_text" maxlength="500" placeholder="写真や図が何を示しているか"><small class="inherit-note">発表内容を伝える画像には説明を付けます。純粋な装飾なら空欄にできます。</small></label>
                 <div class="upload-actions"><button type="submit">画像を追加</button><span class="meta">JPEG / PNG / 静止WebP、10MiBまで · 保存時にWeb向けへ圧縮</span></div>
                 <p class="feedback" data-feedback aria-live="polite"></p>
               </form>
               ${assetCards}
             </section>
             <section class="panel"><h2>研究ログ</h2>${logs}${document.logs.length > recentLogs.length ? `<p class="meta">最新20件を表示 · 全${document.logs.length}件</p>` : ""}</section>
           </div>
           <aside class="detail-column">
             <section class="panel"><h2>研究情報</h2><dl class="stat-list">
               <dt>段階</dt><dd>${STAGE_LABELS[document.stage]}</dd>
               <dt>version</dt><dd>${options.project.version}</dd>
               <dt>更新日</dt><dd>${escapeHtml(formatDate(options.project.updated_at))}</dd>
               <dt>ログ</dt><dd>${document.logs.length}件</dd>
               <dt>スライド</dt><dd>${slides.length}枚</dd>
             </dl></section>
             <section class="panel"><h2>発表構成</h2><div class="slide-list">${slideRows}</div></section>
             ${voicePanel}
             ${publicationPanel}
             <p class="hint">大きな構成変更はAIクライアント、文言の微調整と確認・公開はこの画面から行えます。</p>
           </aside>
         </div>
       </main><script src="${DASHBOARD_SCRIPT_SRC}" defer></script>`
    ),
    { headers: headers() }
  );
}

export type VoiceFinishJob = {
  job_id: string;
  status: string;
  total_segments: number;
  completed_segments: number;
  failed_segments: number;
  cached_segments: number;
  status_url: string;
};

export type VoiceFinishState = {
  ok: boolean;
  project_id: string;
  version: number;
  configured: boolean;
  default_profile: {
    id?: string;
    label: string;
    speaker_name?: string;
    style_name?: string;
  } | null;
  summary: {
    total: number;
    ready: number;
    needs_generation: number;
    failed: number;
    queued: number;
  };
  segments: Array<{
    slide_id: string;
    slide_title: string;
    at: number;
    text: string;
    speaker: string | null;
    profile_label: string | null;
    status: string;
    audio_url: string | null;
  }>;
  active_job: VoiceFinishJob | null;
  latest_job: VoiceFinishJob | null;
};

function voiceJobCard(job: VoiceFinishJob | null): string {
  if (job === null) {
    return `<div class="job-card" data-voice-job data-state="idle">
      <div class="job-head"><strong data-job-label>まだ生成していません</strong><span class="voice-status" data-job-status>準備中</span></div>
      <progress class="job-progress" data-job-progress max="1" value="0">0 / 0</progress>
      <div class="job-numbers"><span>完了 <strong data-job-completed>0</strong> / <span data-job-total>0</span></span><span>cache <strong data-job-cached>0</strong></span><span>失敗 <strong data-job-failed>0</strong></span></div>
      <p class="feedback" data-job-feedback aria-live="polite">声と原稿を確認したら、不足している区間だけをまとめて生成できます。</p>
    </div>`;
  }
  const completed = Math.min(
    job.total_segments,
    job.completed_segments + job.failed_segments
  );
  const statusLabel = VOICE_JOB_STATUS_LABELS[job.status] ?? job.status;
  return `<div class="job-card" data-voice-job data-state="${escapeHtml(job.status)}" data-status-url="${escapeHtml(job.status_url)}">
    <div class="job-head"><strong data-job-label>${escapeHtml(statusLabel)}</strong><span class="voice-status ${escapeHtml(job.status)}" data-job-status>${escapeHtml(statusLabel)}</span></div>
    <progress class="job-progress" data-job-progress max="${Math.max(1, job.total_segments)}" value="${completed}">${completed} / ${job.total_segments}</progress>
    <div class="job-numbers"><span>完了 <strong data-job-completed>${job.completed_segments}</strong> / <span data-job-total>${job.total_segments}</span></span><span>cache <strong data-job-cached>${job.cached_segments}</strong></span><span>失敗 <strong data-job-failed>${job.failed_segments}</strong></span></div>
    <p class="feedback" data-job-feedback aria-live="polite">${job.status === "completed" ? "生成した音声を区間一覧から試聴できます。" : job.status === "failed" || job.status === "partially_failed" ? "失敗した区間を確認し、もう一度生成できます。" : "画面を閉じても生成は続きます。"}</p>
  </div>`;
}

export function voiceFinishPage(options: {
  twitchLogin: string;
  csrfToken: string;
  project: ProjectRecord;
  voice: VoiceFinishState;
}): Response {
  const projectId = escapeHtml(options.project.project_id);
  const summary = options.voice.summary;
  const currentJob = options.voice.active_job ?? options.voice.latest_job;
  const jobActive =
    options.voice.active_job !== null &&
    !["completed", "partially_failed", "failed", "cancelled"].includes(
      options.voice.active_job.status
    );
  const defaultProfileLabel =
    options.voice.default_profile?.label ?? "ずんだもん・ノーマル";
  const profileGroups = new Map<string, typeof VOICEVOX_CATALOG[number][]>();
  for (const profile of VOICEVOX_CATALOG) {
    const entries = profileGroups.get(profile.speakerName) ?? [];
    entries.push(profile);
    profileGroups.set(profile.speakerName, entries);
  }
  const profileOptions = [...profileGroups.entries()]
    .map(
      ([speakerName, profiles]) =>
        `<optgroup label="${escapeHtml(speakerName)}">${profiles
          .map(
            (profile) =>
              `<option value="${escapeHtml(profile.id)}"${options.voice.default_profile?.id === profile.id || options.voice.default_profile?.label === profile.label || (!options.voice.configured && profile.styleId === 3) ? " selected" : ""}>${escapeHtml(profile.styleName)}</option>`
          )
          .join("")}</optgroup>`
    )
    .join("");
  const quickProfiles = [3, 2, 8]
    .map((styleId) => VOICEVOX_CATALOG.find((profile) => profile.styleId === styleId))
    .filter((profile): profile is typeof VOICEVOX_CATALOG[number] => profile !== undefined);
  const attentionSegmentIndex = options.voice.segments.findIndex(
    (segment) => segment.status !== "ready"
  );
  const segmentList = options.voice.segments.length
    ? options.voice.segments
        .map((segment, index) => {
          const statusLabel =
            VOICE_SEGMENT_STATUS_LABELS[segment.status] ?? segment.status;
          const generated = segment.audio_url !== null;
          return `<details class="voice-review"${index === (attentionSegmentIndex === -1 ? 0 : attentionSegmentIndex) ? " open" : ""} data-voice-segment data-state="${escapeHtml(segment.status)}">
            <summary><span class="component-step">${String(index + 1).padStart(2, "0")}</span><span class="voice-review-title"><strong>${escapeHtml(segment.slide_title)} · STEP ${segment.at}</strong><small>${escapeHtml(segment.profile_label ?? defaultProfileLabel)}${segment.speaker ? ` · ${escapeHtml(segment.speaker)}` : ""}</small></span><span class="voice-status ${escapeHtml(segment.status)}">${escapeHtml(statusLabel)}</span></summary>
            <div class="voice-review-body"><p>${escapeHtml(segment.text)}</p><div class="actions"><button class="ghost voice-play" type="button" data-voice-preview data-audio-url="${escapeHtml(segment.audio_url ?? "")}" data-voice-text="${escapeHtml(segment.text)}" aria-pressed="false">${generated ? "生成音声を試聴" : "ブラウザ音声で仮試聴"}</button><a class="button ghost" href="/dashboard/projects/${projectId}/slides/${escapeHtml(segment.slide_id)}">この区間を編集</a></div></div>
          </details>`;
        })
        .join("")
    : `<section class="empty"><h2>読み上げ原稿がありません</h2><p>先にAIクライアントまたはスライド編集画面から、読み上げ区間を追加してください。</p></section>`;
  const generateDisabled =
    !options.voice.configured || summary.needs_generation === 0 || jobActive;
  return new Response(
    shell(
      `音声を仕上げる — ${options.project.document.title}`,
      `${accountHeader(options.twitchLogin, options.csrfToken)}
       <main class="voice-main" data-voice-page data-project-id="${projectId}" data-version="${options.voice.version}" data-csrf="${escapeHtml(options.csrfToken)}" data-summary-url="/api/projects/${projectId}/voice">
         <a class="back" href="/dashboard/projects/${projectId}">← 研究詳細へ戻る</a>
         <section class="voice-hero"><div><p class="eyebrow">Voice finishing</p><h1>音声を仕上げる</h1><p class="lead">VOICEVOXの話者とスタイルを選び、不足している読み上げ音声を生成して、区間ごとに確認できます。</p></div><a class="button ghost" href="/dashboard/projects/${projectId}#publication">プレビューと公開へ</a></section>
         <div class="voice-flow">
           <div class="voice-column">
             <section class="panel voice-step"><div class="voice-step-head"><span class="voice-step-number">1</span><div><h2>声を決める</h2><p>40話者・118種類のトークスタイルから発表全体の既定音声を選べます。最初は「ずんだもん・ノーマル」がおすすめです。</p></div></div>
               <div class="voice-quick" aria-label="おすすめの声">${quickProfiles.map((profile) => `<button class="ghost" type="button" data-voice-pick="${escapeHtml(profile.id)}">${escapeHtml(profile.label)}</button>`).join("")}</div>
               <div class="voice-preset"><span class="voice-character" aria-hidden="true">声</span><label><strong>既定の話者・スタイル</strong><select data-voice-profile>${profileOptions}</select><small>区間ごとのprofileと7種の調声値は、各スライドの読み上げ設定で変更できます。</small></label><span class="stage">${options.voice.configured ? "設定済み" : "おすすめ"}</span></div>
               <div class="actions"><button type="button" data-voice-setup="/api/projects/${projectId}/voice/profile"${jobActive ? " disabled" : ""}>${options.voice.configured ? "選択した声へ変更" : "この声を使う"}</button></div><p class="feedback${options.voice.configured ? " success" : ""}" data-voice-setup-feedback aria-live="polite">${options.voice.configured ? `現在の既定音声は「${escapeHtml(defaultProfileLabel)}」です。` : "設定するとprofile未指定の読み上げ区間へ自動的に適用されます。"}</p>
             </section>
             <section class="panel voice-step"><div class="voice-step-head"><span class="voice-step-number">2</span><div><h2>不足分を生成する</h2><p>設定や原稿が変わった区間だけを生成します。生成済みの音声は再利用します。</p></div></div>
               <div class="voice-stats"><div class="voice-stat"><span>原稿</span><strong data-voice-total>${summary.total}</strong></div><div class="voice-stat ready"><span>生成済み</span><strong data-voice-ready>${summary.ready}</strong></div><div class="voice-stat pending"><span>要生成</span><strong data-voice-needed>${summary.needs_generation}</strong></div><div class="voice-stat"><span>失敗</span><strong data-voice-failed>${summary.failed}</strong></div></div>
               <div class="actions"><button type="button" data-voice-generate="/api/projects/${projectId}/voice/jobs"${generateDisabled ? " disabled" : ""}>${jobActive ? "生成中です" : summary.total === 0 ? "読み上げ原稿がありません" : summary.needs_generation > 0 ? `不足している${summary.needs_generation}区間を生成` : "すべて生成済み"}</button></div><p class="feedback" data-voice-generate-feedback aria-live="polite">${!options.voice.configured ? "先に声を設定してください。" : summary.total === 0 ? "各スライドへ読み上げ原稿を追加すると生成できます。" : summary.needs_generation === 0 ? "生成が必要な区間はありません。" : "生成中もこの画面を閉じて構いません。"}</p>
               ${voiceJobCard(currentJob)}
             </section>
             <section class="panel voice-step"><div class="voice-step-head"><span class="voice-step-number">3</span><div><h2>区間ごとに試聴する</h2><p>生成済み音声を確認できます。未生成の区間はブラウザ音声で仮試聴します。</p></div></div><div class="voice-filter" aria-label="区間の絞り込み"><button class="ghost" type="button" data-voice-filter="all" aria-pressed="true">すべて ${summary.total}</button><button class="ghost" type="button" data-voice-filter="needs_generation" aria-pressed="false">要生成 ${summary.needs_generation}</button><button class="ghost" type="button" data-voice-filter="ready" aria-pressed="false">生成済み ${summary.ready}</button><button class="ghost" type="button" data-voice-filter="failed" aria-pressed="false">失敗 ${summary.failed}</button></div><div class="voice-segment-list" data-voice-segments>${segmentList}</div></section>
           </div>
           <aside class="panel voice-next"><p class="eyebrow">Next step</p><h2>確認できたら</h2><ol><li>必要な区間だけVOICEVOXを生成</li><li>気になる区間を試聴</li><li>固定プレビューを作成</li><li>プレビューを確認して公開</li></ol><a class="button" href="/dashboard/projects/${projectId}#publication">プレビューと公開へ進む</a><p class="inherit-note">音声生成は任意です。未生成区間はブラウザ音声で代替してプレビューできます。</p></aside>
         </div>
       </main><script src="${DASHBOARD_SCRIPT_SRC}" defer></script>`
    ),
    { headers: headers() }
  );
}

export function slideWorkspacePage(options: {
  twitchLogin: string;
  csrfToken: string;
  project: ProjectRecord;
  slideId: string;
}): Response {
  const deck = options.project.document.deck;
  const slideIndex = deck?.slides.findIndex((slide) => slide.id === options.slideId) ?? -1;
  if (deck === null || slideIndex === -1) return projectNotFoundPage();
  const slide = deck.slides[slideIndex];
  if (slide === undefined) return projectNotFoundPage();
  const previousSlide = deck.slides[slideIndex - 1];
  const nextSlide = deck.slides[slideIndex + 1];
  const slideDashboardPath = `/dashboard/projects/${escapeHtml(options.project.project_id)}/slides/`;
  const previousSlideLink = previousSlide === undefined
    ? ""
    : `<a class="button ghost" href="${slideDashboardPath}${escapeHtml(previousSlide.id)}" aria-label="前のスライド: ${escapeHtml(previousSlide.title)}">← 前のスライド</a>`;
  const nextSlideLink = nextSlide === undefined
    ? ""
    : `<a class="button ghost" href="${slideDashboardPath}${escapeHtml(nextSlide.id)}" aria-label="次のスライド: ${escapeHtml(nextSlide.title)}">次のスライド →</a>`;
  const nextSlidePath = nextSlide === undefined
    ? null
    : `${slideDashboardPath}${escapeHtml(nextSlide.id)}`;
  const projectPath = `/api/projects/${escapeHtml(options.project.project_id)}`;
  const slidePath = `${projectPath}/slides/${escapeHtml(slide.id)}`;
  const filmstrip = deck.slides
    .map(
      (item, index) => `<a class="filmstrip-link" data-active="${String(index === slideIndex)}"${index === slideIndex ? ' aria-current="page"' : ""} href="/dashboard/projects/${escapeHtml(options.project.project_id)}/slides/${escapeHtml(item.id)}"><span>${String(index + 1).padStart(2, "0")}</span><strong>${escapeHtml(item.title)}${item.role === "cover" ? '<small class="stage">表紙</small>' : ""}</strong></a>`
    )
    .join("");
  const componentOutline =
    slide.composition?.mode === "scene"
      ? sceneComponentOutline(slide.composition.nodes)
      : slide.composition?.mode === "canvas"
        ? `<ul class="component-outline">${slide.composition.blocks
            .map(
              (block) => `<li><div class="component-outline-row"><code>${escapeHtml(block.kind)}</code><span>${escapeHtml(block.id)}<small>x ${block.frame.x}% · y ${block.frame.y}%</small></span><span class="component-step">STEP ${block.at}</span></div><details class="component-detail"><summary>全設定を確認</summary>${settingTable(Object.entries(block))}</details></li>`
            )
            .join("")}</ul>`
        : `<p class="mode-note">定型flowです。本文、段階表示、補足欄から構成されます。AIからsceneへ切り替えると、入れ子のリッチcomponentを利用できます。</p>`;
  const modeNote =
    slide.composition?.mode === "scene"
      ? "登録済みWeb Componentsで構成されています。現在はAIからcomponentを一件ずつ編集でき、この画面では実表示と基本文言を確認できます。"
      : slide.composition?.mode === "canvas"
        ? "従来のflat canvasです。既存表示は維持されます。より複雑な構成はcomponent sceneへ移行できます。"
        : "本文と補足欄を使う定型flowです。";
  const effectiveTemplateId = slide.template_id ?? deck.default_template_id ?? null;
  const activeTemplate = (deck.templates ?? []).find(
    (template) => template.id === effectiveTemplateId
  );
  const visualPreset = activeTemplate?.visual_preset ?? "studio";
  const bodyFont = activeTemplate?.body_font ?? "system-sans";
  const headingFont = activeTemplate?.heading_font ?? "system-sans";
  const density = activeTemplate?.density ?? "comfortable";
  const motion = activeTemplate?.motion_style ?? "calm";
  const typography = resolveSlideTypography(
    slide.typography,
    activeTemplate?.line_height ?? 1.5
  );
  const effectiveEnter = slide.enter_animation ?? activeTemplate?.enter_animation ?? "fade";
  const narrationDisplay =
    slide.narration?.display ?? deck.narration_defaults?.display ?? "commentary";
  const narrationAppearance = {
    placement: "bottom",
    size: "normal",
    text_align: (["commentary", "subtitle", "minimal"] as string[]).includes(
      narrationDisplay
    )
      ? "center"
      : "start",
    speaker_visible: true,
    progress_visible: true,
    text_scale: 1,
    max_lines:
      narrationDisplay === "dialogue"
        ? 4
        : narrationDisplay === "commentary"
          ? 3
          : narrationDisplay === "inline"
            ? 8
            : 2,
    ...(deck.narration_defaults?.appearance ?? {}),
    ...(slide.narration?.appearance ?? {})
  };
  const effectiveSpeaker =
    slide.narration?.speaker ?? deck.narration_defaults?.speaker ?? null;
  const profiles = deck.voicevox?.profiles ?? [];
  const defaultProfile = profiles.find(
    (profile) => profile.id === deck.voicevox?.default_profile_id
  );
  const templateOptions = [
    `<option value=""${slide.template_id === null || slide.template_id === undefined ? " selected" : ""}>deck既定を使う</option>`,
    ...(deck.templates ?? []).map(
      (template) => `<option value="${escapeHtml(template.id)}"${slide.template_id === template.id ? " selected" : ""}>${escapeHtml(template.name)}</option>`
    )
  ].join("");
  const animationOptions = Object.entries(ANIMATION_LABELS)
    .map(
      ([value, label]) => `<option value="${value}"${slide.enter_animation === value ? " selected" : ""}>${escapeHtml(label)}</option>`
    )
    .join("");
  const templateCreator = `<details class="component-detail"${activeTemplate === undefined ? " open" : ""}><summary>編集できるtemplateを追加</summary><form class="editor" data-template-create data-versioned-form data-method="POST" action="${projectPath}/templates" data-version="${options.project.version}" data-csrf="${escapeHtml(options.csrfToken)}"><div class="editor-grid"><label>template名<input name="name" maxlength="80" required value="自分のスタイル"></label><label>ID<input name="template_id" pattern="[a-z0-9][a-z0-9-]{0,63}" required value="style-${options.project.version}"></label><label>元にする見た目<select name="visual_preset">${Object.entries(VISUAL_LABELS).map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select></label></div><label class="check-label"><input type="checkbox" name="make_default" checked>発表全体の既定templateにする</label><div class="actions"><button type="submit">templateを追加</button><span class="version" data-version-label>v${options.project.version}</span></div><p class="feedback" data-form-feedback aria-live="polite"></p></form></details>`;
  const templateEditor = activeTemplate
    ? `<form class="editor" data-template-editor data-versioned-form action="${projectPath}/templates/${escapeHtml(activeTemplate.id)}" data-version="${options.project.version}" data-csrf="${escapeHtml(options.csrfToken)}">
        <p class="inherit-note">このtemplateを使う全スライドへ反映されます。</p>
        <label>template名<input name="name" maxlength="80" required value="${escapeHtml(activeTemplate.name)}"></label>
        <div class="editor-grid"><label>visual<select name="visual_preset">${Object.entries(VISUAL_LABELS).map(([value, label]) => `<option value="${value}"${visualPreset === value ? " selected" : ""}>${label}</option>`).join("")}</select></label><label>情報密度<select name="density">${Object.entries(DENSITY_LABELS).map(([value, label]) => `<option value="${value}"${density === value ? " selected" : ""}>${label}</option>`).join("")}</select></label></div>
        <fieldset><legend>領域</legend><div class="editor-grid"><label>配置<select name="region_layout">${[["single", "単一"], ["sidebar-right", "右補足"], ["sidebar-left", "左補足"], ["lower-third", "下段補足"], ["split", "左右均等"], ["top-band", "上段補足"], ["focus", "中央集中"]].map(([value, label]) => `<option value="${value}"${activeTemplate.region_layout === value ? " selected" : ""}>${label}</option>`).join("")}</select></label><label>補足幅（%）<input name="sidebar_width_percent" type="number" min="20" max="45" value="${activeTemplate.sidebar_width_percent}" required></label></div><div class="editor-grid"><label>角の丸み<input name="corner_radius_px" type="number" min="0" max="48" value="${activeTemplate.corner_radius_px}" required></label><label>余白倍率<input name="spacing_scale" type="number" min="0.75" max="1.5" step="0.05" value="${activeTemplate.spacing_scale}" required></label></div></fieldset>
        <fieldset><legend>色</legend><div class="editor-grid">${[["background", "背景", activeTemplate.background], ["surface", "補足面", activeTemplate.surface], ["foreground", "本文", activeTemplate.foreground], ["muted", "補助文字", activeTemplate.muted], ["accent", "アクセント", activeTemplate.accent], ["accent_secondary", "第2アクセント", activeTemplate.accent_secondary ?? activeTemplate.accent], ["border", "境界線", activeTemplate.border ?? activeTemplate.muted]].map(([name, label, value]) => `<label>${label}<input name="${name}" type="color" value="${escapeHtml(String(value))}"></label>`).join("")}</div></fieldset>
        <fieldset><legend>文字</legend><div class="editor-grid"><label>本文font<select name="body_font">${Object.entries(FONT_LABELS).map(([value, label]) => `<option value="${value}"${bodyFont === value ? " selected" : ""}>${label}</option>`).join("")}</select></label><label>見出しfont<select name="heading_font">${Object.entries(FONT_LABELS).map(([value, label]) => `<option value="${value}"${headingFont === value ? " selected" : ""}>${label}</option>`).join("")}</select></label><label>本文weight<input name="body_weight" type="number" min="300" max="900" step="100" value="${activeTemplate.body_weight ?? 400}"></label><label>見出しweight<input name="heading_weight" type="number" min="300" max="900" step="100" value="${activeTemplate.heading_weight ?? 800}"></label><label>文字倍率<input name="font_scale" type="number" min="0.75" max="1.3" step="0.05" value="${activeTemplate.font_scale}"></label><label>行間<input name="line_height" type="number" min="1" max="2" step="0.05" value="${activeTemplate.line_height ?? 1.5}"></label><label>字間（em）<input name="letter_spacing_em" type="number" min="-0.08" max="0.2" step="0.01" value="${activeTemplate.letter_spacing_em ?? 0}"></label></div></fieldset>
        <fieldset><legend>動き</legend><div class="editor-grid"><label>motion<select name="motion_style">${Object.entries(MOTION_LABELS).map(([value, label]) => `<option value="${value}"${motion === value ? " selected" : ""}>${label}</option>`).join("")}</select></label><label>表示animation<select name="enter_animation">${Object.entries(ANIMATION_LABELS).map(([value, label]) => `<option value="${value}"${activeTemplate.enter_animation === value ? " selected" : ""}>${label}</option>`).join("")}</select></label><label>段階animation<select name="reveal_animation">${Object.entries(ANIMATION_LABELS).map(([value, label]) => `<option value="${value}"${activeTemplate.reveal_animation === value ? " selected" : ""}>${label}</option>`).join("")}</select></label></div></fieldset>
        <div class="actions"><button type="submit">templateを保存</button><span class="version" data-version-label>v${options.project.version}</span></div><p class="feedback" data-form-feedback aria-live="polite"></p>
      </form>`
    : `<p class="mode-note">組み込みstyleを使用中です。templateを選ぶと色、font、密度、余白、動きを編集できます。</p>`;
  const typographyEditor = `<form class="editor" data-typography-editor data-versioned-form action="${slidePath}/typography" data-version="${options.project.version}" data-csrf="${escapeHtml(options.csrfToken)}">
    <p class="inherit-note">定型flowの文章配分を一枚単位で調整します。未入力の項目は選択した組版presetを使います。</p>
    <div class="editor-grid"><label>組版preset<select name="preset">${Object.entries(SLIDE_TYPOGRAPHY_LABELS).map(([value, label]) => `<option value="${value}"${typography.preset === value ? " selected" : ""}>${label}</option>`).join("")}</select></label><label>段数<input name="columns" type="number" min="1" max="3" value="${slide.typography?.columns ?? ""}" placeholder="実効 ${typography.columns}"></label></div>
    <fieldset><legend>文字サイズと行送り</legend><div class="editor-grid"><label>本文倍率<input name="body_scale" type="number" min="0.5" max="1.4" step="0.05" value="${slide.typography?.body_scale ?? ""}" placeholder="実効 ${typography.body_scale}"></label><label>見出し倍率<input name="heading_scale" type="number" min="0.5" max="1.5" step="0.05" value="${slide.typography?.heading_scale ?? ""}" placeholder="実効 ${typography.heading_scale}"></label><label>行間<input name="typography_line_height" type="number" min="1" max="2" step="0.05" value="${slide.typography?.line_height ?? ""}" placeholder="実効 ${typography.line_height}"></label><label>段落間隔（em）<input name="paragraph_spacing_em" type="number" min="0" max="2" step="0.05" value="${slide.typography?.paragraph_spacing_em ?? ""}" placeholder="実効 ${typography.paragraph_spacing_em}"></label><label>段間隔（em）<input name="column_gap_em" type="number" min="0.5" max="5" step="0.1" value="${slide.typography?.column_gap_em ?? ""}" placeholder="実効 ${typography.column_gap_em}"></label></div></fieldset>
    <fieldset><legend>配置</legend><div class="editor-grid"><label>文字揃え<select name="text_align"><option value=""${slide.typography?.text_align === undefined ? " selected" : ""}>presetを使用（${typography.text_align === "center" ? "中央" : "左"}）</option><option value="start"${slide.typography?.text_align === "start" ? " selected" : ""}>左</option><option value="center"${slide.typography?.text_align === "center" ? " selected" : ""}>中央</option></select></label><label>縦位置<select name="vertical_align"><option value=""${slide.typography?.vertical_align === undefined ? " selected" : ""}>presetを使用（${typography.vertical_align === "center" ? "中央" : "上"}）</option><option value="start"${slide.typography?.vertical_align === "start" ? " selected" : ""}>上</option><option value="center"${slide.typography?.vertical_align === "center" ? " selected" : ""}>中央</option></select></label></div></fieldset>
    <div class="actions"><button type="submit">文章レイアウトを保存</button><span class="version" data-version-label>v${options.project.version}</span></div><p class="feedback" data-form-feedback aria-live="polite"></p>
  </form>`;
  const voiceSegments = slide.narration?.segments.length
    ? slide.narration.segments
        .map((segment) => {
          const profile =
            (segment.voice_profile_id
              ? profiles.find((item) => item.id === segment.voice_profile_id)
              : undefined) ?? defaultProfile;
          const effectiveTuning = mergeVoicevoxTuning(
            profile?.tuning ?? undefined,
            segment.voice_tuning ?? undefined
          );
          const profileOptions = [
            `<option value=""${segment.voice_profile_id === null || segment.voice_profile_id === undefined ? " selected" : ""}>deck既定${defaultProfile ? `（${escapeHtml(defaultProfile.label)}）` : ""}</option>`,
            ...profiles.map(
              (item) => `<option value="${escapeHtml(item.id)}"${segment.voice_profile_id === item.id ? " selected" : ""}>${escapeHtml(item.label)} · ${escapeHtml(item.speaker_name)} ${escapeHtml(item.style_name)}</option>`
            )
          ].join("");
          return `<form class="voice-segment editor" data-segment-editor data-versioned-form action="${slidePath}/narration/segments/${segment.at}" data-version="${options.project.version}" data-csrf="${escapeHtml(options.csrfToken)}">
            <div class="voice-segment-head"><span class="component-step">STEP ${segment.at}</span><span class="audio-state${segment.audio_src ? " ready" : ""}">${segment.audio_src ? "VOICEVOX音声あり" : "ブラウザ音声で代替"}</span></div>
            <label>表示・読み上げ文<textarea name="text" maxlength="2000" required>${escapeHtml(segment.text)}</textarea></label>
            <div class="editor-grid"><label>この区間の話者名<input name="speaker" maxlength="80" value="${escapeHtml(segment.speaker ?? "")}" placeholder="スライド設定を継承"></label><label>VOICEVOX profile<select name="voice_profile_id">${profileOptions}</select></label></div>
            <p class="inherit-note">実効profile: ${escapeHtml(profile ? `${profile.label} / ${profile.speaker_name} ${profile.style_name}` : "未設定（Web Speech）")}。空欄の調声値はprofileまたはVOICEVOX標準値を継承します。</p>
            <fieldset><legend>調声（空欄で継承）</legend><div class="tuning-grid">${(Object.keys(DEFAULT_VOICEVOX_TUNING) as Array<keyof VoicevoxTuning>).map((key) => `<label>${TUNING_LABELS[key]}<input name="tuning_${key}" type="number" min="${VOICEVOX_TUNING_LIMITS[key].min}" max="${VOICEVOX_TUNING_LIMITS[key].max}" step="0.01" value="${segment.voice_tuning?.[key] ?? ""}" placeholder="実効 ${effectiveTuning[key]}"></label>`).join("")}</div></fieldset>
            <div class="actions"><button type="submit">この区間を保存</button><span class="version" data-version-label>v${options.project.version}</span></div><p class="feedback" data-form-feedback aria-live="polite"></p>
          </form>`;
        })
        .join("")
    : `<p class="prose">読み上げ区間はまだありません。構成の追加はAIクライアントから行えます。</p>`;
  const missingAlt =
    slide.composition?.mode === "canvas"
      ? slide.composition.blocks.filter(
          (block) => block.kind === "image" && block.alt_text.trim() === ""
        ).length
      : slide.composition?.mode === "scene"
        ? slide.composition.nodes.filter(
            (node) => node.kind === "image" && node.alt_text.trim() === ""
          ).length
        : 0;
  const missingAudio =
    slide.narration?.segments.filter((segment) => segment.audio_src === null).length ?? 0;
  const markdownBlocks = slide.content_markdown
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);
  const headingCount = markdownBlocks.filter((block) => /^#{1,6}\s/m.test(block)).length;
  const paragraphCount = markdownBlocks.filter((block) => !/^(?:#{1,6}\s|[-*+]\s)/m.test(block)).length;
  const needsReadingLayout =
    slide.content_markdown.length > 550 ||
    (headingCount >= 2 && paragraphCount >= 3);
  const qualityItems = [
    ...(missingAlt > 0 ? [`説明のない画像が${missingAlt}件あります。`] : []),
    ...(missingAudio > 0
      ? [`${missingAudio}区間はVOICEVOX音声が未生成です。編集画面ではブラウザ音声で仮試聴できます。`]
      : []),
    ...(slide.composition?.clip_content
      ? ["枠外を隠す設定です。実表示の見切れ診断を確認してください。"]
      : []),
    ...(slide.composition === null || slide.composition === undefined
      ? needsReadingLayout && ["statement", "standard"].includes(typography.preset)
        ? ["文章量が多いため、「読み物」または「2段組み」の組版presetも確認してください。"]
        : typography.columns === 3 && (deck.aspect_ratio ?? "16:9") === "4:3"
          ? ["4:3で3段組みを使っています。1段あたりの行長と見切れ診断を確認してください。"]
          : typography.columns > 1 && headingCount === 0 && slide.content_markdown.length > 320
            ? ["段組みの文章に見出しがありません。段の切り替わりを追いやすいよう、小見出しの追加を検討してください。"]
          : []
      : [])
  ];
  const effectiveSummary = `<div class="setting-summary" aria-label="現在有効な設定">
    <span class="setting-chip"><small>layout</small>${escapeHtml(deck.layout)}</span>
    <span class="setting-chip"><small>template</small>${escapeHtml(activeTemplate?.name ?? "組み込み")}</span>
    <span class="setting-chip"><small>visual</small>${VISUAL_LABELS[visualPreset]}</span>
    <span class="setting-chip"><small>font</small>${FONT_LABELS[bodyFont]} / ${FONT_LABELS[headingFont]}</span>
    <span class="setting-chip"><small>組版</small>${SLIDE_TYPOGRAPHY_LABELS[typography.preset]} · ${typography.columns}段</span>
    <span class="setting-chip"><small>tone</small>${TONE_LABELS[slide.tone]}</span>
    <span class="setting-chip"><small>animation</small>${ANIMATION_LABELS[effectiveEnter]}</span>
    <span class="setting-chip"><small>読み上げ</small>${NARRATION_DISPLAY_LABELS[narrationDisplay]}</span>
    <span class="setting-chip"><small>voice</small>${escapeHtml(defaultProfile?.label ?? "Web Speech")}</span>
  </div>`;
  return new Response(
    shell(
      `${slide.title} — スライド編集`,
      `${accountHeader(options.twitchLogin, options.csrfToken)}
       <main class="workspace-main">
         <a class="back" href="/dashboard/projects/${escapeHtml(options.project.project_id)}">← 研究詳細へ戻る</a>
         <div class="workspace-head"><div><p class="eyebrow">Slide workspace · ${slideIndex + 1} / ${deck.slides.length}</p><h1>${escapeHtml(slide.title)}</h1></div><div class="workspace-version"><span data-workspace-version>v${options.project.version}</span>${previousSlideLink}${nextSlideLink}<button class="ghost" type="button" data-preview-focus aria-pressed="false">プレビューを広げる</button><a class="button ghost" href="/dashboard/projects/${escapeHtml(options.project.project_id)}/slides/${escapeHtml(slide.id)}/frame?slide=${slideIndex + 1}&step=0" target="_blank" rel="noopener">別画面で開く</a></div></div>
         ${effectiveSummary}
         <div class="slide-workspace">
           <nav class="filmstrip" aria-label="スライド一覧">${filmstrip}</nav>
           <section class="panel workspace-preview">
             <div class="workspace-frame" style="--workspace-aspect:${(deck.aspect_ratio ?? "16:9") === "4:3" ? "4 / 3" : "16 / 9"}"><span class="frame-loading" data-frame-loading role="status">プレビューを読み込み中…</span><iframe title="${escapeHtml(slide.title)}の実表示" src="/dashboard/projects/${escapeHtml(options.project.project_id)}/slides/${escapeHtml(slide.id)}/frame?slide=${slideIndex + 1}&step=0" data-slide-frame data-aspect-ratio="${deck.aspect_ratio ?? "16:9"}"></iframe></div>
             <div class="step-control"><button class="ghost" type="button" data-step-direction="previous">← 段階</button><output data-step-output aria-live="polite">STEP 0 / ${slide.reveal_steps}</output><button class="ghost" type="button" data-step-direction="next">段階 →</button></div>
             <p class="quality-status" data-layout-status role="status" aria-live="polite">実表示の文字収まりを確認しています…</p>
           </section>
           <aside class="inspector">
             <details class="inspector-section" open><summary>内容</summary><div class="inspector-body">
               <form class="editor" data-slide-editor data-versioned-form action="${slidePath}" data-version="${options.project.version}" data-max-step="${slide.reveal_steps}" data-csrf="${escapeHtml(options.csrfToken)}">
                 <label>タイトル<input name="title" maxlength="120" required value="${escapeHtml(slide.title)}"></label>
                 <label>想定秒数<input name="duration_seconds" type="number" min="1" max="1200" required value="${slide.duration_seconds}"></label>
                 <label>スライド本文（Markdown対応）<textarea name="content_markdown" maxlength="20000" required>${escapeHtml(slide.content_markdown)}</textarea><small class="inherit-note">見出しは #、箇条書きは - で始めます。自由配置・リッチ構成では代替表示にも使います。</small></label>
                 <label>補足欄（読み上げない情報）<textarea name="sidebar_markdown" maxlength="10000">${escapeHtml(slide.sidebar_markdown ?? "")}</textarea><small class="inherit-note">作者コメント、出典、追加データなど、音声に含めない情報を置けます。</small></label>
                 <div class="actions"><button type="submit">内容を保存</button>${nextSlidePath === null ? "" : `<button class="ghost" type="submit" data-save-next="${nextSlidePath}">保存して次へ</button>`}<span class="version" data-version-label>v${options.project.version}</span></div>
                 <p class="feedback" data-form-feedback aria-live="polite"></p>
               </form>
             </div></details>
             <details class="inspector-section"><summary>デザイン</summary><div class="inspector-body">
               <form class="editor" data-appearance-editor data-versioned-form action="${slidePath}" data-version="${options.project.version}" data-csrf="${escapeHtml(options.csrfToken)}"><label>template<select name="template_id">${templateOptions}</select></label><div class="editor-grid"><label>用途<select name="role"><option value="content"${slide.role !== "cover" ? " selected" : ""}>通常スライド</option><option value="cover"${slide.role === "cover" ? " selected" : ""}>表紙</option></select></label><label>表紙レイアウト<select name="cover_layout">${[["center", "中央タイトル"], ["split", "左右分割"], ["poster", "ポスター"], ["minimal", "余白重視"], ["statement", "一言を強調"]].map(([value, label]) => `<option value="${value}"${(slide.cover_layout ?? "center") === value ? " selected" : ""}>${label}</option>`).join("")}</select></label></div><div class="editor-grid"><label>tone<select name="tone">${Object.entries(TONE_LABELS).map(([value, label]) => `<option value="${value}"${slide.tone === value ? " selected" : ""}>${label}</option>`).join("")}</select></label><label>表示animation<select name="enter_animation"><option value=""${slide.enter_animation === null || slide.enter_animation === undefined ? " selected" : ""}>templateを継承</option>${animationOptions}</select></label></div><div class="actions"><button type="submit">スライド外観を保存</button><span class="version" data-version-label>v${options.project.version}</span></div><p class="feedback" data-form-feedback aria-live="polite"></p></form>
               ${typographyEditor}
               ${templateCreator}
               ${templateEditor}
             </div></details>
             <details class="inspector-section"><summary>読み上げ</summary><div class="inspector-body">
               <form class="editor" data-narration-settings-editor data-versioned-form action="${slidePath}/narration/settings" data-version="${options.project.version}" data-csrf="${escapeHtml(options.csrfToken)}"><div class="editor-grid"><label>表示形式<select name="display">${Object.entries(NARRATION_DISPLAY_LABELS).map(([value, label]) => `<option value="${value}"${narrationDisplay === value ? " selected" : ""}>${label}</option>`).join("")}</select></label><label>スライド話者名<input name="speaker" maxlength="80" value="${escapeHtml(slide.narration?.speaker ?? "")}" placeholder="deck既定: ${escapeHtml(deck.narration_defaults?.speaker ?? "なし")}"></label></div><fieldset><legend>読み上げ枠</legend><div class="editor-grid"><label>配置<select name="placement">${[["bottom", "下部"], ["overlay-bottom", "下部に重ねる"], ["sidebar", "補足欄"]].map(([value, label]) => `<option value="${value}"${narrationAppearance.placement === value ? " selected" : ""}>${label}</option>`).join("")}</select></label><label>大きさ<select name="size">${[["compact", "小"], ["normal", "標準"], ["large", "大"]].map(([value, label]) => `<option value="${value}"${narrationAppearance.size === value ? " selected" : ""}>${label}</option>`).join("")}</select></label><label>文字揃え<select name="text_align"><option value="start"${narrationAppearance.text_align === "start" ? " selected" : ""}>左</option><option value="center"${narrationAppearance.text_align === "center" ? " selected" : ""}>中央</option></select></label><label>文字倍率<input name="text_scale" type="number" min="0.75" max="1.5" step="0.05" value="${narrationAppearance.text_scale}"></label><label>最大行数<input name="max_lines" type="number" min="2" max="8" value="${narrationAppearance.max_lines}"></label></div><label class="check-label"><input name="speaker_visible" type="checkbox"${narrationAppearance.speaker_visible ? " checked" : ""}>話者名を表示</label><label class="check-label"><input name="progress_visible" type="checkbox"${narrationAppearance.progress_visible ? " checked" : ""}>読み上げ進捗を表示</label></fieldset><p class="inherit-note">話者の実効値: ${escapeHtml(effectiveSpeaker ?? "なし")}。この欄で保存するとslide設定として上書きします。</p><div class="actions"><button type="submit">読み上げ枠を保存</button><span class="version" data-version-label>v${options.project.version}</span></div><p class="feedback" data-form-feedback aria-live="polite"></p></form>
               ${voiceSegments}
             </div></details>
             <details class="inspector-section"><summary>構造 · ${escapeHtml(slideCompositionLabel(slide))}</summary><div class="inspector-body"><p class="mode-note">${escapeHtml(modeNote)}</p>${componentOutline}</div></details>
             <details class="inspector-section" open><summary>品質確認</summary><div class="inspector-body"><p class="quality-status" data-quality-summary data-base-count="${qualityItems.length}" data-level="${qualityItems.length ? "warning" : "ok"}">${qualityItems.length ? `${qualityItems.length}件の確認事項があります。` : "保存データ上の確認事項はありません。"}</p><ul class="quality-list" data-quality-list>${qualityItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div></details>
           </aside>
         </div>
       </main><script src="${DASHBOARD_SCRIPT_SRC}" defer></script>`
    ),
    { headers: headers() }
  );
}

export function projectNotFoundPage(): Response {
  return new Response(
    shell(
      "研究が見つかりません — 最自由研究",
      `<main><section class="panel notice"><p class="eyebrow">Not found</p><h1 class="detail-title">研究が見つかりません</h1><p class="lead">削除されたか、このアカウントでは表示できない研究です。</p><a class="button primary" href="/dashboard">自分の研究へ戻る</a></section></main>`
    ),
    { status: 404, headers: headers() }
  );
}

export function redirectPage(
  location: string,
  setCookies: string[] = []
): Response {
  const responseHeaders = headers(setCookies);
  responseHeaders.set("location", location);
  responseHeaders.delete("content-type");
  return new Response(null, { status: 303, headers: responseHeaders });
}

export function webLoginCompletePage(setCookies: string[]): Response {
  return redirectPage("/dashboard", setCookies);
}
