import { escapeHtml } from "../auth/pages";
import { PROJECT_IMAGE_LIMIT, type ProjectAsset } from "../assets/schema";
import {
  type ProjectRecord,
  type SlideBlock,
  type SlideSceneNode
} from "../projects/schema";
import type { DashboardProjectSummary } from "../projects/repository";
import {
  MAX_PROJECT_DOCUMENT_BYTES,
  projectDocumentBytes
} from "../projects/repository";
import {
  DEFAULT_VOICEVOX_TUNING,
  VOICEVOX_TUNING_LIMITS,
  mergeVoicevoxTuning,
  type VoicevoxTuning
} from "@ultimate-freestyle/research-schema/voice";
import {
  MAX_PRESENTATION_DURATION_SECONDS,
  type PublicationStatus
} from "../publications/service";
import {
  PRESENTATION_RENDERER_VERSION
} from "../presentation/render";
import { VOICEVOX_CATALOG } from "@ultimate-freestyle/research-schema/voicevox-catalog";
import { recommendedFlowBodyLimit, resolveSlideTypography } from "../projects/typography";
import type { RenderedQualityReport } from "../projects/quality-reports";
import { flattenSlideReviewSources } from "../reviews/flatten";
import {
  buildReviewRepairInstruction,
  reviewCommentWithAnchor
} from "../reviews/service";
import type { ReviewComment } from "../reviews/repository";
import { TEMPLATE_PRESET_DEFAULTS } from "../projects/mutation-tools";
import { SCENE_PATTERN_OPTIONS } from "../projects/scene-patterns";
import { DASHBOARD_ASSET_VERSION } from "./assets";
import { DASHBOARD_DESIGN_STYLE } from "./dashboard-design";
import { DESIGN_TOKEN_STYLE } from "./design-tokens";
import { renderClientChoiceGuide } from "./client-guide";
import {
  MAX_JOB_CHARACTERS,
  MAX_SEGMENT_CHARACTERS,
  selectVoiceGenerationBatch
} from "../voicevox/service";

function formatDuration(seconds: number): string {
  return `${Math.floor(seconds / 60)}分${String(seconds % 60).padStart(2, "0")}秒`;
}

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
  scientific: "サイエンス",
  museum: "ミュージアム",
  terminal: "ターミナル"
} as const;

const MOTIF_LABELS = {
  none: "なし",
  dots: "点",
  grid: "方眼",
  diagonal: "斜線",
  rings: "同心円",
  waves: "波"
} as const;

const HEADING_TREATMENT_LABELS = {
  plain: "装飾なし",
  "accent-line": "アクセント線",
  highlight: "マーカー",
  boxed: "囲み",
  outline: "縁取り"
} as const;

const IMAGE_TREATMENT_LABELS = {
  natural: "素材をそのまま",
  rounded: "角丸",
  framed: "額装",
  monochrome: "モノクロ"
} as const;

const PANEL_TREATMENT_LABELS = {
  flat: "素のまま",
  soft: "やわらかい面",
  outline: "線で囲む",
  raised: "浮き上がる",
  glass: "ガラス"
} as const;

const SLIDE_ROLE_LABELS = {
  cover: "表紙",
  section: "章扉",
  content: "本文",
  comparison: "比較",
  result: "結果",
  closing: "結び"
} as const;

const FONT_LABELS = {
  "system-sans": "端末標準ゴシック",
  gothic: "モダンゴシック",
  rounded: "丸ゴシック",
  mincho: "明朝",
  serif: "クラシックセリフ",
  monospace: "等幅",
  display: "強調見出し",
  textbook: "教科書体",
  handwritten: "手書き・ノート",
  condensed: "凝縮ゴシック"
} as const;
const FONT_CANDIDATES: Record<keyof typeof FONT_LABELS, string[]> = {
  "system-sans": [],
  gothic: ["BIZ UDPGothic", "Yu Gothic", "Hiragino Kaku Gothic ProN"],
  rounded: ["M PLUS Rounded 1c", "Hiragino Maru Gothic ProN"],
  mincho: ["Noto Serif JP", "Yu Mincho", "Hiragino Mincho ProN"],
  serif: ["Georgia", "Noto Serif JP", "Yu Mincho"],
  monospace: ["BIZ UDGothic", "SFMono-Regular", "Consolas"],
  display: ["Arial Black", "Hiragino Kaku Gothic StdN", "Yu Gothic"],
  textbook: ["UD Digi Kyokasho N-R", "YuKyokasho", "Hiragino Mincho ProN"],
  handwritten: ["Klee", "Hannotate SC", "YuKyokasho"],
  condensed: ["Avenir Next Condensed", "Arial Narrow", "Hiragino Kaku Gothic ProN"]
};

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

function colorLuminance(hex: string): number {
  const channels = [1, 3, 5].map((index) => {
    const value = Number.parseInt(hex.slice(index, index + 2), 16) / 255;
    return value <= 0.04045
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function colorContrast(first: string, second: string): number {
  const firstLuminance = colorLuminance(first);
  const secondLuminance = colorLuminance(second);
  return (
    (Math.max(firstLuminance, secondLuminance) + 0.05) /
    (Math.min(firstLuminance, secondLuminance) + 0.05)
  );
}

const NARRATION_DISPLAY_LABELS = {
  dialogue: "ADV会話枠",
  commentary: "実況字幕",
  inline: "全文追従",
  subtitle: "映像字幕",
  minimal: "最小表示"
} as const;

const DASHBOARD_SCRIPT_SRC = `/assets/dashboard.js?v=${DASHBOARD_ASSET_VERSION}`;
const MCP_ENDPOINT = "https://saijiyu-kenkyu.2764.moe/mcp";
const FIRST_RESEARCH_PROMPT = "最自由研究MCPを使って、新しい研究を対話しながら作りたいです。まず興味のあることを一つずつ聞いてください。";
const CODEX_MCP_ADD_COMMAND = `codex mcp add saijiyu-kenkyu --url ${MCP_ENDPOINT}`;
const CODEX_MCP_LOGIN_COMMAND = "codex mcp login saijiyu-kenkyu";
const CLAUDE_MCP_ADD_COMMAND = `claude mcp add --transport http --scope user saijiyu-kenkyu ${MCP_ENDPOINT}`;

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
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self'",
      "connect-src 'self'",
      "img-src 'self' blob: data:",
      "frame-src 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "base-uri 'none'"
    ].join("; "),
    "content-type": "text/html; charset=utf-8",
    "permissions-policy":
      "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "referrer-policy": "no-referrer",
    "strict-transport-security": "max-age=31536000",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY"
  });
  for (const cookie of setCookies) {
    result.append("set-cookie", cookie);
  }
  return result;
}

function serializedValueBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

const DASHBOARD_STYLE = String.raw`
      :root { font-family: Inter, "Noto Sans JP", system-ui, sans-serif; }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; background: radial-gradient(circle at 15% -10%, var(--accent-soft) 0, transparent 36rem), radial-gradient(circle at 85% 0%, var(--accent-soft) 0, transparent 32rem), var(--bg); color: var(--ink); }
      a { color: inherit; }
      .site-header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; width: min(92vw, 72rem); margin: 0 auto; padding: 1.4rem 0; }
      .brand { text-decoration: none; font-weight: 850; letter-spacing: .02em; }
      .account { display: flex; align-items: center; gap: .75rem; color: var(--muted); }
      .account strong { color: var(--ink); }
      main { width: min(92vw, 72rem); margin: 0 auto; padding: clamp(2rem, 7vw, 6rem) 0 5rem; }
      .hero { display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(18rem, .75fr); gap: clamp(2rem, 6vw, 5rem); align-items: center; }
      .hero-copy { min-width: 0; }
      .landing-flow { display: grid; gap: .75rem; margin: 0; padding: 1rem; border: 1px solid var(--line); border-radius: 1rem; background: var(--accent-soft); list-style: none; counter-reset: landing-step; }
      .landing-flow li { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: .75rem; align-items: start; padding: .8rem; border-radius: .75rem; background: var(--accent-soft); color: var(--accent-strong); line-height: 1.55; counter-increment: landing-step; }
      .landing-flow li::before { content: counter(landing-step); display: grid; place-items: center; width: 1.8rem; height: 1.8rem; border-radius: 50%; background: var(--accent); color: white; font-weight: 850; }
      .landing-flow strong { display: block; margin-bottom: .2rem; color: var(--ink); }
      .landing-flow small { color: var(--muted); }
      .eyebrow { margin: 0 0 .7rem; color: var(--accent-strong); font-size: .78rem; font-weight: 850; letter-spacing: .14em; text-transform: uppercase; }
      h1 { margin: 0; font-size: clamp(2.25rem, 7vw, 5.4rem); line-height: 1.02; letter-spacing: -.045em; }
      .keep-word { white-space: nowrap; }
      .lead { max-width: 42rem; margin: 1.5rem 0 0; color: var(--accent-strong); font-size: clamp(1rem, 2vw, 1.2rem); line-height: 1.8; }
      .button, button { display: inline-flex; align-items: center; justify-content: center; min-height: 2.8rem; padding: .7rem 1rem; border: 0; border-radius: .7rem; background: var(--accent); color: white; font: inherit; font-weight: 780; text-decoration: none; cursor: pointer; }
      :where(a, button, input, textarea, select, summary):focus-visible { outline: .2rem solid var(--accent-strong); outline-offset: .18rem; }
      .skip-link { position: fixed; z-index: 1000; top: .65rem; left: .65rem; translate: 0 calc(-100% - 1rem); padding: .7rem 1rem; border-radius: .65rem; background: var(--accent-strong); color: var(--accent-soft); font-weight: 850; text-decoration: none; transition: translate .15s ease; }
      .skip-link:focus { translate: 0; }
      .button.primary { margin-top: 1.7rem; padding: .9rem 1.25rem; }
      .ghost { border: 1px solid var(--line); background: var(--accent-soft); color: var(--accent-strong); }
      .section-head { display: flex; align-items: end; justify-content: space-between; gap: 1rem; margin: 0 0 1.25rem; }
      .project-section-nav { position: sticky; z-index: 14; top: .5rem; display: flex; gap: .35rem; margin: 1rem 0; padding: .45rem; overflow-x: auto; border: 1px solid var(--line); border-radius: .85rem; background: var(--accent-soft); box-shadow: 0 .4rem 1rem color-mix(in srgb, var(--shadow-color) 33%, transparent); backdrop-filter: blur(14px); scrollbar-width: thin; }
      .project-section-nav a { display: inline-flex; flex: 0 0 auto; align-items: center; min-height: 2.75rem; padding: .5rem .7rem; border-radius: .55rem; color: var(--muted); font-size: .78rem; font-weight: 760; text-decoration: none; white-space: nowrap; }
      .project-section-nav a:hover, .project-section-nav a:focus-visible { background: var(--surface-accent); color: var(--ink); }
      .project-section-nav a[aria-current="location"] { background: var(--accent-strong); color: var(--ink); }
      #journey, #basic-information, #presentation-screen, #rendered-quality, #presentation-structure, #research-images, #research-log, #research-list-findings, #research-list-limitations, [id^="research-item-"], #voice-finishing, #publication { scroll-margin-top: 5rem; }
      .section-head h1 { font-size: clamp(2rem, 5vw, 3.6rem); }
      .count { color: var(--muted); }
      .connection-guide { margin-top: 1.25rem; border: 1px solid var(--accent-strong); border-radius: 1rem; background: var(--accent-soft); }
      .connection-guide > summary { padding: 1rem 1.2rem; cursor: pointer; font-weight: 820; }
      .connection-guide[open] > summary { border-bottom: 1px solid var(--line); }
      .connection-body { display: grid; gap: 1rem; padding: 1.2rem; }
      .connection-body > p { margin: 0; color: var(--muted); line-height: 1.7; }
      .setup-steps { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr)); gap: .7rem; margin: 0; padding: 0; list-style: none; counter-reset: setup; }
      .setup-steps li { padding: .85rem; border: 1px solid var(--line); border-radius: .75rem; background: var(--accent-soft); color: var(--accent-strong); line-height: 1.6; counter-increment: setup; }
      .setup-steps li::before { content: counter(setup); display: grid; place-items: center; width: 1.55rem; height: 1.55rem; margin-bottom: .55rem; border-radius: 50%; background: var(--accent); color: white; font-weight: 850; }
      .endpoint-box { display: flex; align-items: center; flex-wrap: wrap; gap: .65rem; padding: .75rem; border: 1px dashed var(--accent-strong); border-radius: .7rem; background: var(--accent-soft); }
      .endpoint-box code { min-width: 0; flex: 1; color: var(--accent-strong); overflow-wrap: anywhere; }
      .landing-nav { display: flex; align-items: center; gap: .5rem; }
      .landing-nav a { min-height: 2.65rem; padding: .62rem .8rem; border-radius: .65rem; color: var(--accent-strong); font-size: .84rem; font-weight: 760; text-decoration: none; }
      .landing-nav a:hover { background: var(--surface-accent); color: var(--accent-strong); }
      .landing-section { padding: clamp(2.5rem, 7vw, 5rem) 0 0; }
      .landing-section h2, .guide-section h2 { margin: 0; font-size: clamp(1.6rem, 4vw, 2.5rem); line-height: 1.15; }
      .landing-section-head { max-width: 46rem; margin-bottom: 1.3rem; }
      .landing-section-head p, .guide-intro { color: var(--muted); line-height: 1.75; }
      .product-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .8rem; }
      .product-card { padding: 1.15rem; border: 1px solid var(--line); border-radius: .9rem; background: var(--accent-soft); }
      .product-card h3 { margin: 0 0 .5rem; font-size: 1rem; }
      .product-card p { margin: 0; color: var(--muted); font-size: .88rem; line-height: 1.7; }
      .role-table { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); overflow: hidden; border: 1px solid var(--line); border-radius: 1rem; background: var(--accent-soft); }
      .role-table > article { padding: 1.25rem; }
      .role-table > article + article { border-left: 1px solid var(--line); }
      .role-table h3 { margin: 0 0 .7rem; }
      .role-table ul, .plain-list { margin: 0; padding-left: 1.2rem; color: var(--accent-strong); line-height: 1.75; }
      .landing-cta { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-top: clamp(2.5rem, 7vw, 5rem); padding: clamp(1.25rem, 4vw, 2rem); border: 1px solid var(--accent); border-radius: 1rem; background: linear-gradient(135deg, var(--accent-soft), var(--accent-soft)); }
      .landing-cta h2 { margin: 0; font-size: clamp(1.35rem, 4vw, 2rem); }
      .landing-cta p { margin: .45rem 0 0; color: var(--accent-strong); line-height: 1.65; }
      .guide-hero { display: grid; gap: 1rem; padding-bottom: 1rem; }
      .guide-hero h1 { font-size: clamp(2.2rem, 6vw, 4.3rem); }
      .guide-meta { display: flex; flex-wrap: wrap; gap: .5rem; margin: 0; padding: 0; list-style: none; }
      .guide-meta li { padding: .35rem .62rem; border: 1px solid var(--accent-strong); border-radius: 999px; color: var(--accent-strong); font-size: .78rem; }
      .guide-nav { position: sticky; z-index: 12; top: .5rem; display: flex; gap: .4rem; margin: 1.4rem 0; padding: .45rem; overflow-x: auto; border: 1px solid var(--line); border-radius: .8rem; background: var(--accent-soft); backdrop-filter: blur(12px); }
      .guide-nav a { flex: 0 0 auto; padding: .58rem .72rem; border-radius: .55rem; color: var(--accent-strong); font-size: .78rem; font-weight: 780; text-decoration: none; }
      .guide-nav a:hover { background: var(--surface-accent); color: var(--accent-strong); }
      .guide-section { display: grid; gap: 1rem; padding: 2.5rem 0 0; scroll-margin-top: 4.8rem; }
      .guide-step-list { display: grid; gap: .7rem; margin: 0; padding: 0; list-style: none; counter-reset: guide-step; }
      .guide-step { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: .85rem; padding: 1rem; border: 1px solid var(--line); border-radius: .85rem; background: var(--accent-soft); counter-increment: guide-step; }
      .guide-step::before { content: counter(guide-step); display: grid; place-items: center; width: 2rem; height: 2rem; border-radius: 50%; background: var(--accent); color: white; font-weight: 850; }
      .guide-step h3 { margin: .15rem 0 .4rem; font-size: 1rem; }
      .guide-step p { margin: 0; color: var(--muted); line-height: 1.7; }
      .guide-step .endpoint-box { margin-top: .75rem; }
      .guide-note { padding: 1rem; border-left: .22rem solid var(--accent-strong); border-radius: 0 .7rem .7rem 0; background: var(--accent-soft); color: var(--accent-strong); line-height: 1.7; }
      .guide-note strong { color: white; }
      .guide-warning { border-left-color: var(--caution); background: var(--caution-surface); }
      .decision-flow { display: grid; justify-items: center; gap: .8rem; padding: 1.1rem; border: 1px solid var(--accent-strong); border-radius: 1rem; background: linear-gradient(160deg, var(--accent-soft), var(--accent-soft)); }
      .decision-question { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: .85rem; width: min(100%, 42rem); padding: 1rem; border: 1px solid var(--accent); border-radius: .85rem; background: var(--accent-soft); }
      .decision-question h3 { margin: .12rem 0 .35rem; font-size: clamp(1.05rem, 2.5vw, 1.3rem); line-height: 1.4; }
      .decision-question p { margin: 0; color: var(--accent-strong); line-height: 1.65; }
      .decision-number { display: grid; place-items: center; width: 2.2rem; height: 2.2rem; border-radius: 50%; background: var(--accent-strong); color: white; font-weight: 900; }
      .decision-kicker { color: var(--accent-strong) !important; font-size: .68rem; font-weight: 850; letter-spacing: .12em; text-transform: uppercase; }
      .decision-branches { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .65rem; width: 100%; }
      .decision-branches-three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .decision-result, .decision-next { display: grid; align-content: start; gap: .38rem; min-height: 8.4rem; padding: .9rem; border: 1px solid var(--line); border-radius: .8rem; background: var(--accent-soft); color: inherit; text-decoration: none; }
      .decision-result { transition: transform .15s ease, border-color .15s ease, background .15s ease; }
      .decision-result:hover { transform: translateY(-2px); border-color: var(--accent-strong); background: var(--accent-soft); }
      .decision-result:focus-visible { outline: .2rem solid var(--accent-strong); outline-offset: .15rem; }
      .decision-result strong, .decision-next strong { font-size: .96rem; line-height: 1.45; }
      .decision-result small, .decision-next small { color: var(--muted); line-height: 1.55; }
      .decision-answer { color: var(--accent-strong); font-size: .7rem; font-weight: 850; letter-spacing: .04em; }
      .decision-claude { border-color: var(--line-strong); background: var(--sunken); }
      .decision-codex { border-color: var(--line-strong); background: var(--sunken); }
      .decision-chatgpt { border-color: var(--line-strong); background: var(--sunken); }
      .decision-next { border-style: dashed; }
      .decision-connector { display: grid; place-items: center; min-height: 2.8rem; color: var(--accent-strong); font-size: .7rem; font-weight: 800; }
      .decision-connector::before { content: ""; width: 1px; height: .65rem; background: var(--accent-strong); }
      .decision-connector::after { content: "↓"; color: var(--accent-strong); font-size: 1.1rem; line-height: 1; }
      .decision-connector span { padding: .2rem .48rem; border: 1px solid var(--accent-strong); border-radius: 999px; background: var(--accent-soft); }
      .guide-recommendation { padding: 1.15rem; border: 1px solid var(--accent-strong); border-radius: .9rem; background: linear-gradient(135deg, var(--accent-soft), var(--accent-soft)); }
      .guide-recommendation strong { display: block; font-size: clamp(1.05rem, 3vw, 1.35rem); line-height: 1.45; }
      .guide-recommendation p:last-child { margin: .55rem 0 0; color: var(--accent-strong); line-height: 1.7; }
      .plan-comparison { overflow-x: auto; border: 1px solid var(--line); border-radius: .9rem; scroll-margin-top: 4.8rem; }
      .plan-table { width: 100%; min-width: 48rem; border-collapse: collapse; background: var(--accent-soft); }
      .plan-table th, .plan-table td { padding: .85rem; border-bottom: 1px solid var(--line); vertical-align: top; text-align: left; line-height: 1.55; }
      .plan-table thead th { background: var(--accent-soft); color: var(--accent-strong); font-size: .76rem; }
      .plan-table tbody th { width: 7.5rem; }
      .plan-table td { color: var(--accent-strong); font-size: .82rem; }
      .plan-table small { color: var(--muted); }
      .client-mark { display: inline-flex; padding: .28rem .5rem; border: 1px solid currentColor; border-radius: 999px; font-size: .74rem; }
      .client-mark-claude { color: var(--muted); }
      .client-mark-codex { color: var(--muted); }
      .client-mark-chatgpt { color: var(--muted); }
      .guide-source-note { margin: 0; color: var(--accent-strong); font-size: .75rem; line-height: 1.65; }
      .troubleshooting { width: 100%; border-collapse: collapse; border: 1px solid var(--line); background: var(--accent-soft); }
      .troubleshooting th, .troubleshooting td { padding: .9rem; border-bottom: 1px solid var(--line); vertical-align: top; text-align: left; line-height: 1.65; }
      .troubleshooting th { width: 32%; color: var(--accent-strong); }
      .troubleshooting td { color: var(--muted); }
      .official-links { display: flex; flex-wrap: wrap; gap: .5rem; }
      .official-links a { padding: .55rem .7rem; border: 1px solid var(--line); border-radius: .6rem; color: var(--accent-strong); font-size: .8rem; text-decoration: none; }
      .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 19rem), 1fr)); gap: 1rem; }
      .card, .empty { border: 1px solid var(--line); border-radius: 1rem; background: linear-gradient(150deg, var(--accent-soft), var(--accent-soft)); box-shadow: 0 1rem 3rem color-mix(in srgb, var(--shadow-color) 26%, transparent); }
      .card-link { display: block; border-radius: 1rem; color: inherit; text-decoration: none; }
      .card-link:hover .card { border-color: var(--accent-strong); transform: translateY(-2px); }
      .card-link:focus-visible { outline: .2rem solid var(--accent-strong); outline-offset: .2rem; }
      .card { min-height: 13rem; padding: 1.25rem; }
      .card { transition: border-color .15s ease, transform .15s ease; }
      .card-top { display: flex; align-items: center; justify-content: space-between; gap: .75rem; }
      .stage { display: inline-flex; padding: .3rem .58rem; border: 1px solid var(--line-strong); border-radius: 999px; background: var(--sunken); color: var(--ink); font-size: .78rem; font-weight: 800; }
      .version { color: var(--muted); font-size: .78rem; }
      .card h2 { margin: 1.2rem 0 .6rem; font-size: 1.35rem; overflow-wrap: anywhere; }
      .meta { margin: 0; color: var(--muted); font-size: .88rem; line-height: 1.6; }
      .project-statuses { display: flex; flex-wrap: wrap; gap: .35rem; margin-top: .8rem; }
      .project-status { padding: .22rem .45rem; border: 1px solid var(--accent-strong); border-radius: 999px; color: var(--accent-strong); font-size: .7rem; font-weight: 750; }
      .project-status[data-state="ready"] { border-color: var(--line-strong); background: var(--sunken); color: var(--muted); }
      .project-status[data-kind="publication"][data-state="ready"] { border-color: var(--achieved); background: var(--achieved-surface); color: var(--achieved); }
      .project-status[data-state="attention"] { border-color: var(--caution); background: var(--caution-surface); color: var(--caution); }
      .project-attention { margin: .55rem 0 0; color: var(--caution); font-size: .72rem; line-height: 1.5; }
      .empty { padding: clamp(1.5rem, 5vw, 3rem); text-align: center; }
      .empty h2 { margin-top: 0; }
      .empty p { color: var(--muted); line-height: 1.7; }
      .hint { margin: 1.5rem 0 0; padding: 1rem 1.15rem; border-left: .2rem solid var(--accent-strong); background: var(--accent-soft); color: var(--accent-strong); line-height: 1.7; }
      .journey { display: grid; gap: 1rem; margin: 1.5rem 0; padding: clamp(1rem, 3vw, 1.5rem); border: 1px solid var(--accent-strong); border-radius: 1rem; background: linear-gradient(135deg, var(--accent-soft), var(--accent-soft)); box-shadow: 0 1rem 3rem color-mix(in srgb, var(--shadow-color) 20%, transparent); }
      .journey-head { display: flex; align-items: start; justify-content: space-between; gap: 1rem; }
      .journey-head h2, .journey-next h3 { margin: 0; }
      .journey-head p, .journey-next p { margin: .35rem 0 0; color: var(--muted); line-height: 1.65; }
      .journey-progress { min-width: 8rem; text-align: right; }
      .journey-progress strong { display: block; font-size: 1.35rem; }
      .journey-progress progress { width: 8rem; accent-color: var(--accent); }
      .journey-steps { display: grid; grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr)); gap: .55rem; margin: 0; padding: 0; list-style: none; }
      .journey-step { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: .55rem; align-items: center; padding: .7rem; border: 1px solid var(--line); border-radius: .7rem; color: var(--muted); }
      .journey-step::before { content: "○"; color: var(--line-strong); font-weight: 900; }
      .journey-step[data-complete="true"] { border-color: var(--line-strong); background: var(--sunken); color: var(--ink); }
      .journey-step[data-complete="true"]::before { content: "✓"; color: var(--ink); }
      .journey-step[data-kind="publication"][data-complete="true"] { border-color: var(--achieved); background: var(--achieved-surface); color: var(--achieved); }
      .journey-step[data-kind="publication"][data-complete="true"]::before { color: var(--achieved); }
      .journey-step small { display: block; margin-top: .15rem; color: inherit; opacity: .72; }
      .journey-next { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 1rem; align-items: center; padding: 1rem; border-radius: .8rem; background: var(--accent-soft); }
      .copy-box { display: grid; gap: .65rem; margin-top: 1rem; padding: 1rem; border: 1px dashed var(--accent-strong); border-radius: .8rem; background: var(--accent-soft); text-align: left; }
      .copy-box code { color: var(--accent-strong); line-height: 1.65; white-space: pre-wrap; overflow-wrap: anywhere; }
      .back { display: inline-flex; margin-bottom: 1.5rem; color: var(--accent-strong); text-decoration: none; }
      .detail-title { font-size: clamp(2rem, 6vw, 4.5rem); overflow-wrap: anywhere; }
      .detail-flow { display: grid; align-content: start; gap: 1rem; margin-top: 1.5rem; }
      .journey-facts { display: flex; flex-wrap: wrap; gap: .3rem 1.5rem; margin: 1rem 0 0; padding-top: .85rem; border-top: 1px solid var(--line); }
      .journey-facts > div { display: flex; align-items: baseline; gap: .4rem; }
      .journey-facts dt { color: var(--muted); font-size: .74rem; }
      .journey-facts dd { margin: 0; font-size: .82rem; font-weight: 760; }
      .detail-flow .editor label:not(.wide):not(.check-label) { max-width: 34rem; }
      .detail-flow .upload label:not(.upload-dropzone) { max-width: 34rem; }
      .detail-flow .publish-state > .status-row { max-width: 34rem; }
      .panel { padding: 1.25rem; border: 1px solid var(--line); border-radius: 1rem; background: var(--panel); }
      .panel-disclosure { padding: 0; }
      .panel-disclosure > summary { padding: 1.15rem 1.25rem; cursor: pointer; font-weight: 820; }
      .panel-disclosure[open] > summary { border-bottom: 1px solid var(--line); }
      .disclosure-body { padding: 1.25rem; }
      .panel h2 { margin: 0 0 .8rem; font-size: 1.05rem; }
      .panel h3 { margin: 1rem 0 .35rem; font-size: .95rem; }
      .panel p, .panel li { color: var(--accent-strong); line-height: 1.75; }
      .prose { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
      .plain-list { margin: 0; padding-left: 1.25rem; }
      .plain-list li + li { margin-top: .45rem; }
      .stat-list { display: grid; grid-template-columns: 1fr auto; gap: .55rem 1rem; margin: 0; }
      .stat-list dt { color: var(--muted); }
      .stat-list dd { margin: 0; font-weight: 750; text-align: right; }
      .stat-list dd[data-state="warning"] { color: var(--caution); }
      .project-storage { display: grid; gap: .4rem; margin-top: 1rem; }
      .project-storage progress { width: 100%; accent-color: var(--accent); }
      .project-storage[data-state="warning"] progress { accent-color: var(--caution); }
      .storage-breakdown { margin-top: .25rem; }
      .storage-breakdown summary { color: var(--caution); cursor: pointer; font-size: .78rem; font-weight: 780; }
      .storage-breakdown ol { display: grid; gap: .3rem; margin: .55rem 0 0; padding-left: 1.4rem; }
      .storage-breakdown li { color: var(--muted); font-size: .76rem; line-height: 1.45; }
      .storage-breakdown a { color: var(--accent-strong); }
      .log { padding: .8rem 0; border-top: 1px solid var(--line); }
      .log:first-of-type { padding-top: 0; border-top: 0; }
      .log small { color: var(--muted); }
      .slide-row { display: grid; grid-template-columns: 2.5rem minmax(0, 1fr) auto; gap: .75rem; align-items: baseline; padding: .7rem 0; border-top: 1px solid var(--line); }
      a.slide-row { color: inherit; text-decoration: none; }
      a.slide-row:hover strong { color: var(--accent-strong); }
      a.slide-row:focus-visible { outline: 2px solid var(--accent-strong); outline-offset: 3px; }
      .slide-row:first-of-type { border-top: 0; }
      .slide-row span { color: var(--muted); font-size: .85rem; }
      .slide-row strong { overflow-wrap: anywhere; }
      .slide-quality-warning { display: inline-flex; margin-top: .32rem; padding: .16rem .42rem; border: 1px solid var(--caution); border-radius: 999px; background: var(--caution-surface); color: var(--caution); font-size: .68rem; font-weight: 760; }
      .slide-list { max-height: 32rem; overflow: auto; overscroll-behavior: contain; }
      .quality-sweep { display: grid; gap: .8rem; }
      .quality-sweep-head { display: flex; align-items: center; flex-wrap: wrap; gap: .7rem; }
      .quality-sweep-head progress { min-width: min(100%, 14rem); flex: 1; accent-color: var(--accent); }
      .quality-sweep-results { display: grid; gap: .45rem; margin: 0; padding: 0; list-style: none; }
      .quality-sweep-results li { padding: .65rem .75rem; border: 1px solid var(--line); border-radius: .65rem; background: var(--accent-soft); color: var(--accent-strong); line-height: 1.55; }
      .quality-sweep-results a { color: var(--accent-strong); font-weight: 760; }
      .quality-sweep-preview { width: min(100%, 48rem); aspect-ratio: var(--quality-sweep-aspect, 16 / 9); overflow: hidden; border: 1px solid var(--accent-strong); border-radius: .65rem; background: var(--accent-soft); }
      .quality-sweep-preview[hidden] { display: none; }
      .quality-sweep-preview iframe { display: block; width: 100%; height: 100%; border: 0; }
      .asset-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr)); gap: .8rem; }
      .asset { overflow: hidden; border: 1px solid var(--line); border-radius: .8rem; background: var(--accent-soft); }
      .asset img { display: block; width: 100%; aspect-ratio: 16 / 10; object-fit: cover; background: var(--accent-soft); }
      .asset-body { display: grid; gap: .55rem; padding: .75rem; }
      .asset-body p { margin: 0; font-size: .86rem; }
      .asset-body button { justify-self: start; min-height: 2.2rem; padding: .45rem .7rem; font-size: .8rem; }
      .asset-alt { display: grid; gap: .45rem; }
      .asset-alt label { display: grid; gap: .3rem; color: var(--accent-strong); font-size: .78rem; }
      .asset-alt input { width: 100%; padding: .55rem; border: 1px solid var(--line); border-radius: .5rem; background: var(--accent-soft); color: var(--ink); font: inherit; }
      .asset-alt .actions { gap: .45rem; }
      .upload { display: grid; gap: .8rem; margin-bottom: 1rem; padding: 1rem; border: 1px dashed var(--accent-strong); border-radius: .8rem; background: var(--accent-soft); }
      .upload label { display: grid; gap: .35rem; color: var(--accent-strong); font-size: .9rem; }
      .upload input { width: 100%; padding: .65rem; border: 1px solid var(--line); border-radius: .55rem; background: var(--accent-soft); color: var(--ink); font: inherit; }
      .upload-dropzone { padding: 1rem; border: 1px dashed var(--line-strong); border-radius: .75rem; background: var(--accent-soft); text-align: center; transition: border-color .15s ease, background .15s ease; }
      .upload-dropzone[data-drag-active="true"] { border-color: var(--accent-strong); background: var(--accent-soft); color: var(--accent-strong); }
      .upload-dropzone span { font-weight: 760; }
      .upload-dropzone small { color: var(--muted); }
      .upload-preview { display: grid; grid-template-columns: 7rem minmax(0, 1fr); gap: .8rem; align-items: center; padding: .7rem; border: 1px solid var(--line); border-radius: .7rem; background: var(--accent-soft); }
      .upload-preview[hidden] { display: none; }
      .upload-preview img { display: block; width: 7rem; aspect-ratio: 16 / 10; object-fit: contain; border-radius: .45rem; background: var(--accent-soft); }
      .upload-preview p { margin: 0; color: var(--accent-strong); font-size: .82rem; overflow-wrap: anywhere; }
      .upload-preview small { display: block; margin-top: .25rem; color: var(--muted); }
      .editor { display: grid; gap: 1rem; }
      .editor-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .9rem; }
      .editor label { display: grid; gap: .4rem; color: var(--accent-strong); font-size: .9rem; }
      .editor label.wide { grid-column: 1 / -1; }
      .editor input, .editor textarea, .editor select { width: 100%; padding: .72rem; border: 1px solid var(--line); border-radius: .55rem; background: var(--accent-soft); color: var(--ink); font: inherit; line-height: 1.5; }
      .editor textarea { min-height: 7rem; resize: vertical; }
      .assembly-patterns { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr)); gap: .55rem; }
      .editor .assembly-pattern { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: .6rem; align-items: start; padding: .7rem; border: 1px solid var(--line); border-radius: .7rem; background: var(--accent-soft); cursor: pointer; }
      .editor .assembly-pattern:has(input:checked) { border-color: var(--accent); background: var(--accent-strong); box-shadow: 0 0 0 1px var(--accent); }
      .editor .assembly-pattern input { width: auto; margin-top: .18rem; accent-color: var(--accent); }
      .assembly-pattern span { display: grid; gap: .2rem; min-width: 0; }
      .assembly-pattern strong { color: var(--ink); font-size: .84rem; }
      .assembly-pattern small { color: var(--muted); font-size: .72rem; line-height: 1.5; }
      .operation-summary { display: flex; flex-wrap: wrap; gap: .35rem .65rem; align-items: baseline; margin: 0; padding: .65rem .75rem; border-left: 3px solid var(--accent); background: var(--accent-soft); color: var(--muted); font-size: .8rem; }
      .operation-summary strong { color: var(--ink); }
      .markdown-toolbar { display: flex; flex-wrap: wrap; gap: .35rem; margin-bottom: -.55rem; }
      .markdown-toolbar button { min-height: 2rem; padding: .35rem .55rem; font-size: .75rem; }
      .visual-picker { display: grid; grid-template-columns: repeat(auto-fit, minmax(6.2rem, 1fr)); gap: .45rem; }
      .visual-pick { display: grid; grid-template-columns: 1.4rem minmax(0, 1fr); gap: .45rem; min-height: 2.5rem; padding: .45rem; border: 1px solid var(--line); background: var(--accent-soft); color: var(--accent-strong); font-size: .72rem; text-align: left; }
      .visual-pick[aria-pressed="true"] { border-color: var(--accent-strong); background: var(--accent-strong); color: white; }
      .visual-swatch { width: 1.4rem; height: 1.4rem; border: 1px solid var(--ink); border-radius: 50%; background: var(--visual-swatch); box-shadow: inset -.45rem 0 var(--visual-accent); }
      .visual-pick[data-visual-pick="studio"] { --visual-swatch: var(--accent-soft); --visual-accent: var(--accent-strong); }
      .visual-pick[data-visual-pick="paper"] { --visual-swatch: var(--caution); --visual-accent: var(--accent-strong); }
      .visual-pick[data-visual-pick="editorial"] { --visual-swatch: var(--caution); --visual-accent: var(--failure); }
      .visual-pick[data-visual-pick="neon"] { --visual-swatch: var(--accent-soft); --visual-accent: var(--accent-strong); }
      .visual-pick[data-visual-pick="retro-game"] { --visual-swatch: var(--panel); --visual-accent: var(--caution); }
      .visual-pick[data-visual-pick="soft-pop"] { --visual-swatch: var(--line-strong); --visual-accent: var(--failure); }
      .visual-pick[data-visual-pick="scientific"] { --visual-swatch: var(--accent-strong); --visual-accent: var(--accent-strong); }
      .visual-pick[data-visual-pick="museum"] { --visual-swatch: var(--caution); --visual-accent: var(--caution); }
      .visual-pick[data-visual-pick="terminal"] { --visual-swatch: #12331f; --visual-accent: #4fd08a; }
      .design-axis-picker { display: grid; grid-template-columns: repeat(auto-fit, minmax(5.8rem, 1fr)); gap: .4rem; }
      .design-axis-pick { display: grid; gap: .35rem; min-height: 4.5rem; padding: .45rem; border: 1px solid var(--line); background: var(--accent-soft); color: var(--accent-strong); font-size: .68rem; }
      .design-axis-pick[aria-pressed="true"] { border-color: var(--accent-strong); background: var(--accent-strong); color: white; }
      .design-axis-wire { position: relative; display: block; width: 100%; aspect-ratio: 16 / 9; overflow: hidden; border: 1px solid var(--accent-strong); border-radius: .2rem; background-color: var(--accent-soft); }
      .design-axis-pick[data-design-field="motif"][data-design-pick="dots"] .design-axis-wire { background-image: radial-gradient(circle, var(--accent-strong) 0 2px, transparent 2.5px); background-size: 12px 12px; }
      .design-axis-pick[data-design-field="motif"][data-design-pick="grid"] .design-axis-wire { background-image: linear-gradient(var(--accent-strong) 1px, transparent 1px), linear-gradient(90deg, var(--accent-strong) 1px, transparent 1px); background-size: 14px 14px; }
      .design-axis-pick[data-design-field="motif"][data-design-pick="diagonal"] .design-axis-wire { background-image: repeating-linear-gradient(135deg, transparent 0 10px, var(--accent-strong) 10px 12px); }
      .design-axis-pick[data-design-field="motif"][data-design-pick="rings"] .design-axis-wire { background-image: repeating-radial-gradient(circle at 80% 20%, transparent 0 9px, var(--accent-strong) 10px 11px); }
      .design-axis-pick[data-design-field="motif"][data-design-pick="waves"] .design-axis-wire { background-image: radial-gradient(ellipse at 0 50%, transparent 0 10px, var(--accent-strong) 11px 12px, transparent 13px); background-size: 28px 22px; }
      .design-axis-pick[data-design-field="heading_treatment"] .design-axis-wire::before { content: "Aa"; position: absolute; left: 12%; top: 24%; color: var(--accent-strong); font-size: 1.15rem; font-weight: 850; }
      .design-axis-pick[data-design-field="heading_treatment"][data-design-pick="accent-line"] .design-axis-wire::before { padding-left: .3rem; border-left: 4px solid var(--accent-strong); }
      .design-axis-pick[data-design-field="heading_treatment"][data-design-pick="highlight"] .design-axis-wire::before { background: linear-gradient(transparent 60%, var(--accent-strong) 60%); }
      .design-axis-pick[data-design-field="heading_treatment"][data-design-pick="boxed"] .design-axis-wire::before { padding: .1rem .25rem; border: 2px solid var(--accent-strong); }
      .design-axis-pick[data-design-field="heading_treatment"][data-design-pick="outline"] .design-axis-wire::before { color: var(--accent-soft); text-shadow: -1px -1px var(--accent), 1px -1px var(--accent), -1px 1px var(--accent), 1px 1px var(--accent); }
      .design-axis-pick[data-design-field="image_treatment"] .design-axis-wire::before { content: ""; position: absolute; inset: 18% 22%; background: linear-gradient(135deg, var(--accent-strong), var(--accent-strong)); }
      .design-axis-pick[data-design-field="image_treatment"][data-design-pick="rounded"] .design-axis-wire::before { border-radius: .55rem; }
      .design-axis-pick[data-design-field="image_treatment"][data-design-pick="framed"] .design-axis-wire::before { border: 4px solid var(--accent-strong); box-shadow: 3px 3px color-mix(in srgb, var(--accent) 55%, transparent); }
      .design-axis-pick[data-design-field="image_treatment"][data-design-pick="monochrome"] .design-axis-wire::before { filter: grayscale(1); }
      .design-axis-pick[data-design-field="panel_treatment"] .design-axis-wire::before { content: ""; position: absolute; inset: 18% 14%; border: 1px solid var(--accent-strong); border-radius: .35rem; background: var(--accent-soft); }
      .design-axis-pick[data-design-field="panel_treatment"][data-design-pick="soft"] .design-axis-wire::before { border-color: transparent; background: var(--accent-soft); box-shadow: 0 5px 12px color-mix(in srgb, var(--shadow-color) 32%, transparent); }
      .design-axis-pick[data-design-field="panel_treatment"][data-design-pick="outline"] .design-axis-wire::before { border: 2px solid var(--accent-strong); background: transparent; }
      .design-axis-pick[data-design-field="panel_treatment"][data-design-pick="raised"] .design-axis-wire::before { border-color: var(--accent-strong); box-shadow: 4px 4px color-mix(in srgb, var(--accent) 40%, transparent); }
      .design-axis-pick[data-design-field="panel_treatment"][data-design-pick="glass"] .design-axis-wire::before { border-color: var(--line-strong); background: var(--surface-accent); box-shadow: 0 6px 14px color-mix(in srgb, var(--shadow-color) 38%, transparent); }
      [data-role-style-editor]:not(:has(input[name="role_style_enabled"]:checked)) .role-style-controls { opacity: .42; pointer-events: none; }
      .role-style-summary { display: flex; flex-wrap: wrap; gap: .35rem; }
      .role-style-summary span { padding: .22rem .48rem; border: 1px solid var(--line); border-radius: 99px; color: var(--accent-strong); font-size: .68rem; }
      .color-control { display: grid; grid-template-columns: 3.2rem minmax(0, 1fr); gap: .45rem; }
      .editor .color-control input[type="color"] { min-height: 2.9rem; padding: .25rem; cursor: pointer; }
      .editor .color-control input[data-color-text] { min-width: 0; font-family: "SFMono-Regular", Consolas, monospace; text-transform: lowercase; }
      .editor .color-control input[data-color-text][aria-invalid="true"] { border-color: var(--failure); }
      .font-picker { display: grid; grid-template-columns: repeat(auto-fit, minmax(7.4rem, 1fr)); gap: .45rem; }
      .font-pick { display: grid; gap: .2rem; min-height: 3.4rem; padding: .5rem; border: 1px solid var(--line); background: var(--accent-soft); color: var(--accent-strong); text-align: left; }
      .font-pick[aria-pressed="true"] { border-color: var(--accent-strong); background: var(--accent-strong); }
      .font-pick small { color: var(--muted); font: 600 .64rem/1.2 system-ui, sans-serif; }
      .font-pick[data-font-available="false"] { border-style: dashed; opacity: .72; }
      .font-pick[data-font-available="false"] small::after { content: " · 代替表示"; color: var(--caution); }
      .font-pick[data-font-pick="system-sans"] { font-family: Inter, "Noto Sans JP", system-ui, sans-serif; }
      .font-pick[data-font-pick="gothic"] { font-family: "BIZ UDPGothic", "Yu Gothic", "Hiragino Kaku Gothic ProN", sans-serif; }
      .font-pick[data-font-pick="rounded"] { font-family: "M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", ui-rounded, sans-serif; }
      .font-pick[data-font-pick="mincho"] { font-family: "Noto Serif JP", "Yu Mincho", "Hiragino Mincho ProN", serif; }
      .font-pick[data-font-pick="serif"] { font-family: Georgia, "Noto Serif JP", "Yu Mincho", serif; }
      .font-pick[data-font-pick="monospace"] { font-family: "BIZ UDGothic", "SFMono-Regular", Consolas, monospace; }
      .font-pick[data-font-pick="display"] { font-family: "Arial Black", "Hiragino Kaku Gothic StdN", "Yu Gothic", sans-serif; font-weight: 850; }
      .font-pick[data-font-pick="textbook"] { font-family: "UD Digi Kyokasho N-R", "YuKyokasho", "Hiragino Mincho ProN", serif; }
      .font-pick[data-font-pick="handwritten"] { font-family: Klee, "Hannotate SC", "YuKyokasho", cursive; }
      .font-pick[data-font-pick="condensed"] { font-family: "Avenir Next Condensed", "Arial Narrow", "Hiragino Kaku Gothic ProN", sans-serif; font-stretch: condensed; }
      .cover-picker { display: grid; grid-template-columns: repeat(auto-fit, minmax(5.6rem, 1fr)); gap: .45rem; }
      .cover-pick { display: grid; gap: .35rem; min-height: 4.4rem; padding: .45rem; border: 1px solid var(--line); background: var(--accent-soft); color: var(--accent-strong); font-size: .68rem; }
      .cover-pick[aria-pressed="true"] { border-color: var(--accent-strong); background: var(--accent-strong); color: white; }
      .cover-wire { position: relative; display: block; width: 100%; aspect-ratio: 16 / 9; border: 1px solid var(--line-strong); border-radius: .2rem; background: var(--accent-soft); }
      .cover-wire::before, .cover-wire::after { content: ""; position: absolute; border-radius: 99px; background: var(--accent-strong); }
      .cover-wire::before { left: 18%; top: 38%; width: 64%; height: 12%; }
      .cover-wire::after { left: 30%; top: 58%; width: 40%; height: 6%; background: var(--accent-strong); }
      .cover-pick[data-cover-pick="split"] .cover-wire { background: linear-gradient(90deg, var(--accent-soft) 50%, var(--accent-soft) 50%); }
      .cover-pick[data-cover-pick="split"] .cover-wire::before { left: 8%; width: 36%; }
      .cover-pick[data-cover-pick="split"] .cover-wire::after { left: 57%; top: 30%; width: 30%; height: 36%; border-radius: .2rem; }
      .cover-pick[data-cover-pick="poster"] .cover-wire::before { left: 7%; top: 22%; width: 75%; height: 22%; }
      .cover-pick[data-cover-pick="poster"] .cover-wire::after { left: 7%; top: 52%; width: 52%; }
      .cover-pick[data-cover-pick="minimal"] .cover-wire::before { left: 36%; top: 44%; width: 28%; height: 7%; }
      .cover-pick[data-cover-pick="minimal"] .cover-wire::after { left: 42%; top: 57%; width: 16%; height: 4%; }
      .cover-pick[data-cover-pick="statement"] .cover-wire::before { left: 9%; top: 30%; width: 82%; height: 25%; background: var(--accent-strong); }
      .cover-pick[data-cover-pick="statement"] .cover-wire::after { display: none; }
      .cover-pick[data-cover-pick="band"] .cover-wire::before { left: 0; top: 35%; width: 100%; height: 30%; border-radius: 0; background: var(--accent-soft); }
      .cover-pick[data-cover-pick="band"] .cover-wire::after { left: 28%; top: 48%; width: 44%; height: 6%; }
      .cover-pick[data-cover-pick="corner"] .cover-wire::before { left: 10%; top: 52%; width: 58%; height: 13%; }
      .cover-pick[data-cover-pick="corner"] .cover-wire::after { left: 7%; top: 48%; width: 2%; height: 27%; border-radius: 0; background: var(--accent-strong); }
      .cover-pick[data-cover-pick="frame"] .cover-wire { border: 3px double var(--accent-strong); }
      .cover-pick[data-cover-pick="frame"] .cover-wire::before { left: 23%; top: 39%; width: 54%; height: 10%; }
      .cover-pick[data-cover-pick="frame"] .cover-wire::after { left: 36%; top: 57%; width: 28%; }
      .narration-picker { display: grid; grid-template-columns: repeat(auto-fit, minmax(5.8rem, 1fr)); gap: .45rem; }
      .narration-display-pick { display: grid; gap: .35rem; min-height: 4.4rem; padding: .45rem; border: 1px solid var(--line); background: var(--accent-soft); color: var(--accent-strong); font-size: .68rem; }
      .narration-display-pick[aria-pressed="true"] { border-color: var(--accent-strong); background: var(--accent-strong); color: white; }
      .narration-wire { position: relative; display: block; width: 100%; aspect-ratio: 16 / 9; overflow: hidden; border: 1px solid var(--line-strong); border-radius: .2rem; background: var(--accent-soft); }
      .narration-wire::before, .narration-wire::after { content: ""; position: absolute; }
      .narration-wire::before { left: 5%; right: 5%; bottom: 6%; height: 31%; border: 1px solid var(--accent-strong); border-radius: .18rem; background: var(--accent-soft); }
      .narration-wire::after { left: 12%; right: 14%; bottom: 17%; height: 4%; border-radius: 99px; background: var(--accent-strong); box-shadow: 0 .42rem var(--line-strong); }
      .narration-display-pick[data-narration-display-pick="commentary"] .narration-wire::before { height: 20%; border-radius: 0; }
      .narration-display-pick[data-narration-display-pick="commentary"] .narration-wire::after { bottom: 13%; box-shadow: none; }
      .narration-display-pick[data-narration-display-pick="inline"] .narration-wire::before { height: 38%; border-color: var(--accent-strong); background: var(--accent-strong); }
      .narration-display-pick[data-narration-display-pick="inline"] .narration-wire::after { bottom: 24%; background: var(--accent-soft); box-shadow: 0 .38rem var(--line-strong), 0 .76rem var(--line-strong); }
      .narration-display-pick[data-narration-display-pick="subtitle"] .narration-wire::before { left: 14%; right: 14%; bottom: 8%; height: 13%; border: 0; background: var(--sunken); }
      .narration-display-pick[data-narration-display-pick="subtitle"] .narration-wire::after { bottom: 13%; box-shadow: none; }
      .narration-display-pick[data-narration-display-pick="minimal"] .narration-wire::before { left: 25%; right: 25%; bottom: 9%; height: 14%; border: 0; border-radius: 99px; background: var(--sunken); }
      .narration-palette { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .4rem; }
      .narration-color-pick { display: grid; grid-template-columns: 1.4rem minmax(0, 1fr); gap: .45rem; min-height: 2.5rem; padding: .45rem; border: 1px solid var(--line); background: var(--accent-soft); color: var(--accent-strong); font-size: .72rem; text-align: left; }
      .narration-color-swatch { width: 1.4rem; height: 1.4rem; border: 1px solid var(--palette-border); border-radius: .35rem; background: var(--palette-background); box-shadow: inset 0 -.35rem var(--palette-accent); }
      .narration-display-pick[data-narration-display-pick="minimal"] .narration-wire::after { left: 34%; right: 34%; bottom: 14%; box-shadow: none; }
      .region-picker { display: grid; grid-template-columns: repeat(auto-fit, minmax(5.4rem, 1fr)); gap: .45rem; }
      .region-pick { display: grid; gap: .35rem; min-height: 4.2rem; padding: .45rem; border: 1px solid var(--line); background: var(--accent-soft); color: var(--accent-strong); font-size: .66rem; }
      .region-pick[aria-pressed="true"] { border-color: var(--accent-strong); background: var(--accent-strong); color: white; }
      .region-wire { display: block; width: 100%; aspect-ratio: 16 / 9; border: 1px solid var(--line-strong); border-radius: .2rem; background: var(--accent-soft); }
      .region-pick[data-region-pick="sidebar-right"] .region-wire { background: linear-gradient(90deg, var(--accent-soft) 0 70%, var(--accent-strong) 70%); }
      .region-pick[data-region-pick="sidebar-left"] .region-wire { background: linear-gradient(90deg, var(--accent-strong) 0 30%, var(--accent-soft) 30%); }
      .region-pick[data-region-pick="lower-third"] .region-wire { background: linear-gradient(var(--accent-soft) 0 68%, var(--accent-strong) 68%); }
      .region-pick[data-region-pick="split"] .region-wire { background: linear-gradient(90deg, var(--accent-soft) 0 49%, var(--accent-strong) 49% 51%, var(--accent-soft) 51%); }
      .region-pick[data-region-pick="top-band"] .region-wire { background: linear-gradient(var(--accent-strong) 0 28%, var(--accent-soft) 28%); }
      .region-pick[data-region-pick="focus"] .region-wire { background: radial-gradient(ellipse at center, var(--accent-strong) 0 36%, var(--accent-soft) 37%); }
      .animation-picker { display: grid; grid-template-columns: repeat(auto-fit, minmax(5.8rem, 1fr)); gap: .4rem; }
      .animation-pick { display: grid; grid-template-columns: 1.4rem minmax(0, 1fr); gap: .35rem; align-items: center; min-height: 2.6rem; padding: .4rem .5rem; border: 1px solid var(--line); background: var(--accent-soft); color: var(--accent-strong); font-size: .68rem; text-align: left; }
      .animation-pick[aria-pressed="true"] { border-color: var(--accent-strong); background: var(--accent-strong); color: white; }
      .animation-symbol { display: grid; place-items: center; width: 1.35rem; height: 1.35rem; border-radius: .35rem; background: var(--accent-soft); color: var(--accent-strong); font-size: .8rem; font-weight: 900; }
      .animation-replay { justify-self: start; min-height: 2.25rem; padding: .4rem .65rem; font-size: .75rem; }
      .tone-picker { display: grid; grid-template-columns: repeat(auto-fit, minmax(5.8rem, 1fr)); gap: .4rem; }
      .tone-pick { display: grid; grid-template-columns: 1.5rem minmax(0, 1fr); gap: .4rem; align-items: center; min-height: 2.6rem; padding: .4rem .5rem; border: 1px solid var(--line); background: var(--accent-soft); color: var(--accent-strong); font-size: .68rem; text-align: left; }
      .tone-pick[aria-pressed="true"] { border-color: var(--accent-strong); background: var(--accent-strong); color: white; }
      .tone-swatch { width: 1.45rem; height: 1.45rem; border: 1px solid var(--ink); border-radius: .35rem; background: var(--tone-color); box-shadow: inset 0 -.38rem var(--tone-accent); }
      .tone-pick[data-tone-pick="dark"] { --tone-color: var(--accent-soft); --tone-accent: var(--accent-strong); }
      .tone-pick[data-tone-pick="light"] { --tone-color: var(--caution); --tone-accent: var(--accent-strong); }
      .tone-pick[data-tone-pick="signal"] { --tone-color: var(--accent-soft); --tone-accent: var(--caution); }
      .tone-pick[data-tone-pick="quiet"] { --tone-color: var(--accent-strong); --tone-accent: var(--line-strong); }
      .loading-style-picker { display: grid; grid-template-columns: repeat(auto-fit, minmax(6rem, 1fr)); gap: .45rem; }
      .loading-style-pick { display: grid; gap: .35rem; min-height: 4.6rem; padding: .45rem; border: 1px solid var(--line); background: var(--accent-soft); color: var(--accent-strong); font-size: .68rem; }
      .loading-style-pick[aria-pressed="true"] { border-color: var(--accent-strong); background: var(--accent-strong); color: white; }
      .loading-wire { position: relative; display: block; width: 100%; aspect-ratio: 16 / 9; overflow: hidden; border: 1px solid var(--accent-strong); border-radius: .2rem; background: var(--accent-soft); }
      .loading-wire::before, .loading-wire::after { content: ""; position: absolute; }
      .loading-wire::before { left: 25%; right: 25%; top: 42%; height: 10%; border-radius: 99px; background: var(--accent-strong); }
      .loading-wire::after { left: 20%; right: 20%; bottom: 18%; height: 4%; border-radius: 99px; background: var(--accent-strong); }
      .loading-style-pick[data-loading-style-pick="pulse"] .loading-wire::before { left: 36%; right: auto; top: 24%; width: 28%; height: auto; aspect-ratio: 1; background: radial-gradient(circle, var(--accent-strong), transparent 68%); }
      .loading-style-pick[data-loading-style-pick="orbit"] .loading-wire::before { left: 31%; right: auto; top: 17%; width: 38%; height: auto; aspect-ratio: 1; border: 2px solid var(--accent-strong); background: transparent; }
      .loading-style-pick[data-loading-style-pick="research-log"] .loading-wire { background: repeating-linear-gradient(90deg, var(--caution) 0 1px, var(--caution) 1px 18%); }
      .loading-style-pick[data-loading-style-pick="research-log"] .loading-wire::before { left: 8%; right: 24%; top: 28%; background: var(--accent-soft); }
      .actions { display: flex; align-items: center; flex-wrap: wrap; gap: .7rem; }
      .danger-zone { max-width: 44rem; margin-top: 2rem; border: 1px solid var(--failure); border-radius: .8rem; background: var(--failure-surface); }
      .danger-zone > summary { padding: .85rem 1rem; color: var(--failure); cursor: pointer; font-weight: 800; }
      .danger-zone > p, .danger-zone > form { margin: 0; padding: 0 1rem 1rem; }
      .danger-zone form, .danger-zone label { display: grid; gap: .5rem; }
      .danger-zone form { gap: .85rem; }
      .danger-zone input { box-sizing: border-box; width: 100%; padding: .7rem; border: 1px solid var(--failure); border-radius: .5rem; background: var(--failure-surface); color: var(--ink); font: inherit; }
      .danger-zone button.danger { border-color: var(--failure); background: var(--failure); color: white; }
      button:disabled { cursor: not-allowed; opacity: .55; }
      button[aria-busy="true"] { cursor: wait; }
      .character-count { justify-self: end; margin-top: -.2rem; color: var(--muted); font-size: .7rem; font-variant-numeric: tabular-nums; }
      .character-count[data-near-limit="true"] { color: var(--caution); font-weight: 750; }
      .character-count[data-over-limit="true"] { color: var(--failure); font-weight: 800; }
      .content-structure { display: flex; align-items: center; flex-wrap: wrap; gap: .35rem; padding: .55rem; border: 1px solid var(--line); border-radius: .6rem; background: var(--accent-soft); }
      .content-structure span { padding: .25rem .42rem; border-radius: 999px; background: var(--accent-soft); color: var(--accent-strong); font-size: .7rem; font-variant-numeric: tabular-nums; }
      .content-structure button { min-height: 2rem; margin-left: auto; padding: .3rem .5rem; font-size: .72rem; }
      .publish-state { display: grid; gap: .8rem; }
      .preflight-list { display: grid; gap: .45rem; margin: 0; padding: 0; list-style: none; }
      .preflight-item { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: .65rem; align-items: start; padding: .65rem .7rem; border: 1px solid var(--line); border-radius: .65rem; background: var(--accent-soft); color: var(--accent-strong); font-size: .82rem; line-height: 1.55; }
      .preflight-item::before { content: "✓"; display: grid; place-items: center; width: 1.35rem; height: 1.35rem; border-radius: 50%; background: var(--sunken); color: var(--ink); font-weight: 900; }
      .preflight-item[data-state="attention"]::before { content: "!"; background: var(--caution-surface); color: var(--caution); }
      .preflight-item[data-state="recommendation"]::before { content: "i"; background: var(--accent-soft); color: var(--accent-strong); }
      .preflight-item strong, .preflight-item small { display: block; }
      .preflight-item small { margin-top: .12rem; color: var(--muted); }
      .preflight-action { align-self: center; padding: .25rem .45rem; border-radius: .4rem; color: var(--accent-strong); font-weight: 750; text-decoration: none; white-space: nowrap; }
      .preflight-action:hover { background: var(--surface-accent); }
      .status-row { display: flex; justify-content: space-between; gap: 1rem; padding: .65rem 0; border-top: 1px solid var(--line); }
      .status-row:first-of-type { border-top: 0; }
      .status-row span { color: var(--muted); }
      .publication-history { display: grid; gap: .35rem; margin-top: .65rem; }
      .publication-history .status-row { align-items: center; padding: .55rem .65rem; border: 1px solid var(--line); border-radius: .55rem; }
      .publication-history .status-row span, .publication-history .status-row small { display: grid; gap: .12rem; }
      .publication-history .actions { display: flex; align-items: center; gap: .4rem; }
      .revision-preview { width: 100%; aspect-ratio: var(--revision-aspect, 16 / 9); border: 1px solid var(--accent-strong); border-radius: .8rem; background: var(--accent-soft); }
      .revision-slide-list { display: grid; gap: .45rem; margin: 0; padding: 0; list-style: none; }
      .revision-slide-list li { display: grid; grid-template-columns: 2.5rem minmax(0, 1fr) auto; gap: .6rem; padding: .65rem; border: 1px solid var(--line); border-radius: .6rem; color: var(--accent-strong); }
      .success { color: var(--muted) !important; }
      .warning { color: var(--caution) !important; }
      .upload-actions { display: flex; align-items: center; flex-wrap: wrap; gap: .75rem; }
      .feedback { min-height: 1.4em; margin: 0; color: var(--accent-strong); font-size: .88rem; }
      .draft-recovery { display: flex; align-items: center; justify-content: space-between; gap: .7rem; margin: 0; padding: .65rem .75rem; border: 1px solid var(--caution); border-radius: .65rem; background: var(--caution-surface); color: var(--caution); font-size: .78rem; line-height: 1.5; }
      .draft-recovery.conflict { display: grid; background: var(--failure-surface); border-color: var(--failure); }
      .draft-recovery p { margin: 0; }
      .draft-recovery-actions { display: flex; flex-wrap: wrap; gap: .45rem; }
      .draft-recovery button { min-height: 2rem; padding: .35rem .55rem; white-space: nowrap; font-size: .72rem; }
      .notice { max-width: 42rem; margin: 3rem auto; text-align: center; }
      .workspace-head { display: grid; gap: .75rem; margin-bottom: 1rem; }
      .workspace-head > div:first-child { min-width: 0; }
      .workspace-head h1 { max-width: min(100%, 32ch); font-size: clamp(1.65rem, 3vw, 2.8rem); line-height: 1.12; overflow-wrap: anywhere; word-break: auto-phrase; text-wrap: balance; }
      .workspace-version { display: flex; align-items: center; justify-content: flex-start; flex-wrap: wrap; gap: .55rem; color: var(--muted); }
      .workspace-guide { margin-bottom: 1rem; border: 1px solid var(--accent-strong); border-radius: .8rem; background: var(--accent-soft); }
      .workspace-guide > summary { padding: .75rem 1rem; cursor: pointer; color: var(--accent-strong); font-weight: 820; }
      .workspace-guide-body { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .65rem; padding: 0 1rem 1rem; counter-reset: guide; }
      .workspace-guide-body p { margin: 0; padding: .65rem; border: 1px solid var(--accent-strong); border-radius: .65rem; color: var(--accent-strong); font-size: .78rem; line-height: 1.6; }
      .workspace-guide-body strong { display: block; margin-bottom: .2rem; color: white; }
      .slide-actions { display: flex; flex-wrap: wrap; gap: .4rem; align-items: center; }
      .slide-actions button { min-height: 2.2rem; padding: .45rem .62rem; }
      .slide-actions .danger { border-color: var(--failure); color: var(--failure); }
      .actions .danger { border-color: var(--failure); color: var(--failure); }
      [data-appearance-editor]:not(:has(select[name="role"] option[value="cover"]:checked)) label:has(select[name="cover_layout"]), [data-appearance-editor]:not(:has(select[name="role"] option[value="cover"]:checked)) [aria-label="表紙レイアウトを選ぶ"] { display: none; }
      .save-state { padding: .28rem .55rem; border: 1px solid var(--line); border-radius: 999px; background: transparent; color: var(--muted); font-size: .75rem; font-weight: 760; white-space: nowrap; }
      .save-state[data-state="dirty"] { border-color: var(--caution); background: var(--caution-surface); color: var(--caution); }
      .save-state[data-state="saving"] { border-color: var(--accent-strong); background: var(--accent-soft); color: var(--accent-strong); }
      .slide-workspace { display: grid; grid-template-columns: minmax(10rem, 15rem) minmax(0, 1fr); gap: 1rem; align-items: start; }
      .review-workspace { display: grid; grid-template-columns: minmax(11rem, 14rem) minmax(28rem, 1fr) minmax(19rem, 25rem); gap: 1rem; align-items: start; }
      .review-filmstrip, .review-comments { position: sticky; top: .75rem; display: grid; gap: .65rem; max-height: calc(100dvh - 1.5rem); overflow: auto; scrollbar-gutter: stable; }
      .review-filmstrip-list { display: grid; gap: .65rem; }
      .review-filmstrip .filmstrip-link { grid-template-columns: 2rem minmax(0, 1fr) auto; }
      .review-count { display: inline-grid; place-items: center; min-width: 1.6rem; height: 1.6rem; padding: 0 .35rem; border-radius: 999px; background: var(--accent-strong); color: var(--accent-strong); font-size: .68rem; font-weight: 850; }
      .review-count[data-empty="true"] { background: var(--sunken); color: var(--muted); }
      .review-center { display: grid; min-width: 0; gap: 1rem; }
      .review-preview { padding: .8rem; }
      .review-source-list { display: grid; gap: .7rem; }
      .review-source { position: relative; display: grid; grid-template-columns: minmax(7.5rem, 10rem) minmax(0, 1fr); gap: .8rem; padding: .85rem; border: 1px solid var(--line); border-radius: .75rem; background: var(--accent-soft); }
      .review-source[data-kind="narration"] { border-color: var(--line); border-left: .22rem solid var(--line-strong); background: var(--sunken); }
      .review-source[data-selected="true"] { border-color: var(--accent-strong); box-shadow: 0 0 0 .12rem color-mix(in srgb, var(--accent) 35%, transparent); }
      .review-source-meta { display: grid; align-content: start; gap: .35rem; }
      .review-source-meta strong { font-size: .78rem; line-height: 1.4; }
      .review-kind { width: fit-content; padding: .2rem .4rem; border-radius: .35rem; background: var(--sunken); color: var(--muted); font-size: .64rem; font-weight: 850; }
      .review-source[data-kind="narration"] .review-kind { background: transparent; box-shadow: inset 0 0 0 1px var(--line-strong); color: var(--muted); }
      .review-source-text { min-width: 0; margin: 0; padding: .2rem 0; color: var(--accent-strong); font: inherit; font-size: .88rem; line-height: 1.75; overflow-wrap: anywhere; white-space: pre-wrap; user-select: text; }
      .review-source-text mark { padding: .08rem .12rem; border-radius: .2rem; background: var(--caution); color: var(--caution); }
      .review-source-text::highlight(review-selection) { background: var(--accent-strong); color: var(--ink); text-decoration: underline; text-decoration-color: var(--accent-strong); text-decoration-thickness: .12em; }
      .review-select-hint { margin: 0; color: var(--muted); font-size: .76rem; line-height: 1.6; }
      .review-selection-toolbar { position: fixed; z-index: 80; left: 50%; top: 0; display: flex; align-items: center; padding: .28rem; border: 1px solid var(--accent-strong); border-radius: .65rem; background: var(--accent-soft); box-shadow: 0 .7rem 2rem color-mix(in srgb, var(--shadow-color) 56%, transparent); backdrop-filter: blur(12px); transform: translate(-50%, calc(-100% - .65rem)); }
      .review-selection-toolbar[hidden] { display: none; }
      .review-selection-toolbar[data-placement="below"] { transform: translate(-50%, .65rem); }
      .review-selection-toolbar button { display: inline-flex; align-items: center; gap: .42rem; min-height: 2.35rem; padding: .48rem .7rem; border: 0; background: transparent; color: var(--accent-strong); white-space: nowrap; }
      .review-selection-toolbar button:hover { background: var(--surface-accent); }
      .review-selection-toolbar button:disabled { color: var(--failure); }
      .review-selection-icon { display: grid; place-items: center; width: 1.35rem; height: 1.35rem; border-radius: .4rem; background: var(--accent-strong); color: white; font-size: .9rem; font-weight: 900; }
      .review-composer { display: grid; gap: .65rem; padding: 1rem; border: 1px solid var(--accent-strong); border-radius: .85rem; background: var(--accent-soft); }
      .review-composer[data-active="true"] { border-color: var(--accent-strong); }
      .review-selection { min-height: 3rem; margin: 0; padding: .65rem; border-radius: .55rem; background: var(--accent-soft); color: var(--accent-strong); font-size: .78rem; line-height: 1.55; overflow-wrap: anywhere; }
      .review-composer label { display: grid; gap: .35rem; }
      .review-composer textarea, .review-script textarea { width: 100%; box-sizing: border-box; padding: .65rem; border: 1px solid var(--accent-strong); border-radius: .55rem; background: var(--accent-soft); color: var(--ink); resize: vertical; }
      .review-composer textarea { min-height: 7rem; font: inherit; line-height: 1.55; }
      .review-card { display: grid; gap: .55rem; padding: .8rem; border: 1px solid var(--line); border-radius: .75rem; background: var(--accent-soft); }
      .review-card[data-status="resolved"] { opacity: .68; }
      .review-card-head { display: flex; align-items: start; justify-content: space-between; gap: .5rem; }
      .review-card-head label { display: flex; align-items: start; gap: .45rem; min-width: 0; font-size: .76rem; font-weight: 760; }
      .review-card-head input { width: auto; margin-top: .18rem; }
      .review-card p { margin: 0; color: var(--accent-strong); font-size: .84rem; line-height: 1.65; overflow-wrap: anywhere; }
      .review-quote { padding-left: .65rem; border-left: .15rem solid var(--caution); color: var(--caution) !important; }
      .anchor-state { flex: 0 0 auto; padding: .18rem .38rem; border-radius: 999px; background: var(--sunken); color: var(--muted); font-size: .62rem; font-weight: 850; }
      .anchor-state[data-state="moved"] { background: var(--caution-surface); color: var(--caution); }
      .anchor-state[data-state="stale"] { background: var(--failure-surface); color: var(--failure); }
      .review-card-actions { display: flex; flex-wrap: wrap; gap: .4rem; }
      .review-card-actions button { min-height: 2.1rem; padding: .35rem .55rem; font-size: .7rem; }
      [data-review-comment-list] { display: grid; gap: .55rem; }
      .review-script { display: grid; gap: .65rem; padding-top: .8rem; border-top: 1px solid var(--line); }
      .review-script textarea { min-height: 14rem; font: .74rem/1.6 ui-monospace, monospace; }
      .review-empty { margin: 0; padding: .85rem; border: 1px dashed var(--accent-strong); border-radius: .7rem; color: var(--muted); font-size: .8rem; line-height: 1.65; }
      .mobile-workspace-tabs { display: none; }
      .mobile-workspace-tabs[hidden], .inspector-tabs[hidden] { display: none; }
      body[data-preview-focus="true"] .slide-workspace { grid-template-columns: minmax(0, 1fr); }
      body[data-preview-focus="true"] .filmstrip, body[data-preview-focus="true"] .inspector { display: none; }
      body[data-preview-focus="true"] .workspace-preview { width: min(100%, 96rem); margin: 0 auto; }
      .filmstrip { display: grid; gap: .65rem; align-content: start; max-height: calc(100vh - 10rem); overflow: auto; }
      .inspector { display: grid; grid-column: 1 / -1; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: .8rem; align-content: start; align-items: start; }
      .inspector > .slide-creator, .inspector > .inspector-tabs, .inspector > #inspector-quality { grid-column: 1 / -1; }
      .inspector > #inspector-content, .inspector > #inspector-design { grid-column: span 6; }
      .inspector > #inspector-narration, .inspector > #inspector-structure { grid-column: 1 / -1; }
      .filmstrip-search { position: sticky; z-index: 2; top: 0; display: grid; gap: .3rem; padding-bottom: .35rem; background: linear-gradient(var(--bg) 80%, transparent); color: var(--muted); font-size: .72rem; font-weight: 700; }
      .filmstrip-search-head { display: flex; align-items: center; justify-content: space-between; gap: .5rem; }
      .filmstrip-search output { color: var(--accent-strong); font-variant-numeric: tabular-nums; }
      .filmstrip-search input { min-height: 2.35rem; padding: .5rem .65rem; font-size: .8rem; }
      .filmstrip-empty { margin: .4rem; color: var(--muted); font-size: .8rem; }
      .filmstrip-link { display: grid; grid-template-columns: 2rem minmax(0, 1fr); gap: .55rem; padding: .7rem; border: 1px solid var(--line); border-radius: .65rem; color: var(--accent-strong); text-decoration: none; }
      .filmstrip-link span { color: var(--muted); font: 700 .76rem/1.3 ui-monospace, monospace; }
      .filmstrip-link strong { overflow-wrap: anywhere; font-size: .86rem; line-height: 1.35; }
      .filmstrip-link .filmstrip-meta { display: block; margin-top: .3rem; color: var(--muted); font-size: .68rem; font-weight: 550; line-height: 1.45; }
      .filmstrip-link[data-active="true"] { border-color: var(--accent-strong); background: var(--accent-strong); color: white; }
      .workspace-preview { min-width: 0; padding: .8rem; }
      .workspace-frame { position: relative; width: 100%; aspect-ratio: var(--workspace-aspect, 16 / 9); overflow: hidden; border: 1px solid var(--accent-strong); border-radius: .65rem; background: var(--accent-soft); box-shadow: 0 1.5rem 4rem color-mix(in srgb, var(--shadow-color) 38%, transparent); }
      .workspace-frame iframe { position: relative; z-index: 1; display: block; width: 100%; height: 100%; border: 0; }
      .frame-loading { position: absolute; z-index: 2; inset: 0; display: grid; place-items: center; background: var(--accent-soft); color: var(--muted); font-size: .85rem; letter-spacing: .03em; }
      .frame-loading[hidden] { display: none; }
      .step-control { display: flex; align-items: center; justify-content: center; gap: .7rem; margin-top: .8rem; }
      .step-control button { min-height: 2.2rem; padding: .45rem .75rem; }
      .step-control output { min-width: 6rem; color: var(--muted); text-align: center; font: 700 .8rem/1 ui-monospace, monospace; }
      .component-outline { display: grid; gap: .45rem; margin: 0; padding: 0; list-style: none; }
      .component-outline li { overflow: hidden; border: 1px solid var(--line); border-radius: .55rem; color: var(--accent-strong); font-size: .8rem; }
      .component-outline-item { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: stretch; }
      .component-tree-toggle, .component-tree-spacer { align-self: center; width: 1.55rem; height: 1.55rem; margin-left: calc(.25rem + var(--component-indent, 0rem)); }
      .component-tree-toggle { min-height: 0; padding: 0; border: 0; border-radius: .4rem; background: transparent; color: var(--muted); font-size: .75rem; }
      .component-tree-toggle:hover { background: var(--accent-strong); color: var(--ink); }
      .component-outline-row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: .55rem; align-items: center; padding: .55rem .55rem .55rem calc(.55rem + var(--component-indent, 0rem)); }
      a.component-outline-row { color: inherit; text-decoration: none; }
      a.component-outline-row:hover, a.component-outline-row[aria-current="true"] { background: var(--accent-strong); color: white; }
      .component-outline .component-outline { gap: .35rem; margin: 0 .45rem .45rem .85rem; padding-left: .65rem; border-left: 1px solid var(--accent-strong); }
      .component-outline .component-outline li { background: var(--accent-soft); }
      .component-outline code { color: var(--accent-strong); }
      .component-outline small { display: block; color: var(--muted); overflow-wrap: anywhere; }
      .component-search { display: grid; gap: .35rem; margin-bottom: .65rem; color: var(--muted); font-size: .78rem; }
      .component-search-row { display: flex; gap: .55rem; align-items: center; }
      .component-search-row input { min-width: 0; flex: 1; }
      .component-search-actions { display: flex; flex-wrap: wrap; gap: .35rem; margin: -.25rem 0 .65rem; }
      .component-search-actions button { min-height: 1.9rem; padding: .3rem .55rem; font-size: .7rem; }
      .component-search-actions output { align-self: center; color: var(--muted); font-size: .7rem; }
      .component-current-path { display: flex; flex-wrap: wrap; gap: .35rem; align-items: center; margin: 0 0 .65rem; color: var(--muted); font-size: .72rem; }
      .component-current-path code { color: var(--ink); }
      .component-search-row output { min-width: 6.5rem; text-align: end; white-space: nowrap; }
      .segment-outline { display: flex; gap: .4rem; overflow-x: auto; padding: .15rem 0 .5rem; scrollbar-width: thin; }
      .segment-outline a { display: inline-flex; align-items: center; flex: 0 0 auto; min-height: 2.75rem; padding: .45rem .65rem; border: 1px solid var(--line); border-radius: .5rem; color: var(--muted); text-decoration: none; font: 700 .75rem/1 ui-monospace, monospace; }
      .segment-outline a:hover, .segment-outline a[aria-current="true"] { border-color: var(--accent-strong); background: var(--accent-strong); color: white; }
      .voice-pager { display: flex; align-items: center; justify-content: center; gap: .65rem; margin-top: 1rem; }
      .voice-pager span { color: var(--muted); font-size: .82rem; }
      .component-step { padding: .2rem .38rem; border-radius: 999px; background: var(--accent-strong); color: var(--accent-strong); font: 750 .68rem/1 ui-monospace, monospace; white-space: nowrap; }
      .narration-head { display: flex; align-items: center; justify-content: space-between; gap: .75rem; }
      .narration-head .stage { font-size: .68rem; }
      .narration-outline { display: grid; gap: .55rem; margin: 0; padding: 0; list-style: none; }
      .narration-outline li { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: .65rem; padding: .7rem; border: 1px solid var(--line); border-radius: .6rem; background: var(--accent-soft); }
      .narration-outline .component-step { align-self: start; margin-top: .18rem; }
      .narration-outline p { margin: 0; color: var(--accent-strong); font-size: .83rem; line-height: 1.65; }
      .narration-outline textarea { width: 100%; min-height: 5.5rem; padding: .65rem; border: 1px solid var(--accent-strong); border-radius: .5rem; background: var(--accent-soft); color: var(--ink); font: inherit; line-height: 1.65; resize: vertical; }
      .mode-note { margin: 0; padding: .75rem; border-left: 3px solid var(--accent); background: var(--accent-soft); color: var(--accent-strong); font-size: .84rem; line-height: 1.6; }
      .setting-summary { display: flex; flex-wrap: wrap; gap: .45rem; margin: 0 0 1rem; }
      .setting-chip { display: inline-flex; gap: .35rem; align-items: center; padding: .38rem .58rem; border: 1px solid var(--accent-strong); border-radius: 999px; background: var(--accent-soft); color: var(--accent-strong); font-size: .75rem; }
      .setting-chip small { color: var(--muted); }
      .setting-chip[data-state="warning"] { border-color: var(--caution); background: var(--caution-surface); color: var(--caution); }
      .inspector-section { overflow: hidden; border: 1px solid var(--line); border-radius: 1rem; background: var(--panel); }
      .inspector-section > summary { display: flex; align-items: center; justify-content: space-between; gap: .7rem; padding: 1rem 1.15rem; cursor: pointer; font-weight: 820; }
      .inspector-section > summary::marker { color: var(--accent); }
      .inspector-section[open] > summary { border-bottom: 1px solid var(--line); }
      .inspector-body { display: grid; gap: .9rem; padding: 1rem; }
      .editor fieldset { display: grid; gap: .7rem; min-width: 0; margin: 0; padding: .8rem; border: 1px solid var(--line); border-radius: .7rem; }
      .editor legend { padding: 0 .35rem; color: var(--accent-strong); font-size: .82rem; font-weight: 800; }
      .component-items { display: grid; gap: .7rem; }
      .editor .component-item { border-color: var(--accent-strong); background: var(--accent-soft); }
      .component-item legend { color: var(--accent-strong); }
      .component-item legend code { margin-left: .35rem; color: var(--muted); font-size: .68rem; font-weight: 600; }
      [data-component-frame-controls][data-enabled="false"] .editor-grid { opacity: .48; }
      .editor input[type="color"] { min-height: 2.7rem; padding: .3rem; }
      .ratio-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .75rem; }
      .ratio-option { display: grid; grid-template-columns: auto 1fr; align-items: center; gap: .65rem; padding: .8rem; border: 1px solid var(--line); border-radius: .75rem; background: var(--accent-soft); cursor: pointer; }
      .ratio-option:has(input:checked) { border-color: var(--accent-strong); box-shadow: 0 0 0 1px var(--accent-strong); }
      .ratio-preview { display: block; width: 3.3rem; border: 1px solid var(--line-strong); background: var(--accent-soft); }
      .ratio-preview.wide { aspect-ratio: 16 / 9; }
      .ratio-preview.standard { width: 2.8rem; aspect-ratio: 4 / 3; }
      .editor input[type="checkbox"] { width: auto; accent-color: var(--accent); }
      .check-label { display: flex !important; grid-template-columns: auto 1fr; align-items: center; }
      .setting-table { display: grid; grid-template-columns: minmax(6rem, auto) minmax(0, 1fr); gap: .35rem .75rem; margin: 0; font-size: .78rem; }
      .setting-table dt { color: var(--muted); overflow-wrap: anywhere; }
      .setting-table dd { margin: 0; color: var(--accent-strong); overflow-wrap: anywhere; }
      .component-detail { border-top: 1px solid var(--line); }
      .component-detail > summary { padding: .55rem; cursor: pointer; color: var(--accent-strong); }
      .component-detail .setting-table { padding: 0 .65rem .7rem; }
      .voice-segment { display: grid; gap: .75rem; padding: .8rem; border: 1px solid var(--line); border-radius: .75rem; background: var(--accent-soft); }
      .voice-segment:target { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 30%, transparent); }
      .voice-segment-head { display: flex; flex-wrap: wrap; justify-content: space-between; gap: .65rem; align-items: center; }
      .voice-cue-list { display: grid; gap: .65rem; }
      .voice-cue { display: grid; gap: .65rem; padding: .75rem; border: 1px solid var(--accent-strong); border-radius: .7rem; background: var(--accent-soft); }
      .voice-cue-head { display: flex; align-items: center; justify-content: space-between; gap: .6rem; }
      .voice-cue-head strong { color: var(--accent-strong); font-size: .78rem; }
      .voice-cue-head button { min-height: 1.9rem; padding: .3rem .5rem; font-size: .7rem; }
      .voice-cue-preset { display: flex; flex-wrap: wrap; gap: .35rem; }
      .voice-cue-preset button { min-height: 2rem; padding: .35rem .55rem; font-size: .7rem; }
      .voice-composed { margin: 0; padding: .65rem .75rem; border-left: 3px solid var(--accent); background: var(--accent-soft); color: var(--accent-strong); font-size: .82rem; line-height: 1.7; white-space: pre-wrap; overflow-wrap: anywhere; }
      .voice-pause-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .55rem; }
      .voice-howto { border: 1px solid var(--accent-strong); border-radius: .75rem; background: var(--accent-soft); }
      .voice-howto > summary { padding: .75rem; cursor: pointer; color: var(--accent-strong); font-weight: 800; }
      .voice-howto-body { display: grid; gap: .55rem; padding: 0 .75rem .75rem; color: var(--accent-strong); font-size: .8rem; line-height: 1.65; }
      .voice-howto-body :is(p,ol) { margin: 0; }
      .voice-timing { color: var(--muted); font-size: .72rem; font-variant-numeric: tabular-nums; }
      .voice-timing[data-state="warning"] { color: var(--caution); font-weight: 750; }
      .audio-state { color: var(--caution); font-size: .75rem; }
      .audio-state.ready { color: var(--muted); }
      .tuning-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .55rem; }
      .tuning-grid label { font-size: .78rem; }
      .inherit-note { color: var(--muted); font-size: .74rem; line-height: 1.55; }
      .quality-status { display: flex; align-items: center; gap: .6rem; margin: 0; padding: .75rem; border: 1px solid var(--accent-strong); border-radius: .7rem; background: var(--accent-soft); color: var(--accent-strong); font-size: .84rem; line-height: 1.55; }
      .quality-status[data-level="warning"] { border-color: var(--caution); background: var(--caution-surface); color: var(--caution); }
      .quality-list { display: grid; gap: .45rem; margin: 0; padding-left: 1.2rem; color: var(--accent-strong); font-size: .8rem; line-height: 1.55; }
      .quality-list [data-layout-warning] { padding-right: .25rem; }
      .quality-list [data-diagnostic-fix] { min-height: 1.9rem; margin-left: .5rem; padding: .25rem .5rem; font-size: .72rem; }
      .swatches { display: flex; gap: .35rem; }
      .swatch { width: 1.2rem; height: 1.2rem; border: 1px solid var(--ink); border-radius: .3rem; background: var(--swatch); }
      [data-dirty="true"] button[type="submit"]::after { content: " · 未保存"; }
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
      .voice-preset { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: .85rem; align-items: center; padding: .9rem; border: 1px solid var(--accent-strong); border-radius: .8rem; background: linear-gradient(135deg, var(--accent-soft), var(--accent-soft)); }
      .voice-character { display: grid; place-items: center; width: 3.2rem; height: 3.2rem; border: 2px solid var(--line-strong); border-radius: 48% 52% 45% 55%; background: var(--line-strong); color: var(--panel); font-size: 1.4rem; box-shadow: inset 0 0 0 .35rem var(--achieved-surface); }
      .voice-preset strong, .voice-preset small { display: block; }
      .voice-preset label { display: grid; gap: .35rem; min-width: 0; }
      .voice-preset-fields { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: .65rem; min-width: 0; }
      .voice-preset select { width: 100%; padding: .65rem; border: 1px solid var(--accent-strong); border-radius: .55rem; background: var(--accent-soft); color: var(--ink); font: inherit; }
      .voice-preset small { margin-top: .25rem; color: var(--muted); line-height: 1.5; }
      .voice-preset .stage { justify-self: end; }
      .voice-quick { display: flex; flex-wrap: wrap; gap: .45rem; }
      .voice-quick button { min-height: 2.2rem; padding: .45rem .7rem; font-size: .78rem; }
      .voice-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(6.5rem, 1fr)); gap: .55rem; }
      .voice-stat { padding: .75rem; border: 1px solid var(--line); border-radius: .7rem; background: var(--accent-soft); }
      .voice-stat span, .voice-stat strong { display: block; }
      .voice-stat span { color: var(--muted); font-size: .72rem; }
      .voice-stat strong { margin-top: .25rem; font-size: 1.35rem; }
      .voice-stat.ready strong { color: var(--ink); }
      .voice-stat.pending strong { color: var(--caution); }
      .job-card { display: grid; gap: .7rem; padding: .9rem; border: 1px solid var(--accent-strong); border-radius: .8rem; background: var(--accent-soft); }
      .job-card[data-state="completed"] { border-color: var(--line-strong); }
      .job-card[data-state="failed"], .job-card[data-state="partially_failed"] { border-color: var(--failure); }
      .job-head { display: flex; justify-content: space-between; gap: .8rem; align-items: center; }
      .job-progress { width: 100%; height: .65rem; accent-color: var(--accent); }
      .job-numbers { display: flex; flex-wrap: wrap; gap: .75rem; color: var(--muted); font-size: .78rem; }
      .voice-segment-list { display: grid; gap: .55rem; }
      .voice-filter { position: sticky; z-index: 12; top: .5rem; display: grid; gap: .45rem; margin-inline: -.55rem; padding: .55rem; border: 1px solid var(--accent-soft); border-radius: .8rem; background: var(--accent-soft); box-shadow: 0 .45rem 1rem color-mix(in srgb, var(--shadow-color) 40%, transparent); backdrop-filter: blur(14px); }
      .voice-search-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: .45rem; }
      .voice-filter-tabs { display: flex; flex-wrap: wrap; gap: .45rem; min-width: 0; }
      .voice-filter :is(button,.button) { min-height: 2.75rem; padding: .45rem .7rem; font-size: .78rem; }
      .voice-filter :is(button,.button)[aria-current="page"] { border-color: var(--accent-strong); background: var(--accent-strong); color: white; }
      .voice-result-count { margin-left: auto; color: var(--muted); font-size: .75rem; font-variant-numeric: tabular-nums; }
      .voice-search { width: 100%; min-height: 2.55rem; padding: .55rem .7rem; border: 1px solid var(--line); border-radius: .6rem; background: var(--accent-soft); color: var(--ink); font: inherit; }
      .voice-review { overflow: hidden; border: 1px solid var(--line); border-radius: .75rem; background: var(--accent-soft); }
      .voice-review > summary { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: .7rem; align-items: center; padding: .8rem; cursor: pointer; }
      .voice-review > summary::marker { color: var(--accent); }
      .voice-review-title { min-width: 0; }
      .voice-review-title strong, .voice-review-title small { display: block; overflow-wrap: anywhere; }
      .voice-review-title small { margin-top: .2rem; color: var(--muted); }
      .voice-review-body { display: grid; gap: .75rem; padding: 0 .8rem .8rem; }
      .voice-review-body p { margin: 0; color: var(--accent-strong); line-height: 1.7; white-space: pre-wrap; overflow-wrap: anywhere; }
      .voice-audio-timeline { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: .65rem; align-items: center; }
      .voice-audio-timeline input { width: 100%; accent-color: var(--accent); }
      .voice-audio-timeline output { min-width: 7.5rem; color: var(--muted); font-size: .75rem; font-variant-numeric: tabular-nums; text-align: right; }
      .voice-status { display: inline-flex; padding: .28rem .5rem; border-radius: 999px; background: var(--accent-soft); color: var(--accent-strong); font-size: .7rem; font-weight: 800; white-space: nowrap; }
      .voice-status.ready, .voice-status.completed { background: var(--sunken); color: var(--muted); }
      .voice-status.needs_generation { background: var(--caution-surface); color: var(--caution); }
      .voice-status.queued, .voice-status.running, .voice-status.generating { background: var(--accent-soft); color: var(--accent-strong); }
      .voice-status.failed, .voice-status.partially_failed { background: var(--failure-surface); color: var(--failure); }
      .voice-play[aria-pressed="true"] { border-color: var(--accent); background: var(--accent-soft); }
      .voice-next { display: grid; gap: .7rem; position: sticky; top: 1rem; }
      .voice-next ol { margin: 0; padding-left: 1.3rem; color: var(--accent-strong); font-size: .85rem; line-height: 1.7; }
      .voice-next li + li { margin-top: .35rem; }
      form { margin: 0; }
      @media (min-width: 72.01rem) { .slide-workspace { gap: .8rem; } .filmstrip { max-height: calc(100dvh - 7rem); scrollbar-gutter: stable; } .workspace-frame { max-height: calc(100dvh - 15rem); margin-inline: auto; } }
      @media (max-width: 72rem) { .workspace-guide-body { grid-template-columns: repeat(2, minmax(0, 1fr)); } .review-workspace { grid-template-columns: minmax(0, 1fr) minmax(18rem, 21rem); } .review-filmstrip { position: static; grid-column: 1 / -1; max-height: none; overflow: visible; scrollbar-gutter: auto; } .review-filmstrip-list { grid-auto-flow: column; grid-auto-columns: minmax(12rem, 14rem); padding-bottom: .4rem; overflow-x: auto; overscroll-behavior-inline: contain; scroll-snap-type: x proximity; scrollbar-width: thin; } .review-filmstrip-list .filmstrip-link { scroll-snap-align: start; } .review-comments { grid-column: 2; } }
      @media (max-width: 60rem) { .inspector { grid-template-columns: 1fr; } .inspector > .slide-creator, .inspector > .inspector-tabs, .inspector > #inspector-content, .inspector > #inspector-design, .inspector > #inspector-narration, .inspector > #inspector-structure, .inspector > #inspector-quality { grid-column: 1; } }
      @media (max-width: 60rem) { .review-workspace { grid-template-columns: 1fr; } .review-comments { position: static; grid-column: auto; max-height: none; } }
      @media (max-width: 48rem) { .review-filmstrip { position: static; max-height: none; } .review-source { grid-template-columns: 1fr; } }
      @media (max-width: 48rem) { .hero, .editor-grid, .slide-workspace, .tuning-grid, .voice-flow, .voice-hero, .journey-next, .setup-steps, .voice-preset-fields, .workspace-guide-body, .voice-pause-grid, .product-grid, .role-table, .guide-client-tabs { grid-template-columns: 1fr; } .role-table > article + article { border-top: 1px solid var(--line); border-left: 0; } .landing-cta { align-items: stretch; flex-direction: column; } .landing-nav a:not(.button) { display: none; } .dashboard-tools { align-items: stretch; flex-direction: column; } .dashboard-filter { justify-content: flex-start; } .editor label.wide { grid-column: auto; } .mobile-workspace-tabs { position: sticky; z-index: 20; top: 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: .35rem; margin: 0 0 .65rem; padding: .45rem; border: 1px solid var(--line); border-radius: .75rem; background: var(--accent-soft); backdrop-filter: blur(12px); } .mobile-workspace-tabs button { min-height: 2.75rem; padding: .45rem; font-size: .78rem; } .mobile-workspace-tabs button[aria-selected="true"] { border-color: var(--accent-strong); background: var(--accent-strong); color: white; } .tab-badge { display: inline-flex; margin-left: .25rem; padding: .1rem .3rem; border-radius: 999px; background: var(--caution); color: var(--caution); font-size: .62rem; } .tab-badge[hidden] { display: none; } body[data-mobile-pane="preview"] .slide-workspace > :not(.workspace-preview), body[data-mobile-pane="edit"] .slide-workspace > :not(.inspector), body[data-mobile-pane="slides"] .slide-workspace > :not(.filmstrip) { display: none; } .filmstrip { display: flex; max-height: none; overflow-x: auto; } body[data-mobile-pane="slides"] .filmstrip { display: grid; overflow: visible; } body[data-mobile-pane="slides"] .filmstrip-link { min-width: 0; } .filmstrip-link { min-width: 12rem; } .inspector { grid-column: auto; } .component-outline-row { grid-template-columns: minmax(0, 1fr) auto; } .component-outline-row code { grid-column: 1 / -1; min-width: 0; overflow-wrap: anywhere; } .component-outline-row > span { min-width: 0; overflow-wrap: anywhere; } .component-outline .component-outline { margin-inline: .25rem; padding-left: .4rem; } .voice-stats, .journey-steps { grid-template-columns: repeat(2, minmax(0, 1fr)); } .voice-next { position: static; } .troubleshooting, .troubleshooting tbody, .troubleshooting tr, .troubleshooting th, .troubleshooting td { display: block; width: 100%; } .troubleshooting th { padding-bottom: .25rem; border-bottom: 0; } .troubleshooting td { padding-top: .25rem; } }
      @media (max-width: 48rem) { .inspector-tabs { position: sticky; z-index: 18; top: .25rem; display: flex; gap: .3rem; margin-bottom: .55rem; padding: .35rem; overflow-x: auto; border: 1px solid var(--line); border-radius: .7rem; background: var(--accent-soft); scrollbar-width: thin; } .inspector-tabs button { flex: 0 0 auto; min-height: 2.75rem; padding: .45rem .65rem; font-size: .74rem; } .inspector-tabs button[aria-selected="true"] { border-color: var(--accent-strong); background: var(--accent-strong); color: white; } }
      @media (max-width: 48rem) { .decision-branches, .decision-branches-three { grid-template-columns: 1fr; } .decision-flow { padding: .7rem; } .decision-result, .decision-next { min-height: 0; } .plan-comparison { overflow: visible; border: 0; } .plan-table, .plan-table tbody, .plan-table tr, .plan-table th, .plan-table td { display: block; width: 100%; min-width: 0; } .plan-table thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; } .plan-table { display: grid; gap: .7rem; background: transparent; } .plan-table tr { overflow: hidden; border: 1px solid var(--line); border-radius: .8rem; background: var(--accent-soft); } .plan-table tbody th { width: 100%; background: var(--accent-soft); } .plan-table td::before { content: attr(data-label); display: block; margin-bottom: .3rem; color: var(--accent-strong); font-size: .68rem; font-weight: 850; } }
      @media (max-width: 38rem) { .site-header, .account { align-items: flex-start; } .site-header { flex-direction: column; } .section-head { align-items: flex-start; flex-direction: column; } .step-control { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); gap: .45rem; } .step-control button { width: 100%; min-height: 2.75rem; padding-inline: .45rem; } .step-control output { min-width: 5.5rem; } .step-control [data-grid-snap] { grid-column: 1 / -1; } .voice-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } .voice-stat { min-width: 0; padding: .6rem; } .voice-stat strong { overflow-wrap: anywhere; font-size: 1.05rem; } .voice-search-row { grid-template-columns: 1fr; } .voice-filter-tabs { flex-wrap: nowrap; margin-inline: -.55rem; padding-inline: .55rem; overflow-x: auto; overscroll-behavior-inline: contain; scrollbar-width: thin; } .voice-filter-tabs .button { flex: 0 0 auto; } .voice-result-count { margin-left: 0; } .voice-review > summary { grid-template-columns: auto minmax(0, 1fr); } .voice-review > summary .voice-status { grid-column: 2; justify-self: start; } .voice-audio-timeline { grid-template-columns: 1fr; } .voice-audio-timeline output { text-align: left; } }
      @media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; } }
`;

function shell(title: string, body: string): string {
  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="/assets/dashboard.css?v=${DASHBOARD_ASSET_VERSION}">
  </head>
  <body><a class="skip-link" href="#main-content">本文へ移動</a>${body}</body>
</html>`;
}

export function dashboardStyleResponse(versioned = false): Response {
  return new Response(
    `${DESIGN_TOKEN_STYLE}\n${DASHBOARD_STYLE}\n${DASHBOARD_DESIGN_STYLE}`,
    {
      headers: {
        "cache-control": versioned
          ? "public, max-age=31536000, immutable"
          : "no-cache, must-revalidate",
        "content-type": "text/css; charset=utf-8",
        "x-content-type-options": "nosniff"
      }
    }
  );
}

function formatDate(iso: string): string {
  const [date] = iso.split("T");
  return date?.replaceAll("-", "/") ?? iso;
}

function accountHeader(twitchLogin: string, csrfToken: string): string {
  return `<header class="site-header">
    <a class="brand" href="/dashboard">最自由研究</a>
    <div class="account"><span><strong>${escapeHtml(twitchLogin)}</strong> でログイン中</span>
      <button class="theme-toggle" type="button" data-dashboard-theme-toggle aria-pressed="false"><span class="theme-toggle-icon" data-dashboard-theme-icon aria-hidden="true">☾</span><span data-dashboard-theme-label>ダーク</span></button>
      <form method="post" action="/logout"><input type="hidden" name="csrf_token" value="${escapeHtml(csrfToken)}"><button type="submit" data-op="move">ログアウト</button></form>
    </div>
  </header>`;
}

function slideCompositionLabel(
  slide: NonNullable<ProjectRecord["document"]["deck"]>["slides"][number]
): string {
  if (slide.composition?.mode === "canvas") {
    return `自由配置 ${slide.composition.blocks.length}パーツ`;
  }
  if (slide.composition?.mode === "scene") {
    return `リッチ構成 ${slide.composition.nodes.length}パーツ`;
  }
  return "定型レイアウト";
}

function slideCreator(options: {
  action: string;
  version: number;
  csrfToken: string;
  slideCount: number;
  defaultPosition: number;
}): string {
  const positions = Array.from({ length: options.slideCount + 1 }, (_, index) => {
    const label = index === 0 ? "先頭" : index === options.slideCount ? "末尾" : `${index}枚目の後`;
    return `<option value="${index}"${index === options.defaultPosition ? " selected" : ""}>${label}</option>`;
  }).join("");
  return `<details class="component-detail slide-creator"><summary>スライドを追加</summary><form class="editor" data-slide-create data-versioned-form data-method="POST" action="${options.action}" data-version="${options.version}" data-csrf="${escapeHtml(options.csrfToken)}"><label>タイトル<input name="title" maxlength="120" required placeholder="この一枚で伝えること"></label><div class="editor-grid"><label>雛形<select name="slide_template"><option value="flow">本文スライド</option><option value="cover">表紙</option><option value="canvas">自由配置</option><option value="scene">リッチ構成</option></select></label><label>挿入位置<select name="position">${positions}</select></label></div><p class="inherit-note">最低限の内容で追加し、次の画面で本文・読み上げ・見た目・表示パーツを調整します。</p><div class="actions"><button type="submit">追加して編集する</button><span class="version" data-version-label>v${options.version}</span></div><p class="feedback" data-form-feedback aria-live="polite"></p></form></details>`;
}

type SceneTextField = {
  name: string;
  label: string;
  value: string | number | null;
  maxLength: number;
  multiline?: boolean;
  required?: boolean;
  nullable?: boolean;
  number?: { min: number; max: number; step?: number };
};

function sceneTextFields(node: SlideSceneNode): SceneTextField[] {
  switch (node.kind) {
    case "hero":
      return [
        { name: "eyebrow", label: "小見出し", value: node.eyebrow, maxLength: 120, nullable: true },
        { name: "heading", label: "見出し", value: node.heading, maxLength: 500, required: true },
        { name: "subtitle", label: "補足文", value: node.subtitle, maxLength: 2_000, multiline: true, nullable: true }
      ];
    case "markdown":
      return [{ name: "markdown", label: "本文", value: node.markdown, maxLength: 20_000, multiline: true, required: true }];
    case "image":
      return [
        { name: "alt_text", label: "画像の説明", value: node.alt_text, maxLength: 500 },
        { name: "caption", label: "キャプション", value: node.caption, maxLength: 500, nullable: true }
      ];
    case "shape":
      return [{ name: "label", label: "ラベル", value: node.label, maxLength: 500, nullable: true }];
    case "card":
      return [
        { name: "label", label: "ラベル", value: node.label, maxLength: 120, nullable: true },
        { name: "markdown", label: "本文", value: node.markdown, maxLength: 10_000, multiline: true, required: true }
      ];
    case "metric":
      return [
        { name: "value", label: "値", value: node.value, maxLength: 80, required: true },
        { name: "unit", label: "単位", value: node.unit, maxLength: 40, nullable: true },
        { name: "caption", label: "説明", value: node.caption, maxLength: 500 }
      ];
    case "quote":
      return [
        { name: "quote", label: "引用文", value: node.quote, maxLength: 4_000, multiline: true, required: true },
        { name: "attribution", label: "出典・話者", value: node.attribution, maxLength: 500, nullable: true }
      ];
    case "callout":
      return [
        { name: "label", label: "ラベル", value: node.label, maxLength: 120, nullable: true },
        { name: "heading", label: "見出し", value: node.heading, maxLength: 500, required: true },
        { name: "markdown", label: "本文", value: node.markdown, maxLength: 4_000, multiline: true, nullable: true }
      ];
    case "bar_chart":
      return [
        {
          name: "max_value",
          label: "グラフの最大値",
          value: node.max_value,
          maxLength: 20,
          required: true,
          number: { min: 0.000001, max: 1_000_000_000, step: 0.01 }
        },
        ...node.items.flatMap((item, index) => [
          { name: `items.${index}.label`, label: `項目${index + 1} · ラベル`, value: item.label, maxLength: 120, required: true },
          { name: `items.${index}.value`, label: `項目${index + 1} · 値`, value: item.value, maxLength: 20, required: true, number: { min: 0, max: 1_000_000_000, step: 0.01 } }
        ])
      ];
    case "timeline":
      return node.items.flatMap((item, index) => [
        { name: `items.${index}.kicker`, label: `項目${index + 1} · 時期`, value: item.kicker, maxLength: 120, nullable: true },
        { name: `items.${index}.heading`, label: `項目${index + 1} · 見出し`, value: item.heading, maxLength: 500, required: true },
        { name: `items.${index}.detail`, label: `項目${index + 1} · 詳細`, value: item.detail, maxLength: 2_000, multiline: true, nullable: true }
      ]);
    default:
      return [];
  }
}

function sceneTextFieldControl(field: SceneTextField): string {
  const attributes = `name="${field.name}" data-component-field data-component-path="${field.name}" data-component-number="${String(field.number !== undefined)}" data-nullable="${String(field.nullable === true)}" maxlength="${field.maxLength}"${field.required ? " required" : ""}`;
  return field.multiline
    ? `<label>${field.label}<textarea ${attributes}>${escapeHtml(String(field.value ?? ""))}</textarea></label>`
    : `<label>${field.label}<input ${attributes}${field.number === undefined ? "" : ` type="number" min="${field.number.min}" max="${field.number.max}" step="${field.number.step ?? 1}"`} value="${escapeHtml(String(field.value ?? ""))}"></label>`;
}

function sceneComponentContentControls(node: SlideSceneNode, maxStep: number): string {
  if (node.kind === "bar_chart") {
    const maxValue = sceneTextFieldControl({
      name: "max_value",
      label: "グラフの最大値",
      value: node.max_value,
      maxLength: 20,
      required: true,
      number: { min: 0.000001, max: 1_000_000_000, step: 0.01 }
    });
    const items = node.items.map((item, index) => `<fieldset class="component-item" data-component-item="${escapeHtml(item.id)}"><legend>項目 ${index + 1} <code>${escapeHtml(item.id)}</code></legend><div class="editor-grid">${sceneTextFieldControl({ name: `items.${index}.label`, label: "ラベル", value: item.label, maxLength: 120, required: true })}${sceneTextFieldControl({ name: `items.${index}.value`, label: "値", value: item.value, maxLength: 20, required: true, number: { min: 0, max: 1_000_000_000, step: 0.01 } })}<label>表示STEP<input name="items.${index}.at" data-component-field data-component-path="items.${index}.at" data-component-number="true" data-nullable="false" type="number" min="0" max="${maxStep}" value="${item.at}"></label><label>色<span class="color-control"><input type="color" value="${escapeHtml(item.color ?? "#9d7bff")}" data-component-color-preview="items.${index}.color" aria-label="項目${index + 1}の色を見本から選ぶ"><input name="items.${index}.color" data-component-field data-component-color-hex data-component-path="items.${index}.color" data-component-number="false" data-nullable="true" value="${escapeHtml(item.color ?? "")}" placeholder="空欄でアクセント色" pattern="^$|^#[0-9A-Fa-f]{6}$" maxlength="7" spellcheck="false"></span></label></div><div class="actions"><button type="button" data-scene-item-action="move" data-item-id="${escapeHtml(item.id)}" data-op="edit" data-position="${index - 1}"${index === 0 ? " disabled" : ""}>↑ 前へ</button><button type="button" data-scene-item-action="move" data-item-id="${escapeHtml(item.id)}" data-op="edit" data-position="${index + 1}"${index === node.items.length - 1 ? " disabled" : ""}>↓ 後へ</button><button class="danger" type="button" data-scene-item-action="delete" data-item-id="${escapeHtml(item.id)}"${node.items.length <= 1 ? " disabled" : ""}>この項目を削除</button></div></fieldset>`).join("");
    return `<fieldset><legend>グラフ全体</legend><div class="editor-grid">${maxValue}</div></fieldset><div class="component-items">${items}</div><div class="actions"><button type="button" data-scene-item-action="add"${node.items.length >= 12 ? " disabled" : ""}>グラフ項目を追加</button></div>`;
  }
  if (node.kind === "timeline") {
    const items = node.items.map((item, index) => `<fieldset class="component-item" data-component-item="${escapeHtml(item.id)}"><legend>項目 ${index + 1} <code>${escapeHtml(item.id)}</code></legend><div class="editor-grid">${sceneTextFieldControl({ name: `items.${index}.kicker`, label: "時期", value: item.kicker, maxLength: 120, nullable: true })}${sceneTextFieldControl({ name: `items.${index}.heading`, label: "見出し", value: item.heading, maxLength: 500, required: true })}${sceneTextFieldControl({ name: `items.${index}.detail`, label: "詳細", value: item.detail, maxLength: 2_000, multiline: true, nullable: true })}<label>表示STEP<input name="items.${index}.at" data-component-field data-component-path="items.${index}.at" data-component-number="true" data-nullable="false" type="number" min="0" max="${maxStep}" value="${item.at}"></label></div><div class="actions"><button type="button" data-scene-item-action="move" data-item-id="${escapeHtml(item.id)}" data-op="edit" data-position="${index - 1}"${index === 0 ? " disabled" : ""}>↑ 前へ</button><button type="button" data-scene-item-action="move" data-item-id="${escapeHtml(item.id)}" data-op="edit" data-position="${index + 1}"${index === node.items.length - 1 ? " disabled" : ""}>↓ 後へ</button><button class="danger" type="button" data-scene-item-action="delete" data-item-id="${escapeHtml(item.id)}"${node.items.length <= 1 ? " disabled" : ""}>この項目を削除</button></div></fieldset>`).join("");
    return `<div class="component-items">${items}</div><div class="actions"><button type="button" data-scene-item-action="add"${node.items.length >= 12 ? " disabled" : ""}>時系列項目を追加</button></div>`;
  }
  const controls = sceneTextFields(node).map(sceneTextFieldControl).join("");
  return controls ? `<fieldset><legend>内容</legend><div class="editor-grid">${controls}</div></fieldset>` : "";
}

type SceneHierarchyIndex = {
  containerNodes: SlideSceneNode[];
  childrenByParentId: Map<string, SlideSceneNode[]>;
  siblingsByParentId: Map<string | null, SlideSceneNode[]>;
};

function createSceneHierarchyIndex(nodes: SlideSceneNode[]): SceneHierarchyIndex {
  const childrenByParentId = new Map<string, SlideSceneNode[]>();
  const siblingsByParentId = new Map<string | null, SlideSceneNode[]>();
  for (const node of nodes) {
    const siblings = siblingsByParentId.get(node.parent_id) ?? [];
    siblings.push(node);
    siblingsByParentId.set(node.parent_id, siblings);
    if (node.parent_id !== null) {
      const children = childrenByParentId.get(node.parent_id) ?? [];
      children.push(node);
      childrenByParentId.set(node.parent_id, children);
    }
  }
  for (const siblings of siblingsByParentId.values()) {
    siblings.sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  }
  return {
    containerNodes: nodes.filter((node) => ["layer", "stack", "grid"].includes(node.kind)),
    childrenByParentId,
    siblingsByParentId
  };
}

function sceneDescendantIds(nodeId: string, index: SceneHierarchyIndex): Set<string> {
  const descendants = new Set<string>();
  const pending = [...(index.childrenByParentId.get(nodeId) ?? [])];
  while (pending.length > 0) {
    const child = pending.pop();
    if (child === undefined || descendants.has(child.id)) continue;
    descendants.add(child.id);
    pending.push(...(index.childrenByParentId.get(child.id) ?? []));
  }
  return descendants;
}

function sceneComponentHierarchyControls(node: SlideSceneNode, nodes: SlideSceneNode[], index: SceneHierarchyIndex): string {
  const descendants = sceneDescendantIds(node.id, index);
  const nodesById = new Map(nodes.map((candidate) => [candidate.id, candidate]));
  const pathTo = (target: SlideSceneNode): string[] => {
    const result = [target.id];
    const visited = new Set(result);
    let parentId = target.parent_id;
    while (parentId !== null && !visited.has(parentId)) {
      result.unshift(parentId);
      visited.add(parentId);
      parentId = nodesById.get(parentId)?.parent_id ?? null;
    }
    return result;
  };
  const parents = index.containerNodes
    .filter((candidate) => candidate.id !== node.id && !descendants.has(candidate.id))
    .map((candidate) => `<option value="${escapeHtml(candidate.id)}" data-parent-kind="${candidate.kind}" data-parent-path="${escapeHtml(pathTo(candidate).join(" › "))}"${candidate.id === node.parent_id ? " selected" : ""}>${escapeHtml(candidate.id)} · ${candidate.kind}</option>`)
    .join("");
  const siblings = index.siblingsByParentId.get(node.parent_id) ?? [];
  const siblingIndex = siblings.findIndex((candidate) => candidate.id === node.id);
  const currentPath = `<p class="component-current-path"><span>現在地</span><code data-component-current-path data-component-id="${escapeHtml(node.id)}" aria-live="polite">${pathTo(node).map(escapeHtml).join(" › ")}</code></p>`;
  const moveNote = descendants.size > 0 ? ` このまとまりの子孫${descendants.size}件も一緒に移動します。` : "";
  return `<fieldset><legend>階層と並び順</legend>${currentPath}<div class="editor-grid"><label>追加先<select name="parent_id" data-component-parent-select data-component-field data-component-path="parent_id" data-component-number="false" data-nullable="true"><option value="" data-parent-kind="root" data-parent-path=""${node.parent_id === null ? " selected" : ""}>スライド直下</option>${parents}</select></label><label>並び位置<input name="order" data-component-field data-component-path="order" data-component-number="true" data-nullable="false" type="number" min="0" max="${Math.max(0, nodes.length - 1)}" value="${node.order}"></label></div><div class="actions"><button type="button" data-component-order="${siblingIndex - 1}"${siblingIndex <= 0 ? " disabled" : ""}>↑ 前へ</button><button type="button" data-component-order="${siblingIndex + 1}"${siblingIndex === -1 || siblingIndex >= siblings.length - 1 ? " disabled" : ""}>↓ 後へ</button></div><p class="inherit-note">0が先頭です。追加先を変えると、その領域の指定位置へ移動します。${moveNote}自分自身や子孫は追加先に選べません。</p></fieldset>`;
}

function sceneComponentAppearanceControls(node: SlideSceneNode, maxStep: number): string {
  const style = node.style ?? {};
  const frame = node.frame ?? { x: 5, y: 5, width: 90, height: 90 };
  const numberField = (
    path: string,
    label: string,
    value: number,
    min: number,
    max: number,
    step = 1
  ) => `<label>${label}<input name="${path}" data-component-field data-component-path="${path}" data-component-number="true" data-nullable="false" type="number" min="${min}" max="${max}" step="${step}" value="${value}"></label>`;
  const selectField = (
    path: string,
    label: string,
    value: string,
    options: Array<[string, string]>
  ) => `<label>${label}<select name="${path}" data-component-field data-component-path="${path}" data-component-number="false" data-nullable="false">${options.map(([option, optionLabel]) => `<option value="${option}"${option === value ? " selected" : ""}>${optionLabel}</option>`).join("")}</select></label>`;
  const optionalNumberField = (
    path: string,
    label: string,
    value: number | undefined,
    inherited: number,
    min: number,
    max: number,
    step = 1
  ) => `<label>${label}<input name="${path}" data-component-field data-component-style-field data-component-path="${path}" data-component-number="true" data-component-optional="true" type="number" min="${min}" max="${max}" step="${step}" value="${value ?? ""}" placeholder="継承 ${inherited}"></label>`;
  const optionalSelectField = (
    path: string,
    label: string,
    value: string | undefined,
    inheritedLabel: string,
    options: Array<[string, string]>
  ) => `<label>${label}<select name="${path}" data-component-field data-component-style-field data-component-path="${path}" data-component-number="false" data-component-optional="true"><option value=""${value === undefined ? " selected" : ""}>継承（${inheritedLabel}）</option>${options.map(([option, optionLabel]) => `<option value="${option}"${option === value ? " selected" : ""}>${optionLabel}</option>`).join("")}</select></label>`;
  const colorField = (
    path: string,
    label: string,
    value: string | null | undefined,
    fallback: string
  ) => `<label>${label}<span class="color-control"><input type="color" value="${escapeHtml(value ?? fallback)}" data-component-color-preview="${path}" aria-label="${label}を色見本から選ぶ"><input name="${path}" data-component-field data-component-style-field data-component-color-hex data-component-path="${path}" data-component-number="false" data-nullable="true" value="${escapeHtml(value ?? "")}" placeholder="空欄で${label === "背景色" ? "透明" : "継承"}" pattern="^$|^#[0-9A-Fa-f]{6}$" maxlength="7" spellcheck="false"></span></label>`;
  const frameField = (path: string, label: string, value: number, minimum: number) => `<label>${label}（%）<input name="${path}" data-component-field data-component-path="${path}" data-component-number="true" data-nullable="false" data-component-frame-field type="number" min="${minimum}" max="100" step="0.1" value="${value}" required${node.frame ? "" : " disabled"}></label>`;
  return `<fieldset data-component-frame-controls data-enabled="${String(node.frame !== null && node.frame !== undefined)}"><legend>自由配置</legend><label class="check-label"><input name="frame_enabled" type="checkbox" data-component-frame-toggle${node.frame ? " checked" : ""}>親の自動配置から外し、位置と大きさを指定する</label><div class="actions"><button type="button" data-component-frame-preset="5,5,90,90">余白つき全面</button><button type="button" data-component-frame-preset="5,10,43,80">左半分</button><button type="button" data-component-frame-preset="52,10,43,80">右半分</button><button type="button" data-component-frame-preset="5,5,90,42">上半分</button><button type="button" data-component-frame-preset="5,53,90,42">下半分</button><button type="button" data-component-frame-reset>保存時の配置に戻す</button></div><div class="editor-grid">${frameField("frame.x", "左から", frame.x, 0)}${frameField("frame.y", "上から", frame.y, 0)}${frameField("frame.width", "幅", frame.width, 0.1)}${frameField("frame.height", "高さ", frame.height, 0.1)}</div><p class="feedback" data-component-frame-feedback aria-live="polite"></p><p class="inherit-note">位置と大きさの合計が100%以内になるよう指定します。自動配置へ戻しても入力値は画面内に残るため、再度有効にできます。</p></fieldset>
    <fieldset><legend>表示タイミング</legend><div class="editor-grid">${numberField("at", "表示STEP", node.at, 0, maxStep)}${selectField("animation", "表示アニメーション", node.animation, Object.entries(ANIMATION_LABELS))}</div></fieldset>
    <fieldset><legend>パーツの見た目</legend><div class="editor-grid">${colorField("style.background", "背景色", style.background, "#111827")}${colorField("style.foreground", "文字色", style.foreground, "#f8fafc")}${colorField("style.border_color", "境界線色", style.border_color, "#52647c")}${optionalNumberField("style.border_width_px", "境界線の太さ", style.border_width_px, 0, 0, 8)}${optionalNumberField("style.corner_radius_px", "角丸", style.corner_radius_px, 0, 0, 64)}${optionalNumberField("style.padding_px", "内側余白", style.padding_px, 0, 0, 64)}${optionalNumberField("style.font_scale", "文字倍率", style.font_scale, 1, 0.5, 3, 0.05)}${optionalNumberField("style.opacity", "不透明度", style.opacity, 1, 0.1, 1, 0.05)}${optionalSelectField("style.text_align", "文字揃え", style.text_align, "左", [["start", "左"], ["center", "中央"], ["end", "右"]])}${optionalSelectField("style.vertical_align", "縦位置", style.vertical_align, "上", [["start", "上"], ["center", "中央"], ["end", "下"]])}${optionalSelectField("style.shadow", "影", style.shadow, "なし", [["none", "なし"], ["soft", "柔らかい"], ["strong", "強い"]])}</div><div class="actions"><button type="button" data-component-style-reset>見た目をすべて継承へ戻す</button></div><p class="inherit-note">空欄は周囲の設定を継承します。背景色だけは空欄で透明になります。変更は保存前からプレビューへ反映されます。</p></fieldset>`;
}

function sceneComponentKindControls(node: SlideSceneNode, assets: ProjectAsset[]): string {
  const select = (path: string, label: string, value: string, options: Array<[string, string]>) => `<label>${label}<select name="${path}" data-component-field data-component-path="${path}" data-component-number="false" data-nullable="false">${options.map(([option, optionLabel]) => `<option value="${escapeHtml(option)}"${option === value ? " selected" : ""}>${escapeHtml(optionLabel)}</option>`).join("")}</select></label>`;
  const number = (path: string, label: string, value: number, min: number, max: number) => `<label>${label}<input name="${path}" data-component-field data-component-path="${path}" data-component-number="true" data-nullable="false" type="number" min="${min}" max="${max}" value="${value}"></label>`;
  let controls = "";
  if (node.kind === "stack") {
    controls = `${select("direction", "並べる方向", node.direction, [["row", "横"], ["column", "縦"]])}${number("gap_px", "間隔", node.gap_px, 0, 64)}${select("align", "交差方向の揃え", node.align, [["start", "先頭"], ["center", "中央"], ["end", "末尾"], ["stretch", "均等に伸ばす"]])}${select("justify", "進行方向の配置", node.justify, [["start", "先頭"], ["center", "中央"], ["end", "末尾"], ["between", "両端揃え"], ["around", "均等配置"]])}<label class="check-label"><input name="wrap" type="checkbox" data-component-field data-component-path="wrap"${node.wrap ? " checked" : ""}>折り返す</label>`;
  } else if (node.kind === "grid") {
    controls = `${number("columns", "列数", node.columns, 1, 6)}${number("gap_px", "間隔", node.gap_px, 0, 64)}${select("align", "縦方向の揃え", node.align, [["start", "上"], ["center", "中央"], ["end", "下"], ["stretch", "均等に伸ばす"]])}`;
  } else if (node.kind === "hero") {
    controls = select("align", "内容の揃え", node.align, [["start", "左"], ["center", "中央"], ["end", "右"]]);
  } else if (node.kind === "image") {
    const imageOptions: Array<[string, string]> = assets.map((asset) => [asset.asset_id, asset.alt_text || asset.original_filename]);
    if (!imageOptions.some(([id]) => id === node.asset_id)) imageOptions.unshift([node.asset_id, "現在の画像"]);
    controls = `${select("asset_id", "画像", node.asset_id, imageOptions)}${select("fit", "画像の収め方", node.fit, [["contain", "全体を収める"], ["cover", "枠を埋める"], ["fill", "枠に合わせて伸縮"]])}`;
  } else if (node.kind === "shape") {
    controls = select("shape", "形", node.shape, [["rectangle", "四角形"], ["ellipse", "楕円"], ["line", "線"]]);
  } else if (node.kind === "card") {
    controls = select("variant", "カード表現", node.variant, [["plain", "標準"], ["accent", "アクセント"], ["glass", "ガラス調"]]);
  } else if (node.kind === "metric") {
    controls = select("emphasis", "数値の強調", node.emphasis, [["normal", "標準"], ["strong", "強い"], ["signal", "アクセント面"]]);
  } else if (node.kind === "callout") {
    controls = select("variant", "意味", node.variant, [["info", "情報"], ["success", "成功"], ["warning", "注意"], ["danger", "危険"]]);
  }
  return controls ? `<fieldset><legend>パーツ固有の配置</legend><div class="editor-grid">${controls}</div></fieldset>` : "";
}

function sceneComponentCreator(options: {
  nodes: SlideSceneNode[];
  assets: ProjectAsset[];
  action: string;
  version: number;
  csrfToken: string;
}): string {
  const containers = options.nodes.filter((node) => ["layer", "stack", "grid"].includes(node.kind));
  const parentOptions = containers
    .map((node) => `<option value="${escapeHtml(node.id)}">${escapeHtml(node.id)} · ${node.kind}</option>`)
    .join("");
  const imageOptions = options.assets
    .map((asset) => `<option value="${escapeHtml(asset.asset_id)}">${escapeHtml(asset.alt_text || asset.original_filename)}</option>`)
    .join("");
  return `<details class="component-detail"><summary>リッチ表示パーツを追加</summary><form class="editor" data-scene-component-create data-versioned-form data-method="POST" action="${options.action}" data-version="${options.version}" data-csrf="${escapeHtml(options.csrfToken)}"><div class="editor-grid"><label>種類<select name="kind"><optgroup label="配置"><option value="layer">重ねる領域</option><option value="stack">縦横に並べる領域</option><option value="grid">格子状に並べる領域</option></optgroup><optgroup label="文章"><option value="hero">大見出し</option><option value="markdown">Markdown本文</option><option value="quote">引用</option></optgroup><optgroup label="情報"><option value="card">カード</option><option value="metric">数値</option><option value="callout">注目情報</option></optgroup><optgroup label="データ"><option value="bar_chart">棒グラフ</option><option value="timeline">時系列</option></optgroup><optgroup label="素材"><option value="shape">図形</option><option value="image"${options.assets.length === 0 ? " disabled" : ""}>画像${options.assets.length === 0 ? "（画像を先に追加）" : ""}</option></optgroup></select></label><label>追加先<select name="parent_id"><option value="">スライド直下（自由配置）</option>${parentOptions}</select></label><label>画像パーツで使用する画像<select name="asset_id"><option value="">選択してください</option>${imageOptions}</select></label></div><p class="inherit-note">配置領域の中へ追加すると自動配置になります。スライド直下へ追加すると、重なりを避ける初期位置を設定します。</p><div class="actions"><button type="submit">リッチ表示パーツを追加</button><span class="version" data-version-label>v${options.version}</span></div><p class="feedback" data-form-feedback aria-live="polite"></p></form></details>`;
}

function scenePatternCreator(options: {
  nodes: SlideSceneNode[];
  action: string;
  version: number;
  csrfToken: string;
}): string {
  const containers = options.nodes.filter((node) => ["layer", "stack", "grid"].includes(node.kind));
  const parentOptions = containers
    .map((node) => `<option value="${escapeHtml(node.id)}">${escapeHtml(node.id)} · ${node.kind}</option>`)
    .join("");
  const patterns = SCENE_PATTERN_OPTIONS.map(
    (pattern, index) => `<label class="assembly-pattern"><input type="radio" name="pattern" value="${pattern.value}"${index === 0 ? " checked" : ""}><span><strong>${escapeHtml(pattern.label)}</strong><small>${escapeHtml(pattern.description)}</small></span></label>`
  ).join("");
  return `<details class="component-detail assembly-detail" open><summary>まとまりから組み立てる</summary><form class="editor" data-scene-pattern-create data-versioned-form data-method="POST" action="${options.action}" data-version="${options.version}" data-csrf="${escapeHtml(options.csrfToken)}"><fieldset><legend>伝え方を選ぶ</legend><div class="assembly-patterns">${patterns}</div></fieldset><label>追加先<select name="parent_id"><option value="">スライド直下（余白つき全面）</option>${parentOptions}</select></label><p class="inherit-note">見出し・配置領域・内容パーツを編集可能なまとまりとして追加します。追加後は、個々のパーツを移動・削除・書き換えできます。</p><div class="actions"><button type="submit">選んだまとまりを追加</button><span class="version" data-version-label>v${options.version}</span></div><p class="feedback" data-form-feedback aria-live="polite"></p></form></details>`;
}

function sceneComponentOutline(nodes: SlideSceneNode[], selectedId: string | null, slidePath: string): string {
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
  const ordered: Array<{ node: SlideSceneNode; depth: number }> = [];
  const seen = new Set<string>();
  const pending = [...(children.get(null) ?? [])].reverse().map((node) => ({ node, depth: 0 }));
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined || seen.has(current.node.id)) continue;
    seen.add(current.node.id);
    ordered.push(current);
    for (const child of [...(children.get(current.node.id) ?? [])].reverse()) {
      pending.push({ node: child, depth: current.depth + 1 });
    }
  }
  for (const node of nodes) {
    if (!seen.has(node.id)) ordered.push({ node, depth: 0 });
  }
  const hierarchyIndex = createSceneHierarchyIndex(nodes);
  return `<ul class="component-outline" id="component-outline">${ordered.map(({ node, depth }) => {
    const href = `${slidePath}?component=${encodeURIComponent(node.id)}`;
    const placement = node.frame === null || node.frame === undefined ? "自動配置" : "自由配置";
    const descendants = sceneDescendantIds(node.id, hierarchyIndex).size;
    const groupLabel = descendants > 0 ? ` · 子孫 ${descendants}件` : "";
    const indent = `${Math.min(depth, 8) * 0.5}rem`;
    const disclosure = descendants > 0
      ? `<button class="component-tree-toggle" type="button" data-component-tree-toggle="${escapeHtml(node.id)}" aria-expanded="true" aria-label="${escapeHtml(node.id)}の子孫を折りたたむ">▼</button>`
      : '<span class="component-tree-spacer" aria-hidden="true"></span>';
    return `<li data-component-tree-item="${escapeHtml(node.id)}" data-component-depth="${depth}"><div class="component-outline-item" style="--component-indent:${indent}">${disclosure}<a class="component-outline-row" data-component-select="${escapeHtml(node.id)}" data-component-depth="${depth}" data-component-descendant-count="${descendants}" href="${escapeHtml(href)}"${node.id === selectedId ? ' aria-current="true"' : ""}><code>uf-${escapeHtml(node.kind.replaceAll("_", "-"))}</code><span>${escapeHtml(node.id)}<small>階層 ${depth} · ${placement}${groupLabel}</small></span><span class="component-step">STEP ${node.at}</span></a></div></li>`;
  }).join("")}</ul>`;
}

function canvasBlockEditor(options: {
  block: SlideBlock;
  assets: ProjectAsset[];
  action: string;
  version: number;
  csrfToken: string;
  maxStep: number;
}): string {
  const { block } = options;
  const field = (path: string, label: string, value: string | number, attributes = "") => `<label>${label}<input name="${path}" data-component-field data-component-path="${path}" data-component-number="${String(typeof value === "number")}" data-nullable="false" value="${escapeHtml(String(value))}" ${attributes}></label>`;
  const select = (path: string, label: string, value: string, choices: Array<[string, string]>) => `<label>${label}<select name="${path}" data-component-field data-component-path="${path}" data-component-number="false" data-nullable="false">${choices.map(([choice, choiceLabel]) => `<option value="${choice}"${choice === value ? " selected" : ""}>${choiceLabel}</option>`).join("")}</select></label>`;
  const frameField = (path: string, label: string, value: number, min: number) => `<label>${label}（%）<input name="${path}" data-component-field data-component-path="${path}" data-component-number="true" data-nullable="false" data-component-frame-field type="number" min="${min}" max="100" step="0.1" value="${value}" required></label>`;
  const optionalNumber = (path: string, label: string, value: number | undefined, inherited: number, min: number, max: number, step = 1) => `<label>${label}<input name="${path}" data-component-field data-component-style-field data-component-path="${path}" data-component-number="true" data-component-optional="true" type="number" min="${min}" max="${max}" step="${step}" value="${value ?? ""}" placeholder="継承 ${inherited}"></label>`;
  const optionalSelect = (path: string, label: string, value: string | undefined, inherited: string, choices: Array<[string, string]>) => `<label>${label}<select name="${path}" data-component-field data-component-style-field data-component-path="${path}" data-component-number="false" data-component-optional="true"><option value=""${value === undefined ? " selected" : ""}>継承（${inherited}）</option>${choices.map(([choice, choiceLabel]) => `<option value="${choice}"${choice === value ? " selected" : ""}>${choiceLabel}</option>`).join("")}</select></label>`;
  const color = (path: string, label: string, value: string | null | undefined, fallback: string) => `<label>${label}<span class="color-control"><input type="color" value="${escapeHtml(value ?? fallback)}" data-component-color-preview="${path}" aria-label="${label}を色見本から選ぶ"><input name="${path}" data-component-field data-component-style-field data-component-color-hex data-component-path="${path}" data-component-number="false" data-nullable="true" value="${escapeHtml(value ?? "")}" placeholder="空欄で継承" pattern="^$|^#[0-9A-Fa-f]{6}$" maxlength="7" spellcheck="false"></span></label>`;
  let content = "";
  if (block.kind === "markdown") {
    content = `<label>本文<textarea name="markdown" data-component-field data-component-path="markdown" data-component-number="false" data-nullable="false" maxlength="20000" required>${escapeHtml(block.markdown)}</textarea></label>`;
  } else if (block.kind === "image") {
    const imageOptions = options.assets.map((asset) => [asset.asset_id, asset.alt_text || asset.original_filename] as [string, string]);
    if (!imageOptions.some(([id]) => id === block.asset_id)) imageOptions.unshift([block.asset_id, "現在の画像"]);
    content = `${select("asset_id", "画像", block.asset_id, imageOptions)}${field("alt_text", "画像の説明", block.alt_text, 'maxlength="500"')}${select("fit", "画像の収め方", block.fit, [["contain", "全体を収める"], ["cover", "枠を埋める"], ["fill", "枠に合わせて伸縮"]])}`;
  } else {
    content = `${select("shape", "形", block.shape, [["rectangle", "四角形"], ["ellipse", "楕円"], ["line", "線"]])}<label>ラベル<input name="label" data-component-field data-component-path="label" data-component-number="false" data-nullable="true" maxlength="500" value="${escapeHtml(block.label ?? "")}"></label>`;
  }
  const style = block.style ?? {};
  return `<details class="component-detail"><summary>${escapeHtml(block.id)} · ${block.kind} の内容・配置・見た目</summary><form class="editor" data-canvas-block-editor data-block-id="${escapeHtml(block.id)}" data-versioned-form action="${options.action}" data-version="${options.version}" data-component="${escapeHtml(JSON.stringify(block))}" data-csrf="${escapeHtml(options.csrfToken)}"><fieldset><legend>内容</legend><div class="editor-grid">${content}</div></fieldset><fieldset data-component-frame-controls data-enabled="true"><legend>位置と大きさ</legend><input name="frame_enabled" type="checkbox" data-component-frame-toggle checked hidden><div class="actions"><button type="button" data-component-frame-preset="5,5,90,90">余白つき全面</button><button type="button" data-component-frame-preset="5,10,43,80">左半分</button><button type="button" data-component-frame-preset="52,10,43,80">右半分</button><button type="button" data-component-frame-preset="5,5,90,42">上半分</button><button type="button" data-component-frame-preset="5,53,90,42">下半分</button><button type="button" data-component-frame-reset>保存時の配置に戻す</button></div><div class="editor-grid">${frameField("frame.x", "左から", block.frame.x, 0)}${frameField("frame.y", "上から", block.frame.y, 0)}${frameField("frame.width", "幅", block.frame.width, 0.1)}${frameField("frame.height", "高さ", block.frame.height, 0.1)}</div><p class="feedback" data-component-frame-feedback aria-live="polite"></p></fieldset><fieldset><legend>重なりと表示</legend><div class="editor-grid">${field("z_index", "重なり順", block.z_index, 'type="number" min="0" max="100"')}${field("at", "表示STEP", block.at, `type="number" min="0" max="${options.maxStep}"`)}${select("animation", "表示アニメーション", block.animation, Object.entries(ANIMATION_LABELS))}</div></fieldset><fieldset><legend>見た目</legend><div class="editor-grid">${color("style.background", "背景色", style.background, "#111827")}${color("style.foreground", "文字色", style.foreground, "#f8fafc")}${color("style.border_color", "境界線色", style.border_color, "#52647c")}${optionalNumber("style.border_width_px", "境界線の太さ", style.border_width_px, 0, 0, 8)}${optionalNumber("style.corner_radius_px", "角丸", style.corner_radius_px, 0, 0, 64)}${optionalNumber("style.padding_px", "内側余白", style.padding_px, 0, 0, 64)}${optionalNumber("style.font_scale", "文字倍率", style.font_scale, 1, 0.5, 3, 0.05)}${optionalNumber("style.opacity", "不透明度", style.opacity, 1, 0.1, 1, 0.05)}${optionalSelect("style.text_align", "文字揃え", style.text_align, "左", [["start", "左"], ["center", "中央"], ["end", "右"]])}${optionalSelect("style.vertical_align", "縦位置", style.vertical_align, "上", [["start", "上"], ["center", "中央"], ["end", "下"]])}${optionalSelect("style.shadow", "影", style.shadow, "なし", [["none", "なし"], ["soft", "柔らかい"], ["strong", "強い"]])}</div><div class="actions"><button type="button" data-component-style-reset>見た目をすべて継承へ戻す</button></div></fieldset><div class="actions"><button type="submit">この表示パーツを保存</button><button type="button" data-canvas-block-action="duplicate" data-action-url="${options.action}/actions">複製</button><button class="danger" type="button" data-canvas-block-action="delete" data-action-url="${options.action}/actions">削除</button><span class="version" data-version-label>v${options.version}</span></div><p class="feedback" data-form-feedback aria-live="polite"></p></form></details>`;
}

export function landingPage(options: {
  broadcasterLogin: string;
  minFollowDays: number;
}): Response {
  return new Response(
    shell(
      "最自由研究",
      `<header class="site-header"><a class="brand" href="/">最自由研究</a><nav class="landing-nav" aria-label="案内"><a href="#about">できること</a><a href="#roles">使い分け</a><a href="/data">データの扱い</a><a class="button ghost" href="/guide">はじめかた</a></nav></header>
       <main data-surface="disclosure" id="main-content" tabindex="-1"><section class="hero">
         <div class="hero-copy"><p class="eyebrow">Ultimate freestyle research</p>
         <h1>気になったことを、<span class="keep-word">研究にする。</span></h1>
         <p class="lead">最自由研究の発見・記録・発表制作を、AIとの対話とブラウザの実画面で一続きに進める、限定利用者向けの制作・発表ワークスペースです。</p>
         <a class="button primary" href="/login">Twitchでログイン</a>
         <p class="hint">限定公開中です。Twitchで${escapeHtml(options.broadcasterLogin)}を${options.minFollowDays}日以上フォローしている方、または現在サブスク中の方が利用できます。</p></div>
         <ol class="landing-flow" aria-label="利用の流れ"><li><span><strong>AIと研究を作る</strong><small>CodexやClaudeなど、Remote MCP対応AIと問い・実験・構成を対話します。</small></span></li><li><span><strong>Webで一枚ずつ確認</strong><small>文言、組版、画像、VOICEVOX音声、見切れを実表示で仕上げます。</small></span></li><li><span><strong>確認した版を公開</strong><small>固定プレビューを最後まで見てから、自分で公開版を切り替えます。</small></span></li></ol>
       </section>
       <section class="landing-section" id="about"><div class="landing-section-head"><p class="eyebrow">One workspace</p><h2>調べる途中も、発表する瞬間も</h2><p>研究データを版付きで保存し、対話による大きな編集と、画面を見ながらの細かな仕上げを同じ研究へ反映します。一般的なWebサイト作成サービスではなく、最自由研究の制作過程と発表に焦点を絞っています。</p></div><div class="product-grid"><article class="product-card"><h3>研究を育てる</h3><p>興味の発見から問い・実験・結論まで、AIと対話しながら発表の形へ組み立てます。</p></article><article class="product-card"><h3>Webスライドを作る</h3><p>16:9／4:3、複数の構成・組版・配色、自由配置、段階表示、画像、読み上げ枠に対応します。</p></article><article class="product-card"><h3>声と表示を確認する</h3><p>ブラウザ音声で仮試聴し、VOICEVOX音声を生成。見切れなどを実rendererで検査してから公開します。</p></article></div></section>
       <section class="landing-section" id="roles"><div class="landing-section-head"><p class="eyebrow">Two surfaces</p><h2>AIとWeb UIには、得意な仕事があります</h2></div><div class="role-table"><article><h3>Claude・Codex・ChatGPTで進めること</h3><ul><li>テーマを一緒に探す</li><li>問い、方法、記録、発見を整理する</li><li>発表の流れや各スライドを構成する</li><li>対象を読んで小さな単位で修正する</li></ul><p class="inherit-note">研究の中身はAIとの対話で育て、決まったものをスライドと読み上げ原稿として保存します。</p></article><article><h3>ブラウザで進めること</h3><ul><li>Twitchで本人確認する</li><li>画像を追加し、実際の表示を確認する</li><li>文言、見た目、VOICEVOXを仕上げる</li><li>固定プレビューを確認し、公開する</li></ul></article></div></section>
       <section class="landing-section"><div class="landing-section-head"><p class="eyebrow">Your control</p><h2>下書きは本人だけ。公開は明示操作です</h2><p>AIとの接続にもWeb UIにも同じTwitchアカウントを使います。研究、画像、生成音声は所有者ごとに分離され、固定プレビューを確認して公開操作をするまで発表は一般公開されません。TwitchのパスワードをAIへ渡す必要はありません。</p></div></section>
       <section class="landing-cta"><div><h2>初回設定は5〜10分ほど</h2><p>Claude、Codex、ChatGPTの選び方から、環境ごとの接続手順まで案内します。</p></div><a class="button" href="/guide">はじめかたを見る</a></section>
       </main>`
    ),
    { headers: headers() }
  );
}

export function userGuidePage(options: {
  broadcasterLogin: string;
  minFollowDays: number;
}): Response {
  const endpointBox = `<div class="endpoint-box"><code>${MCP_ENDPOINT}</code><button type="button" data-copy-text="${MCP_ENDPOINT}" data-copy-success="MCP URLをコピーしました。">MCP URLをコピー</button><span class="feedback" data-copy-feedback aria-live="polite"></span></div>`;
  const commandBox = (command: string, success: string) => `<div class="endpoint-box"><code>${escapeHtml(command)}</code><button type="button" data-copy-text="${escapeHtml(command)}" data-copy-success="${escapeHtml(success)}">コピー</button><span class="feedback" data-copy-feedback aria-live="polite"></span></div>`;
  return new Response(
    shell(
      "はじめかた — 最自由研究",
      `<header class="site-header"><a class="brand" href="/">最自由研究</a><nav class="landing-nav" aria-label="案内"><a href="/">プロダクト説明</a><a class="button ghost" href="/login">Twitchでログイン</a></nav></header>
       <main data-surface="disclosure" id="main-content" tabindex="-1">
         <section class="guide-hero"><p class="eyebrow">Getting started</p><h1>最自由研究の<br>はじめかた</h1><p class="lead">Twitchで利用資格を確認し、使いたいAIへRemote MCPを一度接続すれば準備完了です。研究内容はAIと作り、実際の見た目・画像・音声・公開はWeb UIで仕上げます。</p><ul class="guide-meta"><li>目安 5〜10分</li><li>インストールするMCPサーバーなし</li><li>Twitchパスワードの貼り付け不要</li></ul></section>
         <nav class="guide-nav" aria-label="このページの目次"><a href="#before">準備</a><a href="#choose">AIを選ぶ</a><a href="#codex">Codex</a><a href="#claude-code">Claude Code</a><a href="#claude-web">Claude</a><a href="#chatgpt">ChatGPT</a><a href="#first-research">最初の研究</a><a href="#trouble">困ったとき</a></nav>
         <section class="guide-section" id="before"><p class="eyebrow">Before you start</p><h2>最初に用意するもの</h2><div class="product-grid"><article class="product-card"><h3>利用資格のあるTwitchアカウント</h3><p>${escapeHtml(options.broadcasterLogin)}を${options.minFollowDays}日以上フォロー中、または現在サブスク中のアカウントを使います。</p></article><article class="product-card"><h3>対応するAIクライアント</h3><p>Claude、Codex、ChatGPTなど、Remote MCPのHTTP接続に対応する環境が必要です。次の判断フローで確認できます。</p></article><article class="product-card"><h3>ブラウザ</h3><p>AI側の認証中にTwitchが開きます。Web UIへ先にログインしていても、AI接続の許可は別に一度行います。</p></article></div><div class="guide-note"><strong>AIサービスの契約は本サービスに含まれません。</strong> 料金より先に、使いたい画面で任意のRemote MCPを登録できるか確認してください。</div><div class="actions"><a class="button" href="/login">先にWeb UIへログイン</a></div></section>
         <section class="guide-section" id="choose"><p class="eyebrow">Choose your client</p><h2>Claude、Codex、ChatGPTのどれを使う？</h2>${renderClientChoiceGuide()}</section>
         <section class="guide-section" id="codex"><p class="eyebrow">Codex</p><h2>Codexへ接続する</h2><ol class="guide-step-list"><li class="guide-step"><div><h3>Remote MCPを登録する</h3><p>ターミナルで次を一度実行します。Codex CLI、IDE拡張など同じCodexホストの設定へ登録されます。</p>${commandBox(CODEX_MCP_ADD_COMMAND, "Codexの登録コマンドをコピーしました。")}</div></li><li class="guide-step"><div><h3>Twitchで接続を許可する</h3><p>次を実行し、開いたブラウザで権限内容を確認してからTwitchログインを完了します。</p>${commandBox(CODEX_MCP_LOGIN_COMMAND, "Codexの認証コマンドをコピーしました。")}</div></li><li class="guide-step"><div><h3>接続を確認する</h3><p><code>codex mcp list</code> で一覧を確認します。Codexのセッション内では <code>/mcp</code> を開き、<code>saijiyu-kenkyu</code> が有効であることを確認します。</p></div></li></ol><details class="connection-guide"><summary>画面から登録する場合</summary><div class="connection-body"><p>Codexの設定で「MCP servers」を開き、「Add server」から種類に「Streamable HTTP」、名前に <code>saijiyu-kenkyu</code>、URLに次の値を指定します。保存後、必要に応じてCodexを再起動し「Authenticate」を選びます。</p>${endpointBox}</div></details></section>
         <section class="guide-section" id="claude-code"><p class="eyebrow">Claude Code</p><h2>Claude Codeへ接続する</h2><ol class="guide-step-list"><li class="guide-step"><div><h3>ユーザー設定へ登録する</h3><p>どの作業フォルダでも利用できる <code>user</code> scopeへ登録します。オプションをサーバー名より前に置いた次の形をそのまま実行してください。</p>${commandBox(CLAUDE_MCP_ADD_COMMAND, "Claude Codeの登録コマンドをコピーしました。")}</div></li><li class="guide-step"><div><h3>Claude Code内で認証する</h3><p>Claude Codeを開いて <code>/mcp</code> を実行し、<code>saijiyu-kenkyu</code> を選択して認証します。ブラウザでTwitchログインと接続許可を完了してください。</p></div></li><li class="guide-step"><div><h3>接続を確認する</h3><p><code>claude mcp get saijiyu-kenkyu</code> で設定、<code>claude mcp list</code> で接続状態を確認できます。</p></div></li></ol><div class="guide-note"><strong>ブラウザが自動で開かない場合：</strong> Claude Codeが表示した認証URLをコピーしてブラウザで開きます。認証後の戻り先で接続エラーが出た場合は、アドレスバーの完全なcallback URLをClaude Codeの入力欄へ貼り付ける復旧方法もあります。</div></section>
         <section class="guide-section" id="claude-web"><p class="eyebrow">Claude Web / Desktop</p><h2>Claudeのカスタムコネクタへ追加する</h2><ol class="guide-step-list"><li class="guide-step"><div><h3>コネクタ設定を開く</h3><p>Claudeの「Customize（カスタマイズ）」→「Connectors（コネクタ）」→「＋」→「Add custom connector」を開きます。Team／Enterpriseでは管理者がOrganization settingsから先に追加する場合があります。</p></div></li><li class="guide-step"><div><h3>MCP URLを登録する</h3><p>名前を「最自由研究」、Remote MCP server URLを次の値にします。Client IDやSecretは入力せず追加します。</p>${endpointBox}</div></li><li class="guide-step"><div><h3>接続して会話で有効にする</h3><p>追加したコネクタの「Connect」からTwitch認証を完了します。新しい会話では入力欄左下の「＋」→「Connectors」から最自由研究を有効にします。</p></div></li></ol></section>
         <section class="guide-section" id="chatgpt"><p class="eyebrow">ChatGPT</p><h2>ChatGPTのDeveloper modeへ追加する</h2><div class="guide-note"><strong>最初に表示を確認：</strong> ChatGPTの「Settings」→「Security and login」に「Developer mode」が表示される場合だけ、この経路を選びます。利用可否はアカウントとworkspace policyに依存するため、料金プラン名だけでは保証できません。</div><ol class="guide-step-list"><li class="guide-step"><div><h3>Developer modeを有効にする</h3><p>「Settings」→「Security and login」を開き、「Developer mode」をオンにします。</p></div></li><li class="guide-step"><div><h3>PluginsへMCP URLを登録する</h3><p><a href="https://chatgpt.com/plugins" target="_blank" rel="noopener noreferrer">ChatGPT Plugins</a>の「＋」から名前と説明を入力し、公開HTTPS endpointとして次のURLを登録します。</p>${endpointBox}</div></li><li class="guide-step"><div><h3>新しい会話で有効にする</h3><p>新しい会話の「＋」から「More」を開き、登録した最自由研究を選びます。要求されたら同じTwitchアカウントで接続を許可します。</p></div></li></ol><div class="guide-warning guide-note"><strong>Developer modeが見つからない場合：</strong> 先に課金して解決するとは限りません。同じOpenAIアカウントで利用できるCodex、またはClaude Freeのカスタムコネクタを選んでください。</div></section>
         <section class="guide-section" id="oauth"><p class="eyebrow">OAuth</p><h2>認証画面で確認すること</h2><ul class="plain-list"><li>接続先が <code>saijiyu-kenkyu.2764.moe</code> であること</li><li>研究の読み取り・編集・公開など、AIクライアントが要求する権限</li><li>ログインするTwitchアカウントがWeb UIと同じであること</li></ul><div class="guide-note"><strong>最後に <code>http://127.0.0.1</code> や <code>http://localhost</code> が開くのは正常です。</strong> CodexやClaude Codeが一時的に待ち受ける、ご自身の端末内だけのOAuth戻り先です。認証完了の表示またはクライアント側の成功を確認するまで、その画面を閉じないでください。</div></section>
         <section class="guide-section" id="first-research"><p class="eyebrow">First research</p><h2>最初の研究を始める</h2><ol class="guide-step-list"><li class="guide-step"><div><h3>AIへ最初の依頼を送る</h3><p>接続したAIとの新しい会話へ、次の文を貼り付けます。一度に結論を作らず、興味から一問ずつ始めます。</p>${commandBox(FIRST_RESEARCH_PROMPT, "最初の依頼文をコピーしました。")}</div></li><li class="guide-step"><div><h3>AIと研究を進める</h3><p>問い、予想、方法、結果を対話し、まとまったところで発表スライドと読み上げ原稿にするよう頼みます。AIは変更前に対象とversionを確認し、小さな単位で編集します。</p></div></li><li class="guide-step"><div><h3>Web UIで実物を仕上げる</h3><p>「自分の研究」から研究を開き、スライドの実表示、画像、読み上げ、VOICEVOX、品質確認を進めます。最後に固定プレビューを確認してから公開します。</p><div class="actions"><a class="button" href="/login">自分の研究を開く</a></div></div></li></ol><div class="guide-warning guide-note"><strong>公開は自動ではありません。</strong> AIが研究や発表を編集しても下書きのままです。公開版を変える操作はWeb UIで固定プレビューを確認した本人が行います。</div></section>
         <section class="guide-section" id="trouble"><p class="eyebrow">Troubleshooting</p><h2>困ったとき</h2><table class="troubleshooting"><tbody><tr><th>AIに最自由研究のtoolが見えない</th><td>Codexは <code>codex mcp list</code> とセッション内の <code>/mcp</code>、Claude Codeは <code>claude mcp list</code> と <code>/mcp</code> を確認します。登録直後はクライアントを再起動します。</td></tr><tr><th>認証画面が期限切れになった</th><td>古いタブを閉じ、Codexは <code>codex mcp login saijiyu-kenkyu</code>、Claude Codeは <code>/mcp</code> から新しい認証を一度だけ開始します。認証ボタンを連打しません。</td></tr><tr><th>Twitch後に接続へ戻らない</th><td>Codex／Claude Codeを起動した端末とブラウザが同じか確認します。Claude Codeではアドレスバーの完全なcallback URLをクライアントへ貼る復旧手段があります。</td></tr><tr><th>利用条件を満たしていないと表示される</th><td>ログイン中のTwitchアカウント、${escapeHtml(options.broadcasterLogin)}のフォロー状態・期間、現在のサブスク状態を確認します。WebとAI側で別アカウントを使っていないかも確認してください。</td></tr><tr><th>接続し直したい</th><td>Codexは <code>codex mcp logout saijiyu-kenkyu</code> の後にlogin、Claude Codeは <code>/mcp</code> の「Clear authentication」から再認証します。</td></tr><tr><th>編集内容が競合した</th><td>別タブやAIが先に保存しています。画面を再読み込みして現行版を確認し、必要な一項目だけもう一度変更します。過去版は研究詳細の履歴から確認・復元できます。</td></tr></tbody></table></section>
         <section class="guide-section" id="security"><p class="eyebrow">Safety and privacy</p><h2>接続前に知っておくこと</h2><ul class="plain-list"><li>Twitchのパスワードやaccess tokenをAIの会話へ貼り付けません。</li><li>接続先のAIは、許可した範囲で自分の研究を読み取り・変更できます。tool実行内容を確認してください。</li><li>下書き、画像、生成音声は利用者ごとに分離されます。公開操作後の発表はURLを知る人が閲覧できます。</li><li>任意のHTML、shell、未検証コードをMCPから実行する機能はありません。</li></ul><div class="actions"><a class="button ghost" href="/data">保存するデータと削除方法を確認</a></div><div class="official-links"><a href="https://learn.chatgpt.com/docs/extend/mcp.md" target="_blank" rel="noopener noreferrer">Codex MCP 公式ガイド</a><a href="https://learn.chatgpt.com/docs/pricing.md" target="_blank" rel="noopener noreferrer">OpenAI 料金</a><a href="https://developers.openai.com/plugins/deploy/connect-chatgpt" target="_blank" rel="noopener noreferrer">ChatGPT Developer mode</a><a href="https://code.claude.com/docs/en/mcp" target="_blank" rel="noopener noreferrer">Claude Code MCP 公式ガイド</a><a href="https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp" target="_blank" rel="noopener noreferrer">Claude カスタムコネクタ公式ガイド</a><a href="https://claude.com/pricing" target="_blank" rel="noopener noreferrer">Claude 料金</a></div></section>
       </main><script src="${DASHBOARD_SCRIPT_SRC}" defer></script>`
    ),
    { headers: headers() }
  );
}

export function dataHandlingPage(): Response {
  return new Response(
    shell(
      "データの取り扱い — 最自由研究",
      `<header class="site-header"><a class="brand" href="/">最自由研究</a><nav class="landing-nav" aria-label="案内"><a href="/guide">はじめかた</a><a class="button ghost" href="/login">Twitchでログイン</a></nav></header>
       <main data-surface="disclosure" id="main-content" tabindex="-1">
         <section class="guide-hero"><p class="eyebrow">Data handling</p><h1>保存するデータと<br>削除のしかた</h1><p class="lead">限定提供中の最自由研究が、本人確認・制作・公開のために扱う情報を説明します。TwitchのパスワードをこのサービスやAIの会話へ入力する必要はありません。</p><ul class="guide-meta"><li>2026年8月1日現在</li><li>公開は本人の明示操作</li><li>研究・アカウント単位で削除可能</li></ul></section>
         <section class="guide-section"><h2>保存するもの</h2><ul class="plain-list"><li><strong>Twitch識別情報：</strong>ユーザーID、ログイン名、フォロー期間・サブスク状態を元にした資格判定結果。</li><li><strong>認証情報：</strong>Webセッションは24時間。Remote MCP接続では資格を再確認するため、Twitchが発行したtokenをCloudflare KV内の接続情報として保持します。</li><li><strong>制作データ：</strong>研究本文、版履歴、スライド、レビューコメント、圧縮済みWebP画像、VOICEVOX生成MP3、固定プレビューと公開状態。</li><li><strong>運用記録：</strong>ログイン、資格判定、主要な編集・生成・公開操作の結果。本文やTwitchのパスワードは監査記録へ入れません。</li></ul></section>
         <section class="guide-section"><h2>公開される範囲</h2><ul class="plain-list"><li>下書き、アップロード画像、生成途中の音声、プレビューは、同じTwitch利用者として認証された本人だけが取得できます。</li><li>「公開する」を実行した固定版だけが、推測しにくい公開URLから認証なしで閲覧できます。</li><li>公開停止または研究削除を行うと、公開URLは直ちに無効になります。</li></ul></section>
         <section class="guide-section"><h2>保持期間と削除</h2><ul class="plain-list"><li>研究データは本人が削除するまで保持します。</li><li>研究詳細の「研究を完全に削除」で、本文、画像、音声、プレビュー、公開版をまとめて削除できます。R2の実体は削除待ちへ移され、失敗時も定期的に再試行されます。</li><li>VOICEVOXの調声試聴キャッシュは共有され、最終的に30日で自動削除されます。</li><li>監査記録は180日を超えたものを毎日削除します。期限切れWebセッションとOAuthデータも毎日削除します。</li><li>障害復旧用のCloudflare D1 Time Travelには、削除前の状態が契約プランに応じて最大30日残る場合があります。通常のアプリ操作からは参照できません。</li></ul></section>
         <section class="guide-section"><h2>利用者ができること</h2><ol class="guide-step-list"><li class="guide-step"><div><h3>公開だけ止める</h3><p>研究詳細の公開欄から「公開を停止」を選びます。下書きは残ります。</p></div></li><li class="guide-step"><div><h3>研究を完全に削除する</h3><p>研究詳細の末尾を開き、確認欄へ <code>DELETE</code> と入力して削除します。この操作は取り消せません。</p></div></li><li class="guide-step"><div><h3>アカウントと全データを削除する</h3><p>「自分の研究」の末尾を開き、Twitchログイン名と <code>DELETE ACCOUNT</code> を入力します。全研究とMCP接続を含む本人データを削除し、ログアウトします。</p></div></li></ol><div class="guide-note"><strong>削除後の復旧について：</strong> 通常の画面からは復旧できません。障害復旧用のD1 Time Travelに残る期間を過ぎると、運営者も復旧できません。公開のIssueやチャットへtoken・パスワードを貼らないでください。</div></section>
       </main>`
    ),
    { headers: headers() }
  );
}

export function dashboardPage(options: {
  twitchLogin: string;
  csrfToken: string;
  projects: DashboardProjectSummary[];
  projectDeleted?: boolean;
}): Response {
  const cards = options.projects
    .map(
      (project) => {
        const previewProjectCurrent = project.preview_project_version === project.version;
        const previewCurrent = previewProjectCurrent && project.preview_renderer_version === PRESENTATION_RENDERER_VERSION;
        const publishedProjectCurrent = project.published_project_version === project.version;
        const publishedCurrent = publishedProjectCurrent && project.published_renderer_version === PRESENTATION_RENDERER_VERSION;
        const publicationLabel = publishedCurrent
          ? "公開中"
          : publishedProjectCurrent
            ? "公開表示の更新あり"
          : project.published_project_version !== null
            ? "公開後に内容変更"
            : previewCurrent && project.preview_reviewed_at !== null
              ? "公開できます"
              : previewCurrent
                ? "プレビュー確認待ち"
                : previewProjectCurrent
                  ? "プレビュー表示の更新あり"
                  : project.preview_project_version !== null
                    ? "プレビュー後に内容変更"
                : "プレビュー未作成";
        const publicationState = publishedCurrent ? "ready" : "attention";
        const incompleteVoice = project.voice_segment_count > 0 && project.voice_ready_count < project.voice_segment_count;
        const qualityCurrent = project.quality_project_version === project.version &&
          project.quality_renderer_version === PRESENTATION_RENDERER_VERSION &&
          project.quality_status === "completed";
        const qualityState = qualityCurrent ? "ready" : "attention";
        const qualityLabel = project.quality_project_version === null
          ? "実表示 未測定"
          : !qualityCurrent
            ? "実表示 要再測定"
            : "実表示 測定済み";
        const attentionReasons = !project.has_presentation
          ? ["発表を構成"]
          : [
              ...(incompleteVoice ? [`音声をあと${project.voice_segment_count - project.voice_ready_count}区間生成`] : []),
              ...(qualityState === "attention" ? [qualityLabel] : []),
              ...(!publishedCurrent ? [publicationLabel] : [])
            ];
        const voiceLabel = project.voice_segment_count === 0
          ? "音声原稿なし"
          : project.voice_ready_count === project.voice_segment_count
            ? `音声 ${project.voice_ready_count}/${project.voice_segment_count} 完成`
            : `音声 ${project.voice_ready_count}/${project.voice_segment_count}`;
        const voiceState = project.voice_segment_count > 0 && project.voice_ready_count === project.voice_segment_count ? "ready" : "attention";
        return `<a class="card-link" href="/dashboard/projects/${escapeHtml(project.project_id)}"><article class="card" data-project-id="${escapeHtml(project.project_id)}">
        <div class="card-top"><span class="version">v${project.version}</span></div>
        <h2>${escapeHtml(project.title)}</h2>
        <p class="meta">${project.has_presentation ? `発表 ${project.slide_count}枚 · ${formatDuration(project.total_duration_seconds)}` : "発表は未構成"}</p>
        ${project.has_presentation ? `<div class="project-statuses"><span class="project-status" data-kind="voice" data-state="${voiceState}">${voiceLabel}</span><span class="project-status" data-kind="quality" data-state="${qualityState}">${qualityLabel}</span><span class="project-status" data-kind="publication" data-state="${publicationState}">${publicationLabel}</span></div>` : ""}
        ${attentionReasons.length > 0 ? `<p class="project-attention">次に：${escapeHtml(attentionReasons.join(" · "))}</p>` : ""}
        <p class="meta">最終更新 ${escapeHtml(formatDate(project.updated_at))}</p>
      </article></a>`;
      }
    )
    .join("");
  const content =
    cards.length > 0
      ? `<div class="grid" data-project-grid>${cards}</div>`
      : `<section class="empty"><p class="eyebrow">Ready for your first research</p><h2>Web UIの準備はできました</h2><p>まだ研究がありません。次はCodexまたはClaudeへMCPを接続し、下の文から最初の対話を始めます。</p><div class="copy-box"><code>${escapeHtml(FIRST_RESEARCH_PROMPT)}</code><div class="actions"><button type="button" data-op="ask" data-copy-text="${escapeHtml(FIRST_RESEARCH_PROMPT)}">AIに頼む文をコピー</button><a class="button ghost" href="/guide#choose">接続手順を開く</a><span class="feedback" data-copy-feedback aria-live="polite"></span></div></div></section>`;
  const connectionGuide = `<details class="connection-guide"${options.projects.length === 0 ? " open" : ""}><summary>AIクライアントとの接続・再接続</summary><div class="connection-body"><p>この画面のTwitchログインと、AIクライアントからのMCP接続許可は別々です。初回だけ、利用するAI側でも同じTwitchアカウントによる認証を完了してください。</p><ol class="setup-steps"><li><strong>Codex</strong><br><code>codex mcp add</code> と <code>codex mcp login</code> を使います。</li><li><strong>Claude Code</strong><br><code>claude mcp add</code> の後、<code>/mcp</code> から認証します。</li><li><strong>Claude Web／Desktop</strong><br>カスタムコネクタへMCP URLを追加します。</li><li><strong>ChatGPT</strong><br>Developer modeが表示される場合、PluginsへMCP URLを追加します。</li></ol><div class="endpoint-box"><code>${MCP_ENDPOINT}</code><button type="button" data-copy-text="${MCP_ENDPOINT}" data-copy-success="MCP URLをコピーしました。">MCP URLをコピー</button><a class="button ghost" href="/guide#choose">AIを選ぶ・接続手順</a><span class="feedback" data-copy-feedback aria-live="polite"></span></div><p class="inherit-note">TwitchのパスワードやtokenをAIへ貼る必要はありません。認証後に127.0.0.1またはlocalhostが開く場合は、AIクライアントへ戻るための正常な画面です。</p></div></details>`;

  return new Response(
    shell(
      "自分の研究 — 最自由研究",
      `${accountHeader(options.twitchLogin, options.csrfToken)}
       <main data-surface="select" id="main-content" tabindex="-1">
         ${options.projectDeleted ? '<p class="panel success" role="status">研究と公開URLを削除しました。画像・音声の実体も削除処理へ送られました。</p>' : ""}
         <div class="section-head"><div><p class="eyebrow">My research</p><h1>自分の研究</h1></div><span class="count">${options.projects.length} / 20 件</span></div>
         ${content}
         ${connectionGuide}
         <p class="hint">研究を開くと、内容確認、文言の微調整、発表プレビュー、公開操作を行えます。大きな構成変更は接続したAIクライアントから進めます。</p>
         <details class="danger-zone"><summary>アカウントと全データを削除</summary><p>すべての研究、画像、音声、公開URL、Twitch識別情報、Webセッション、MCP接続を削除します。取り消せません。</p><form method="post" action="/account/delete"><input type="hidden" name="csrf_token" value="${escapeHtml(options.csrfToken)}"><label>Twitchログイン名<input name="twitch_login" autocomplete="off" required></label><label>確認のため <code>DELETE ACCOUNT</code> と入力<input name="confirmation" autocomplete="off" pattern="DELETE ACCOUNT" required></label><button class="danger" type="submit">アカウントと全データを削除</button></form></details>
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
  renderedQualityReport: RenderedQualityReport | null;
}): Response {
  const document = options.project.document;
  const projectBytes = projectDocumentBytes(document);
  const projectStoragePercent = Math.round(projectBytes / MAX_PROJECT_DOCUMENT_BYTES * 100);
  const projectStorageWarning = projectBytes >= MAX_PROJECT_DOCUMENT_BYTES * 0.75;
  const storageBreakdown = projectStorageWarning
    ? [
        { label: "スライド", href: "#presentation-structure", bytes: serializedValueBytes(document.deck?.slides ?? []) },
        {
          label: "発表全体の設定",
          href: "#presentation-screen",
          bytes: serializedValueBytes(document.deck === null
            ? null
            : { ...document.deck, slides: undefined })
        }
      ].sort((first, second) => second.bytes - first.bytes)
    : [];
  const storageBreakdownHtml = storageBreakdown.length === 0
    ? ""
    : `<details class="storage-breakdown"><summary>容量の大きい順を確認</summary><ol>${storageBreakdown.map((item) => `<li><a href="${item.href}">${item.label}</a> · 約${Math.ceil(item.bytes / 1024)} KiB</li>`).join("")}</ol></details>`;
  const projectFieldsPath = `/api/projects/${escapeHtml(options.project.project_id)}/fields`;
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
        .map((slide, index) => {
          const narration = slide.narration?.segments ?? [];
          const readyVoice = narration.filter((segment) => segment.audio_src).length;
          const voiceLabel = narration.length === 0
            ? "原稿なし"
            : `音声 ${readyVoice}/${narration.length}`;
          return `<a class="slide-row" href="/dashboard/projects/${escapeHtml(options.project.project_id)}/slides/${escapeHtml(slide.id)}"><span>${index + 1}</span><strong>${escapeHtml(slide.title)}<small class="stage">${SLIDE_ROLE_LABELS[slide.role ?? "content"]} · ${escapeHtml(slideCompositionLabel(slide))}</small></strong><span>${slide.duration_seconds}秒 · ${slide.reveal_steps + 1}段階<small class="stage">${voiceLabel}</small></span></a>`;
        })
        .join("")
    : `<p class="prose">発表スライドはまだ構成されていません。</p>`;
  const slideCreateForm = deck === null ? "" : slideCreator({
    action: `/api/projects/${escapeHtml(options.project.project_id)}/slides`,
    version: options.project.version,
    csrfToken: options.csrfToken,
    slideCount: slides.length,
    defaultPosition: slides.length
  });
  const assetCards = options.assets.length
    ? `<div class="asset-grid">${options.assets
        .map(
          (asset) => `<article class="asset" data-asset><img src="${escapeHtml(asset.content_url)}" alt="${escapeHtml(asset.alt_text)}" loading="lazy"><div class="asset-body"><p class="meta">${escapeHtml(asset.original_filename)} · ${asset.width}×${asset.height} · ${Math.ceil(asset.byte_size / 1024)} KiB</p><form class="asset-alt" data-image-alt action="/api/images/${escapeHtml(asset.asset_id)}" data-csrf="${escapeHtml(options.csrfToken)}"><label>画像の説明<input name="alt_text" maxlength="500" value="${escapeHtml(asset.alt_text)}" placeholder="何が写っているか"></label><div class="actions"><button type="submit">説明を保存</button><span class="feedback" data-alt-feedback aria-live="polite"></span></div></form><button type="button" data-image-delete="/api/images/${escapeHtml(asset.asset_id)}" data-image-label="${escapeHtml(asset.alt_text || asset.original_filename)}" data-csrf="${escapeHtml(options.csrfToken)}">削除</button><span class="feedback" data-delete-feedback aria-live="polite"></span></div></article>`
        )
        .join("")}</div>`
    : `<p class="prose">まだ画像がありません。</p>`;
  const assetTotalBytes = options.assets.reduce((total, asset) => total + asset.byte_size, 0);
  const assetTotalSize = assetTotalBytes < 1024 * 1024
    ? `${Math.ceil(assetTotalBytes / 1024)} KiB`
    : `${(assetTotalBytes / 1024 / 1024).toFixed(1)} MiB`;
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
  const previewReviewed = previewCurrent && preview?.reviewed_at !== null;
  const publishedCurrent =
    published?.project_version === options.project.version &&
    published.renderer_version === options.publication.current_renderer_version;
  const publicationHistory = options.publication.published_history.length === 0
    ? ""
    : `<details class="component-detail"><summary>公開可能な過去版 · ${options.publication.published_history.length}件</summary><div class="publication-history">${options.publication.published_history.map((revision) => {
        const active = revision.revision_id === published?.revision_id;
        const publishedAt = revision.published_at === null
          ? revision.created_at
          : revision.published_at;
        const revisionMeta = `${(revision.byte_size / 1024).toFixed(1)} KB · ${revision.content_hash.slice(0, 8)}`;
        return `<article class="status-row"><span><strong>v${revision.project_version} · ${escapeHtml(revision.renderer_version)}</strong><small>${escapeHtml(new Date(publishedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }))} · ${escapeHtml(revisionMeta)}</small></span><span class="actions"><a class="button ghost" href="/preview/${escapeHtml(revision.revision_id)}" target="_blank" rel="noopener">この版を確認</a>${active ? '<strong class="success">公開中</strong>' : `<button type="button" data-publish-rollback="/api/projects/${escapeHtml(options.project.project_id)}/publish" data-revision="${escapeHtml(revision.revision_id)}" data-csrf="${escapeHtml(options.csrfToken)}">この版へ戻す</button>`}</span></article>`;
      }).join("")}</div></details>`;
  const publicationActionLabels = {
    publish: "公開開始",
    rollback: "過去版へ切替",
    unpublish: "公開停止"
  } as const;
  const publicationEvents = options.publication.events.length === 0
    ? ""
    : `<details class="component-detail"><summary>公開操作履歴 · ${options.publication.events.length}件</summary><div class="publication-history">${options.publication.events.map((event) => {
        const from = event.from_project_version === null ? "非公開" : `v${event.from_project_version}`;
        const to = event.to_project_version === null ? "非公開" : `v${event.to_project_version}`;
        return `<article class="status-row"><span><strong>${escapeHtml(publicationActionLabels[event.action])}</strong><small>${escapeHtml(new Date(event.created_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }))}</small></span><strong>${escapeHtml(from)} → ${escapeHtml(to)}</strong></article>`;
      }).join("")}</div></details>`;
  const slidesReady = slides.length > 0;
  const totalDurationSeconds = slides.reduce(
    (total, slide) => total + slide.duration_seconds,
    0
  );
  const durationWithinLimit =
    totalDurationSeconds > 0 && totalDurationSeconds <= MAX_PRESENTATION_DURATION_SECONDS;
  const firstSlidePath = slides[0] === undefined
    ? "#presentation-structure"
    : `/dashboard/projects/${escapeHtml(options.project.project_id)}/slides/${escapeHtml(slides[0].id)}`;
  const renderedQualityCurrent =
    options.renderedQualityReport?.project_version === options.project.version &&
    options.renderedQualityReport.renderer_version === PRESENTATION_RENDERER_VERSION &&
    options.renderedQualityReport.status === "completed";
  const renderedQualityState = options.renderedQualityReport === null
    ? "missing"
    : !renderedQualityCurrent
      ? "stale"
      : "measured";
  const renderedQualityLabel = renderedQualityState === "missing"
    ? "未測定"
    : renderedQualityState === "stale"
      ? "要再測定"
      : "測定済み";
  const journeySteps = [
    { label: "発表構成", detail: `${slides.length}枚`, complete: slidesReady },
    { label: "実表示", detail: renderedQualityLabel, complete: renderedQualityState === "measured" },
    ...(voiceConfigured
      ? [{
          label: "VOICEVOX",
          detail: previewCurrent ? "固定版へ保存済み" : `${readyVoiceSegments}/${narrationSegments.length}区間`,
          complete: !voiceIncomplete || previewCurrent
        }]
      : []),
    {
      label: "プレビュー",
      detail: previewReviewed
        ? "確認済み"
        : previewCurrent
          ? "確認待ち"
          : preview === null
            ? "未作成"
            : "要再生成",
      complete: previewReviewed
    },
    { label: "公開", detail: publishedCurrent ? "最新版" : "未反映", complete: publishedCurrent, kind: "publication" }
  ];
  const journeyCompleted = journeySteps.filter((step) => step.complete).length;
  const nextJourneyAction = !slidesReady
    ? {
        title: "AIと発表スライドを作る",
        description: "接続中のAIクライアントへ「発表スライドの構成を作って」と伝えます。AIは現在の研究を読めます。",
        action: ""
      }
      : !durationWithinLimit
        ? {
            title: "発表を20分以内に収める",
            description: `現在は${formatDuration(totalDurationSeconds)}です。スライドの構成または想定秒数を見直してください。`,
            action: `<a class="button" href="${firstSlidePath}">スライドを見直す</a>`
          }
      : renderedQualityState !== "measured"
        ? {
            title: "全スライドの実表示を測定する",
            description: "実際のフォント・画像・アニメーションを含めて全STEPを描画し、縮小率・コントラスト・文字サイズを測ります。数値は接続中のAIから読めます。",
            action: `<a class="button" href="#rendered-quality">実表示の測定へ</a>`
          }
      : voiceIncomplete && !previewCurrent
        ? {
            title: "VOICEVOX音声を生成する",
            description: `設定した声で${readyVoiceSegments}/${narrationSegments.length}区間まで生成済みです。固定プレビューには全区間の生成が必要です。`,
            action: `<a class="button" href="/dashboard/projects/${escapeHtml(options.project.project_id)}/voice">音声を仕上げる</a>`
          }
      : !previewCurrent
        ? {
            title: "現在の見た目をプレビューする",
            description: "固定された確認用URLを開き、文字・音声・ページ送りを通して確認します。",
            action: `<a class="button" href="#publication">プレビューへ進む</a>`
          }
        : !previewReviewed
          ? {
              title: "固定プレビューを最後まで確認する",
              description: "文字の見切れ、読み上げ、自動送りを確認し、最後の終了画面まで進めます。",
              action: `<a class="button" href="/preview/${escapeHtml(preview.revision_id)}" target="_blank" rel="noopener">プレビューを確認</a>`
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
  const workflowPanel = `<section class="journey" id="journey" tabindex="-1" aria-labelledby="journey-title">
    <div class="journey-head"><div><p class="eyebrow">Next action</p><h2 id="journey-title">完成までの流れ</h2><p>研究内容から公開まで、現在地と次の操作をまとめています。</p></div><div class="journey-progress"><strong>${journeyCompleted} / ${journeySteps.length}</strong><progress max="${journeySteps.length}" value="${journeyCompleted}">${journeyCompleted} / ${journeySteps.length}</progress></div></div>
    <ol class="journey-steps">${journeySteps.map((step) => `<li class="journey-step" data-complete="${String(step.complete)}"${"kind" in step ? ` data-kind="${step.kind}"` : ""}><span>${step.label}<small>${step.detail}</small></span></li>`).join("")}</ol>
    <div class="journey-next"><div><h3>${nextJourneyAction.title}</h3><p>${nextJourneyAction.description}</p></div><div class="actions">${nextJourneyAction.action}</div></div>
    <dl class="journey-facts">
      <div><dt>version</dt><dd>v${options.project.version}</dd></div>
      <div><dt>更新日</dt><dd>${escapeHtml(formatDate(options.project.updated_at))}</dd></div>
      <div><dt>スライド</dt><dd>${slides.length}枚</dd></div>
      <div><dt>想定時間</dt><dd data-state="${durationWithinLimit ? "ok" : "warning"}">${formatDuration(totalDurationSeconds)}${totalDurationSeconds > MAX_PRESENTATION_DURATION_SECONDS ? " · 20分超過" : ""}</dd></div>
      <div><dt>保存容量</dt><dd data-state="${projectStorageWarning ? "warning" : "ok"}">${Math.ceil(projectBytes / 1024)} / ${MAX_PROJECT_DOCUMENT_BYTES / 1024} KiB</dd></div>
    </dl>
    ${projectStorageWarning ? `<div class="project-storage" data-state="warning"><progress max="${MAX_PROJECT_DOCUMENT_BYTES}" value="${projectBytes}">${projectStoragePercent}%</progress><small class="inherit-note">上限に近づいています。大きい項目から整理してください。</small>${storageBreakdownHtml}</div>` : ""}
  </section>`;
  const previewStaleMessage = !previewDraftCurrent
    ? "下書きが変わったため、新しいプレビューの確認が必要です。"
    : !previewRendererCurrent
      ? "表示エンジンが更新されたため、新しいプレビューの確認が必要です。"
      : "公開中の版は、下書きを編集しても自動では変わりません。";
  const publicMetaEditor = `<details class="component-detail"><summary>公開ページの題名と説明文</summary><div class="disclosure-body"><form class="editor" data-project-editor action="${projectFieldsPath}" data-version="${options.project.version}" data-csrf="${escapeHtml(options.csrfToken)}"><label>題名<input name="title" maxlength="120" required value="${escapeHtml(document.title)}"></label><label>説明文<textarea name="summary" maxlength="2000" placeholder="公開ページをSNSなどで共有したときに表示される説明です。">${escapeHtml(document.summary)}</textarea></label><div class="actions"><button type="submit">保存</button><span class="version" data-editor-version>v${options.project.version}</span></div><p class="feedback" data-editor-feedback aria-live="polite"></p></form></div></details>`;
  const publicationPanel = `<section class="panel publish-state" id="publication" tabindex="-1" data-publication>
    <h2>プレビューと公開</h2>
    <p class="feedback warning" data-publication-dirty aria-live="polite" hidden></p>
    ${publicMetaEditor}
    <div class="status-row"><span>下書き</span><strong>v${options.project.version}</strong></div>
    <div class="status-row"><span>表示エンジン</span><strong>${escapeHtml(options.publication.current_renderer_version)}</strong></div>
    <div class="status-row"><span>実表示の測定</span><strong data-rendered-quality-state>${escapeHtml(renderedQualityLabel)}</strong></div>
    <div class="status-row"><span>最新プレビュー</span><strong data-preview-status>${preview === null ? "未作成" : `v${preview.project_version} · ${escapeHtml(preview.renderer_version)}${previewCurrent ? "" : " · 要再生成"}`}</strong></div>
    <div class="status-row"><span>プレビュー確認</span><strong data-preview-review-status>${previewReviewed ? "確認済み" : previewCurrent ? "終了画面の到達待ち" : "対象なし"}</strong></div>
    <div class="status-row"><span>公開中</span><strong data-published-status>${published === null ? "未公開" : `v${published.project_version} · ${escapeHtml(published.renderer_version)}`}</strong></div>
    <a class="button ghost" data-preview-link href="${preview === null ? "#" : `/preview/${escapeHtml(preview.revision_id)}`}" target="_blank" rel="noopener"${preview === null ? " hidden" : ""}>最新プレビューを開く</a>
    <a class="button ghost" data-public-link href="${published !== null && options.publication.slug !== null ? `/p/${escapeHtml(options.publication.slug)}` : "#"}" target="_blank" rel="noopener"${published === null || options.publication.slug === null ? " hidden" : ""}>公開ページを開く</a>
    <button type="button" data-copy-public${published === null || options.publication.slug === null ? " hidden" : ""}>公開URLをコピー</button><span class="feedback" data-copy-public-feedback aria-live="polite"></span>
    <button class="danger" type="button" data-op="commit" data-unpublish="/api/projects/${escapeHtml(options.project.project_id)}/publish" data-csrf="${escapeHtml(options.csrfToken)}"${published === null ? " hidden" : ""}>公開を停止</button>
    ${publicationHistory}
    ${publicationEvents}
    <div class="commit-zone" role="group" aria-labelledby="publication-gate">
    <p class="commit-zone-label" id="publication-gate">ここから先の操作は公開に反映されます</p>
    <div class="actions">
      <button type="button" data-op="commit" data-create-preview="/api/projects/${escapeHtml(options.project.project_id)}/previews" data-version="${options.project.version}" data-can-preview="${String(slides.length > 0 && !voiceIncomplete)}" data-csrf="${escapeHtml(options.csrfToken)}"${slides.length === 0 || voiceIncomplete ? " disabled" : ""}>現在の下書きをプレビュー</button>
      <button type="button" data-op="commit" data-review-preview="/api/projects/${escapeHtml(options.project.project_id)}/previews/${escapeHtml(preview?.revision_id ?? "")}/review" data-project="${escapeHtml(options.project.project_id)}" data-version="${options.project.version}" data-renderer="${escapeHtml(options.publication.current_renderer_version)}" data-revision="${escapeHtml(preview?.revision_id ?? "")}" data-review-available="false" data-csrf="${escapeHtml(options.csrfToken)}" disabled>${previewReviewed ? "プレビュー確認済み" : "終了画面の到達待ち"}</button>
      <button type="button" data-op="commit" data-publish-preview="/api/projects/${escapeHtml(options.project.project_id)}/publish" data-revision="${escapeHtml(preview?.revision_id ?? "")}" data-csrf="${escapeHtml(options.csrfToken)}" data-duration-valid="${String(durationWithinLimit)}" data-preview-current="${String(previewCurrent)}" data-preview-reviewed="${String(previewReviewed)}" data-published-current="${String(publishedCurrent)}"${previewReviewed && durationWithinLimit && !publishedCurrent ? "" : " disabled"}>${publishedCurrent ? "この版は公開済み" : "確認した版を公開"}</button>
    </div>
    </div>
    <p class="feedback${!durationWithinLimit || (voiceIncomplete && !previewCurrent) || (preview !== null && !previewCurrent) || (previewCurrent && !previewReviewed) ? " warning" : ""}" data-publish-feedback aria-live="polite">${slides.length === 0 ? "スライドを1枚以上作るとプレビューできます。" : !durationWithinLimit ? `想定発表時間が${formatDuration(totalDurationSeconds)}です。20分以内に短縮してから公開してください。プレビューは短縮前でも確認できます。` : previewCurrent && !previewReviewed ? "固定プレビューを最後の終了画面まで進めると、自動で確認済みになります。" : voiceIncomplete && !previewCurrent ? `VOICEVOX音声は ${readyVoiceSegments} / ${narrationSegments.length} 区間まで生成済みです。設定した声を固定プレビューへ反映するため、全区間を生成してください。` : preview !== null && !previewCurrent ? previewStaleMessage : "公開中の版は、下書きや表示エンジンを更新しても自動では変わりません。"}</p>
  </section>`;
  const voicePanel = `<section class="panel publish-state" id="voice-finishing" tabindex="-1"><h2>読み上げ音声</h2>
    <div class="status-row"><span>読み上げ区間</span><strong>${narrationSegments.length}件</strong></div>
    <div class="status-row"><span>VOICEVOX生成済み</span><strong>${readyVoiceSegments} / ${narrationSegments.length}</strong></div>
    <a class="button" href="/dashboard/projects/${escapeHtml(options.project.project_id)}/voice">音声を仕上げる</a>
    <p class="feedback">VOICEVOXの話者・スタイル・調声、生成状況、区間ごとの試聴を一つの画面で確認できます。</p>
  </section>`;
  const presentationSettingsPanel = deck === null
    ? ""
    : `<details class="panel panel-disclosure" id="presentation-screen"><summary>発表画面と0ページ目</summary><div class="disclosure-body">
       <form class="editor" data-deck-editor data-versioned-form action="/api/projects/${escapeHtml(options.project.project_id)}/presentation/settings" data-version="${options.project.version}" data-csrf="${escapeHtml(options.csrfToken)}">
         <fieldset><legend>スライド比率</legend><div class="ratio-options">
           <label class="ratio-option"><input type="radio" name="aspect_ratio" value="16:9"${(deck.aspect_ratio ?? "16:9") === "16:9" ? " checked" : ""}><span class="ratio-preview wide"></span><span><strong>ワイド 16:9</strong><small>PC・配信向け</small></span></label>
           <label class="ratio-option"><input type="radio" name="aspect_ratio" value="4:3"${deck.aspect_ratio === "4:3" ? " checked" : ""}><span class="ratio-preview standard"></span><span><strong>標準 4:3</strong><small>資料・旧型画面向け</small></span></label>
         </div></fieldset>
         <fieldset><legend>0ページ目</legend>
           <label class="check-label"><input type="checkbox" name="loading_enabled"${loadingScreen.enabled ? " checked" : ""}>表紙の前に準備画面を表示</label>
           <div class="editor-grid"><label>見た目<select name="loading_style">${[["minimal", "ミニマル"], ["pulse", "光のパルス"], ["orbit", "軌道"], ["research-log", "研究ノート"]].map(([value, label]) => `<option value="${value}"${loadingScreen.style === value ? " selected" : ""}>${label}</option>`).join("")}</select></label><label>最低表示時間（ms）<input name="loading_minimum_duration_ms" type="number" min="0" max="5000" step="100" value="${loadingScreen.minimum_duration_ms}"></label></div>
           <div class="loading-style-picker" role="group" aria-label="0ページ目の見た目を選ぶ">${[["minimal", "ミニマル"], ["pulse", "光のパルス"], ["orbit", "軌道"], ["research-log", "研究ノート"]].map(([value, label]) => `<button class="loading-style-pick" type="button" data-loading-style-pick="${value}" aria-pressed="${String(loadingScreen.style === value)}"><span class="loading-wire" aria-hidden="true"></span><span>${label}</span></button>`).join("")}</div>
           <label>案内文<input name="loading_message" maxlength="160" value="${escapeHtml(loadingScreen.message)}"></label>
           <label class="check-label"><input type="checkbox" name="loading_show_progress"${loadingScreen.show_progress ? " checked" : ""}>プリロード件数を表示</label>
           <p class="inherit-note">画像・生成音声・利用可能なフォントを準備し、失敗やタイムアウトがあっても発表は開始できます。</p>
         </fieldset>
         <div class="actions"><button type="submit">発表画面を保存</button><span class="version" data-version-label>v${options.project.version}</span></div><p class="feedback" data-form-feedback aria-live="polite"></p>
       </form>
     </div></details>`;
  const qualitySweepSlides = [
    ...(loadingScreen.enabled
      ? [{
          id: "__prelude__",
          title: "準備画面",
          number: 0,
          max_step: 0,
          href: "#presentation-screen"
        }]
      : []),
    ...slides.map((slide, index) => ({
      id: slide.id,
      title: slide.title,
      number: index + 1,
      max_step: slide.reveal_steps,
      href: `/dashboard/projects/${options.project.project_id}/slides/${slide.id}`
    }))
  ];
  const qualitySweepStepCount = qualitySweepSlides.reduce((total, slide) => total + slide.max_step + 1, 0);
  const savedRenderedQualityItems = renderedQualityCurrent
    ? (options.renderedQualityReport?.measurements ?? [])
        .map((measurement) => {
          const slide = qualitySweepSlides.find((item) => item.id === measurement.slide_id);
          const label = measurement.slide_id === "__prelude__"
            ? "0ページ目"
            : slide === undefined
              ? measurement.slide_id
              : `${slide.number}. ${slide.title}`;
          const href = slide?.href ?? "#rendered-quality";
          const numbers = [
            `最小縮小率 ${measurement.min_fit_scale.toFixed(2)}`,
            measurement.min_contrast_ratio === null
              ? ""
              : `最小コントラスト ${measurement.min_contrast_ratio.toFixed(2)}:1（目安 ${(measurement.min_contrast_required ?? 0).toFixed(1)}）`,
            measurement.min_font_size_px === null
              ? ""
              : `最小文字 ${measurement.min_font_size_px.toFixed(1)}px（目安 ${(measurement.min_font_size_recommended_px ?? 0).toFixed(1)}px）`,
            measurement.overflow_count > 0 ? `はみ出し ${measurement.overflow_count}件` : "",
            measurement.hidden_line_count > 0 ? `省略 ${measurement.hidden_line_count}行` : "",
            measurement.max_overlap_ratio > 0 ? `重なり最大 ${measurement.max_overlap_ratio.toFixed(2)}` : "",
            measurement.fallback_font_count > 0 ? `代替フォント ${measurement.fallback_font_count}件` : ""
          ].filter(Boolean).join(" · ");
          return `<li data-saved-quality-result><a href="${escapeHtml(href)}">${escapeHtml(label)}</a> — ${escapeHtml(numbers)}</li>`;
        })
        .join("")
    : "";
  const qualitySweepPanel = qualitySweepSlides.length === 0
    ? ""
    : `<details class="panel panel-disclosure" id="rendered-quality"${renderedQualityState === "measured" ? "" : " open"}><summary>0ページ目と全スライドの実表示を測定 · ${escapeHtml(renderedQualityLabel)}</summary><div class="disclosure-body quality-sweep"><p class="prose">現在の${escapeHtml(deck?.aspect_ratio ?? "16:9")}の発表枠で${loadingScreen.enabled ? "0ページ目と" : ""}全${slides.length}枚・${qualitySweepStepCount}段階を順番に描画し、自動縮小率、コントラスト比、文字サイズ、はみ出し、省略行数、重なり率を測ります。合否は付けません。数値は同じ研究へ接続したAIが読み、直すかどうかは研究の意図と合わせて判断します。</p><div class="quality-sweep-head"><button type="button" data-op="run" data-quality-sweep data-project-id="${escapeHtml(options.project.project_id)}" data-project-version="${options.project.version}" data-renderer-version="${escapeHtml(PRESENTATION_RENDERER_VERSION)}" data-report-url="/api/projects/${escapeHtml(options.project.project_id)}/quality-report" data-csrf="${escapeHtml(options.csrfToken)}" data-prelude-minimum-ms="${loadingScreen.minimum_duration_ms}" data-slides="${escapeHtml(JSON.stringify(qualitySweepSlides))}" data-frame-url="${escapeHtml(`/dashboard/projects/${options.project.project_id}/slides/${slides[0]?.id}/frame?slide=1&step=0`)}">${renderedQualityState === "missing" ? "測定を開始" : "測定をやり直す"}</button><button type="button" data-op="run" data-quality-sweep-cancel hidden>中断</button><progress data-quality-sweep-progress max="${qualitySweepStepCount}" value="0" hidden>0 / ${qualitySweepStepCount}</progress><span class="feedback" data-quality-sweep-status aria-live="polite">${escapeHtml(renderedQualityLabel)}</span></div><ol class="quality-sweep-results" data-quality-sweep-results>${savedRenderedQualityItems}</ol><div class="quality-sweep-preview" data-quality-sweep-preview style="--quality-sweep-aspect:${(deck?.aspect_ratio ?? "16:9") === "4:3" ? "4 / 3" : "16 / 9"}" hidden><iframe data-quality-sweep-frame title="0ページ目と全スライドの表示確認"></iframe></div></div></details>`;

  return new Response(
    shell(
      `${document.title} — 最自由研究`,
      `${accountHeader(options.twitchLogin, options.csrfToken)}
       <main data-surface="overview" id="main-content" tabindex="-1">
         <a class="back" href="/dashboard">← 自分の研究へ戻る</a>
         <div class="card-top"><span class="version">v${options.project.version}</span></div>
         <h1 class="detail-title">${escapeHtml(document.title)}</h1>
         <p class="lead">${escapeHtml(document.summary || "概要はまだ記入されていません。")}</p>
         <nav class="project-section-nav" aria-label="この研究の編集項目"><a href="#journey">現在地</a><a href="#presentation-structure">スライド</a><a href="#research-images">画像</a><a href="#voice-finishing">音声</a><a href="#publication">プレビューと公開</a></nav>
         ${workflowPanel}
         <div class="detail-flow">
           <section class="panel" id="presentation-structure" tabindex="-1"><div class="section-head"><div><h2>発表構成</h2><p class="inherit-note">一枚ずつ編集するか、実表示と原稿を並べてレビューします。</p></div>${slides.length === 0 ? "" : `<a class="button ghost" href="/dashboard/projects/${escapeHtml(options.project.project_id)}/review?slide=${escapeHtml(slides[0]?.id ?? "")}">全スライドをレビュー</a>`}</div><div class="slide-list">${slideRows}</div>${slideCreateForm}</section>
           ${presentationSettingsPanel}
           <section class="panel" id="research-images" tabindex="-1"><h2>研究画像</h2><p class="meta">${options.assets.length} / ${PROJECT_IMAGE_LIMIT}件 · 圧縮後 ${assetTotalSize} を保存中</p>
             <form class="upload" action="/api/projects/${escapeHtml(options.project.project_id)}/images" data-image-upload data-csrf="${escapeHtml(options.csrfToken)}">
               <label class="upload-dropzone" data-upload-dropzone><span>画像を選択、またはここへドロップ</span><small>JPEG / PNG / 静止WebP</small><input type="file" accept="image/jpeg,image/png,image/webp" required></label>
               <div class="upload-preview" data-upload-preview hidden><img data-upload-preview-image alt="選択した画像の確認"><p><strong data-upload-preview-name></strong><small data-upload-preview-meta></small></p></div>
               <label>画像の説明<input name="alt_text" maxlength="500" placeholder="写真や図が何を示しているか"><small class="inherit-note">発表内容を伝える画像には説明を付けます。純粋な装飾なら空欄にできます。</small></label>
               <div class="upload-actions"><button type="submit">画像を追加</button><span class="meta">JPEG / PNG / 静止WebP、10MiB・40MP・一辺10000pxまで · 保存時に最大2560pxのWebPへ圧縮</span></div>
               <p class="feedback" data-feedback aria-live="polite"></p>
             </form>
             ${assetCards}
             <p class="inherit-note">固定プレビューで実際に使う画像は30件・合計30MiBまでです。未使用画像は公開版へ複製されません。</p>
           </section>
           ${voicePanel}
           ${qualitySweepPanel}
           ${publicationPanel}
           <section class="panel"><details><summary>研究を完全に削除</summary><div class="disclosure-body"><p class="warning">この操作は取り消せません。画像、生成音声、固定プレビュー、公開中の発表がすべて対象になり、公開URLも直ちに無効になります。</p><form class="editor" method="post" action="/dashboard/projects/${escapeHtml(options.project.project_id)}/delete"><input type="hidden" name="csrf_token" value="${escapeHtml(options.csrfToken)}"><input type="hidden" name="expected_version" value="${options.project.version}"><label>削除の確認<input name="confirmation" required pattern="DELETE" autocomplete="off" placeholder="DELETE"><small class="inherit-note">半角大文字で DELETE と入力してください。</small></label><button class="danger" type="submit">この研究を完全に削除</button></form></div></details></section>
           <p class="hint">大きな構成変更はAIクライアント、文言の微調整と確認・公開はこの画面から行えます。</p>
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
    tuning?: Partial<VoicevoxTuning> | null;
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
    effective_tuning: VoicevoxTuning;
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
  page?: number;
  query?: string;
  selectedSegmentKey?: string | null;
  status?: "all" | "ready" | "needs_generation" | "failed";
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
  const defaultProfileTuning = mergeVoicevoxTuning(
    options.voice.default_profile?.tuning ?? undefined
  );
  const profileGroups = new Map<string, typeof VOICEVOX_CATALOG[number][]>();
  for (const profile of VOICEVOX_CATALOG) {
    const entries = profileGroups.get(profile.speakerName) ?? [];
    entries.push(profile);
    profileGroups.set(profile.speakerName, entries);
  }
  const selectedCatalogProfile =
    VOICEVOX_CATALOG.find(
      (profile) =>
        options.voice.default_profile?.id === profile.id ||
        options.voice.default_profile?.label === profile.label
    ) ??
    VOICEVOX_CATALOG.find((profile) => profile.styleId === 3)!;
  const speakerOptions = [...profileGroups.keys()]
    .map(
      (speakerName) =>
        `<option value="${escapeHtml(speakerName)}"${speakerName === selectedCatalogProfile.speakerName ? " selected" : ""}>${escapeHtml(speakerName)}</option>`
    )
    .join("");
  const profileOptions = (profileGroups.get(selectedCatalogProfile.speakerName) ?? [])
    .map(
      (profile) =>
        `<option value="${escapeHtml(profile.id)}"${profile.id === selectedCatalogProfile.id ? " selected" : ""}>${escapeHtml(profile.styleName)}</option>`
    )
    .join("");
  const voiceCatalogData = VOICEVOX_CATALOG.map((profile) => ({
    id: profile.id,
    label: profile.label,
    speakerName: profile.speakerName,
    styleName: profile.styleName
  }));
  const quickProfiles = [3, 2, 8]
    .map((styleId) => VOICEVOX_CATALOG.find((profile) => profile.styleId === styleId))
    .filter((profile): profile is typeof VOICEVOX_CATALOG[number] => profile !== undefined);
  const estimatedNarrationSeconds = Math.ceil(
    options.voice.segments.reduce(
      (total, segment) => total + Math.max(
        1.5,
        segment.text.length / (7 * segment.effective_tuning.speedScale)
      ),
      0
    )
  );
  const generationCharacterCount = options.voice.segments
    .filter((segment) => ["needs_generation", "failed"].includes(segment.status))
    .reduce((total, segment) => total + [...segment.text].length, 0);
  const generationCandidates = options.voice.segments.filter(
    (segment) => ["needs_generation", "failed"].includes(segment.status)
  );
  const generationBatch = selectVoiceGenerationBatch(generationCandidates, (segment) => segment.text);
  const voiceQuery = (options.query ?? "").trim().toLocaleLowerCase("ja");
  const voiceStatus = options.status ?? "all";
  const filteredSegments = options.voice.segments.filter((segment) => {
    const matchesStatus = voiceStatus === "all" || segment.status === voiceStatus ||
      (voiceStatus === "needs_generation" && ["needs_generation", "queued", "failed"].includes(segment.status));
    const searchText = `${segment.slide_title} ${segment.text} ${segment.profile_label ?? defaultProfileLabel} ${segment.speaker ?? ""}`.toLocaleLowerCase("ja");
    return matchesStatus && (voiceQuery.length === 0 || searchText.includes(voiceQuery));
  });
  const voicePageSize = 40;
  const voicePageCount = Math.max(1, Math.ceil(filteredSegments.length / voicePageSize));
  const voicePage = Math.min(Math.max(options.page ?? 1, 1), voicePageCount);
  const pageSegments = filteredSegments.slice((voicePage - 1) * voicePageSize, voicePage * voicePageSize);
  const voiceFilterHref = (status: "all" | "ready" | "needs_generation" | "failed", page = 1) => {
    const query = new URLSearchParams();
    if (status !== "all") query.set("status", status);
    if (voiceQuery.length > 0) query.set("q", options.query?.trim() ?? "");
    if (page > 1) query.set("page", String(page));
    const value = query.toString();
    return value.length > 0 ? `?${value}` : "?";
  };
  const segmentKey = (segment: VoiceFinishState["segments"][number]) =>
    `${segment.slide_id}:${segment.at}`;
  const selectedSegment = pageSegments.find(
    (segment) => segmentKey(segment) === options.selectedSegmentKey
  ) ?? pageSegments.find((segment) =>
    ["needs_generation", "failed"].includes(segment.status)
  ) ?? pageSegments[0];
  const voiceSegmentHref = (segment: VoiceFinishState["segments"][number]) => {
    const query = new URLSearchParams();
    if (voiceStatus !== "all") query.set("status", voiceStatus);
    if (voiceQuery.length > 0) query.set("q", options.query?.trim() ?? "");
    if (voicePage > 1) query.set("page", String(voicePage));
    query.set("segment", segmentKey(segment));
    return `?${query.toString()}#voice-segment-${encodeURIComponent(segment.slide_id)}-${segment.at}`;
  };
  const segmentList = pageSegments.length
    ? pageSegments
        .map((segment, index) => {
          const statusLabel =
            VOICE_SEGMENT_STATUS_LABELS[segment.status] ?? segment.status;
          const generated = segment.audio_url !== null;
          const selected = selectedSegment !== undefined &&
            segmentKey(segment) === segmentKey(selectedSegment);
          const tuningDetails = selected
            ? (Object.keys(TUNING_LABELS) as Array<keyof VoicevoxTuning>)
                .map((key) => `<dt>${TUNING_LABELS[key]}</dt><dd>${segment.effective_tuning[key]}</dd>`)
                .join("")
            : "";
          const searchPreview = segment.text.replace(/\s+/g, " ").slice(0, 160);
          const body = selected
            ? `<div class="voice-review-body"><p>${escapeHtml(segment.text)}</p><details class="component-detail"><summary>実効調声を確認</summary><dl class="setting-table">${tuningDetails}</dl></details>${generated ? `<div class="voice-audio-timeline"><input type="range" min="0" max="0" step="0.05" value="0" data-voice-preview-seek aria-label="生成音声の再生位置" disabled><output data-voice-preview-time>00:00 / --:--</output></div>` : ""}<div class="actions"><button class="voice-play" type="button" data-voice-preview data-audio-url="${escapeHtml(segment.audio_url ?? "")}" data-voice-text="${escapeHtml(segment.text)}" data-effective-tuning="${escapeHtml(JSON.stringify(segment.effective_tuning))}" aria-pressed="false">${generated ? "生成音声を試聴" : "ブラウザ音声で仮試聴"}</button><a class="button ghost" href="/dashboard/projects/${projectId}/slides/${escapeHtml(segment.slide_id)}?step=${segment.at}&narration=${segment.at}#narration-segment-${segment.at}">この区間を編集</a></div><p class="feedback" data-voice-preview-feedback aria-live="polite"></p></div>`
            : `<div class="voice-review-body"><p class="inherit-note">${segment.text.length.toLocaleString("ja-JP")}文字の原稿です。選択すると全文・実効調声・試聴操作を表示します。</p><div class="actions"><a class="button ghost" data-voice-select="voice-segment-${escapeHtml(segment.slide_id)}-${segment.at}" href="${escapeHtml(voiceSegmentHref(segment))}">この区間を選択</a></div></div>`;
          return `<details class="voice-review" id="voice-segment-${escapeHtml(segment.slide_id)}-${segment.at}"${selected ? " open" : ""} data-voice-segment data-state="${escapeHtml(segment.status)}" data-search-text="${escapeHtml(`${segment.slide_title} ${searchPreview} ${segment.profile_label ?? defaultProfileLabel} ${segment.speaker ?? ""}`.toLocaleLowerCase("ja"))}"${selected ? ' data-selected="true"' : ""}>
            <summary><span class="component-step">${String((voicePage - 1) * voicePageSize + index + 1).padStart(2, "0")}</span><span class="voice-review-title"><strong>${escapeHtml(segment.slide_title)} · STEP ${segment.at}</strong><small>${escapeHtml(segment.profile_label ?? defaultProfileLabel)}${segment.speaker ? ` · ${escapeHtml(segment.speaker)}` : ""}</small></span><span class="voice-status ${escapeHtml(segment.status)}">${escapeHtml(statusLabel)}</span></summary>
            ${body}
          </details>`;
        })
        .join("")
    : options.voice.segments.length === 0
      ? `<section class="empty"><h2>読み上げ原稿がありません</h2><p>先にAIクライアントまたはスライド編集画面から、読み上げ区間を追加してください。</p></section>`
      : `<section class="empty"><h2>条件に一致する区間がありません</h2><p>検索語または状態を変更してください。</p></section>`;
  const voicePager = voicePageCount <= 1
    ? ""
    : `<nav class="voice-pager" aria-label="読み上げ区間のページ">${voicePage > 1 ? `<a class="button ghost" href="${escapeHtml(voiceFilterHref(voiceStatus, voicePage - 1))}">← 前へ</a>` : ""}<span>${voicePage} / ${voicePageCount}ページ · ${filteredSegments.length}件</span>${voicePage < voicePageCount ? `<a class="button ghost" href="${escapeHtml(voiceFilterHref(voiceStatus, voicePage + 1))}">次へ →</a>` : ""}</nav>`;
  const generateDisabled =
    !options.voice.configured ||
    summary.needs_generation === 0 ||
    jobActive ||
    generationBatch.selected.length === 0;
  return new Response(
    shell(
      `音声を仕上げる — ${options.project.document.title}`,
      `${accountHeader(options.twitchLogin, options.csrfToken)}
         <main data-surface="monitor" id="main-content" tabindex="-1" data-voice-page data-project-id="${projectId}" data-version="${options.voice.version}" data-voice-configured="${String(options.voice.configured)}" data-voice-ready="${summary.ready}" data-csrf="${escapeHtml(options.csrfToken)}" data-summary-url="/api/projects/${projectId}/voice" data-default-tuning="${escapeHtml(JSON.stringify(DEFAULT_VOICEVOX_TUNING))}">
         <a class="back" href="/dashboard/projects/${projectId}">← 研究詳細へ戻る</a>
         <section class="voice-hero"><div><p class="eyebrow">Voice finishing</p><h1>音声を仕上げる</h1><p class="lead">VOICEVOXの話者とスタイルを選び、不足している読み上げ音声を生成して、区間ごとに確認できます。</p></div><a class="button ghost" href="/dashboard/projects/${projectId}#publication">プレビューと公開へ</a></section>
         <div class="voice-flow">
           <div class="voice-column">
             <section class="panel voice-step"><div class="voice-step-head"><span class="voice-step-number">1</span><div><h2>声を決める</h2><p>40話者・118種類のトークスタイルから発表全体の既定音声を選べます。最初は「ずんだもん・ノーマル」がおすすめです。</p></div></div>
               <div class="voice-quick" aria-label="おすすめの声">${quickProfiles.map((profile) => `<button type="button" data-op="edit" data-voice-pick="${escapeHtml(profile.id)}">${escapeHtml(profile.label)}</button>`).join("")}</div>
               <form data-voice-selection-form data-initial-profile="${escapeHtml(selectedCatalogProfile.id)}"><div class="voice-preset"><span class="voice-character" aria-hidden="true">声</span><div><strong>既定の話者・スタイル</strong><div class="voice-preset-fields"><label>話者<select data-voice-speaker>${speakerOptions}</select></label><label>スタイル<select data-voice-profile data-voice-catalog="${escapeHtml(JSON.stringify(voiceCatalogData))}">${profileOptions}</select></label></div><small>区間ごとの声と7種の調声値は、各スライドの読み上げ設定で変更できます。</small></div><span class="stage">${options.voice.configured ? "設定済み" : "おすすめ"}</span></div>
               <div class="actions"><button type="button" data-op="run" data-voicevox-sample="/api/projects/${projectId}/voice/sample" aria-pressed="false">選択中の声をVOICEVOXで試聴</button><button type="button" data-op="edit" data-voice-setup="/api/projects/${projectId}/voice/profile"${jobActive ? " disabled" : ""}>${options.voice.configured ? "選択した声へ変更" : "この声を使う"}</button></div><p class="feedback" data-voicevox-sample-feedback aria-live="polite">話者・スタイルと7種の調声を実際のVOICEVOXで確認します。初回はContainer起動に時間がかかる場合があります。</p><p class="feedback${options.voice.configured ? " success" : ""}" data-voice-setup-feedback aria-live="polite">${options.voice.configured ? `現在の既定音声は「${escapeHtml(defaultProfileLabel)}」です。声を変えると該当区間の再生成が必要になります。` : "設定すると個別の声を指定していない読み上げ区間へ自動的に適用されます。"}</p></form>
               ${options.voice.configured ? `<details class="component-detail"><summary>既定のトーンを細かく調整</summary><form class="editor" data-voice-profile-tuning data-default-tuning="${escapeHtml(JSON.stringify(DEFAULT_VOICEVOX_TUNING))}" action="/api/projects/${projectId}/voice/profile/tuning"><div class="tuning-grid">${(Object.keys(DEFAULT_VOICEVOX_TUNING) as Array<keyof VoicevoxTuning>).map((key) => `<label>${TUNING_LABELS[key]}<input name="tuning_${key}" type="number" min="${VOICEVOX_TUNING_LIMITS[key].min}" max="${VOICEVOX_TUNING_LIMITS[key].max}" step="0.01" required value="${defaultProfileTuning[key]}"></label>`).join("")}</div><p class="inherit-note">profile未指定の区間へ共通で適用されます。保存すると、この声を使う生成済み音声は再生成が必要です。ブラウザ仮試聴は話速・高さ・音量の近似で、抑揚・間・前後無音はVOICEVOX生成後に確認します。</p><div class="actions"><button type="button" data-op="run" data-voice-profile-tuning-preview aria-pressed="false">ブラウザで仮試聴</button><button type="button" data-op="edit" data-voice-profile-tuning-reset>VOICEVOX標準値へ戻す</button><button type="submit"${jobActive ? " disabled" : ""}>既定のトーンを保存</button></div><p class="feedback" data-voice-profile-tuning-feedback aria-live="polite"></p></form></details>` : ""}
             </section>
             <section class="panel voice-step"><div class="voice-step-head"><span class="voice-step-number">2</span><div><h2>不足分を生成する</h2><p>設定や原稿が変わった区間だけを生成します。生成済みの音声は再利用します。</p></div></div>
               <div class="voice-stats"><div class="voice-stat"><span>原稿</span><strong data-voice-total>${summary.total}</strong></div><div class="voice-stat"><span>音声概算</span><strong>${formatDuration(estimatedNarrationSeconds)}</strong></div><div class="voice-stat"><span>次の生成</span><strong>${generationBatch.totalCharacters.toLocaleString()}字</strong></div><div class="voice-stat ready"><span>生成済み</span><strong data-voice-ready>${summary.ready}</strong></div><div class="voice-stat pending"><span>要生成<small>失敗含む</small></span><strong data-voice-needed>${summary.needs_generation}</strong></div><div class="voice-stat"><span>失敗</span><strong data-voice-failed>${summary.failed}</strong></div></div>
               <div class="actions"><button type="button" data-op="run" data-voice-generate="/api/projects/${projectId}/voice/jobs"${generateDisabled ? " disabled" : ""}>${jobActive ? "生成中です" : summary.total === 0 ? "読み上げ原稿がありません" : generationBatch.selected.length > 0 ? `次の${generationBatch.selected.length}区間を生成` : generationBatch.oversized.length > 0 ? "500文字を超える原稿を分割してください" : "すべて生成済み"}</button></div><p class="feedback${generationBatch.oversized.length > 0 ? " warning" : ""}" data-voice-generate-feedback aria-live="polite">${!options.voice.configured ? "先に声を設定してください。" : summary.total === 0 ? "各スライドへ読み上げ原稿を追加すると生成できます。" : summary.needs_generation === 0 ? "生成が必要な区間はありません。" : `${generationBatch.selected.length}区間・${generationBatch.totalCharacters.toLocaleString()} / ${MAX_JOB_CHARACTERS.toLocaleString()}字を次に生成します。${generationCharacterCount > generationBatch.totalCharacters ? `完了後、残り${(generationCharacterCount - generationBatch.totalCharacters).toLocaleString()}字はもう一度生成できます。` : ""}${generationBatch.oversized.length > 0 ? `${generationBatch.oversized.length}区間は${MAX_SEGMENT_CHARACTERS}文字を超えるため、区間を分けてください。` : ""} 生成中もこの画面を閉じて構いません。`}</p>
               ${voiceJobCard(currentJob)}
             </section>
             <section class="panel voice-step"><div class="voice-step-head"><span class="voice-step-number">3</span><div><h2>区間ごとに試聴する</h2><p>生成済み音声を確認できます。未生成の区間はブラウザ音声で仮試聴します。</p></div></div><form class="voice-filter" method="get" aria-label="区間の絞り込み"><div class="voice-search-row"><input class="voice-search" type="search" name="q" value="${escapeHtml(options.query ?? "")}" data-voice-search placeholder="スライド名・原稿・声を検索" autocomplete="off"><input type="hidden" name="status" value="${voiceStatus === "all" ? "" : voiceStatus}"><button type="submit">全区間から検索</button></div><div class="voice-filter-tabs" role="group" aria-label="音声の生成状態"><a class="button ghost" data-voice-filter="all" href="${escapeHtml(voiceFilterHref("all"))}"${voiceStatus === "all" ? ' aria-current="page"' : ""}>すべて ${summary.total}</a><a class="button ghost" data-voice-filter="needs_generation" href="${escapeHtml(voiceFilterHref("needs_generation"))}"${voiceStatus === "needs_generation" ? ' aria-current="page"' : ""}>要生成（失敗含む） ${summary.needs_generation}</a><a class="button ghost" data-voice-filter="ready" href="${escapeHtml(voiceFilterHref("ready"))}"${voiceStatus === "ready" ? ' aria-current="page"' : ""}>生成済み ${summary.ready}</a><a class="button ghost" data-voice-filter="failed" href="${escapeHtml(voiceFilterHref("failed"))}"${voiceStatus === "failed" ? ' aria-current="page"' : ""}>失敗 ${summary.failed}</a></div><output class="voice-result-count" data-voice-visible aria-live="polite">${pageSegments.length} / ${filteredSegments.length}件表示</output></form><p class="search-empty" data-voice-filter-empty hidden>このページ内で一致する読み上げ区間はありません。全区間から探すには検索ボタンを押してください。</p><div class="voice-segment-list" data-voice-segments>${segmentList}</div>${voicePager}</section>
           </div>
           <aside class="panel voice-next"><p class="eyebrow">Next step</p><h2>確認できたら</h2><ol><li>必要な区間だけVOICEVOXを生成</li><li>気になる区間を試聴</li><li>固定プレビューを作成</li><li>プレビューを確認して公開</li></ol><a class="button" href="/dashboard/projects/${projectId}#publication">プレビューと公開へ進む</a><p class="inherit-note">${options.voice.configured ? "VOICEVOXを設定した発表は、固定プレビューを作る前に全区間の生成が必要です。編集画面のブラウザ音声は仮試聴に使えます。" : "VOICEVOXを設定しない場合、固定プレビューはブラウザ音声で読み上げます。"}</p></aside>
         </div>
       </main><script src="${DASHBOARD_SCRIPT_SRC}" defer></script>`
    ),
    { headers: headers() }
  );
}

function reviewSourceTextHtml(
  source: ReturnType<typeof flattenSlideReviewSources>[number],
  project: ProjectRecord,
  comments: ReviewComment[]
): string {
  const ranges = comments
    .filter((comment) => comment.target_key === source.key && comment.status === "open")
    .map((comment) => ({ comment, anchor: reviewCommentWithAnchor(project, comment).anchor }))
    .filter((item) => item.anchor.start !== null && item.anchor.end !== null && item.anchor.state !== "stale")
    .sort((left, right) => (left.anchor.start ?? 0) - (right.anchor.start ?? 0));
  const parts: string[] = [];
  let cursor = 0;
  for (const item of ranges) {
    const start = item.anchor.start ?? 0;
    const end = item.anchor.end ?? start;
    if (start < cursor) continue;
    parts.push(escapeHtml(source.text.slice(cursor, start)));
    parts.push(`<mark title="未解決コメント: ${escapeHtml(item.comment.body.slice(0, 120))}">${escapeHtml(source.text.slice(start, end))}</mark>`);
    cursor = end;
  }
  parts.push(escapeHtml(source.text.slice(cursor)));
  return parts.join("");
}

export function slideReviewPage(options: {
  twitchLogin: string;
  csrfToken: string;
  project: ProjectRecord;
  slideId: string;
  comments: ReviewComment[];
}): Response {
  const deck = options.project.document.deck;
  const slideIndex = deck?.slides.findIndex((slide) => slide.id === options.slideId) ?? -1;
  if (deck === null || slideIndex === -1) return projectNotFoundPage();
  const slide = deck.slides[slideIndex];
  if (slide === undefined) return projectNotFoundPage();
  const projectId = options.project.project_id;
  const currentComments = options.comments.filter((comment) => comment.slide_id === slide.id);
  const currentOpenComments = currentComments.filter((comment) => comment.status === "open");
  const commentsBySlide = new Map<string, number>();
  for (const comment of options.comments) {
    if (comment.status === "open") commentsBySlide.set(comment.slide_id, (commentsBySlide.get(comment.slide_id) ?? 0) + 1);
  }
  const sources = flattenSlideReviewSources(slide);
  const textSources = sources.filter((source) => source.key !== "slide:whole");
  const filmstrip = deck.slides.map((item, index) => {
    const count = commentsBySlide.get(item.id) ?? 0;
    return `<a class="filmstrip-link" href="/dashboard/projects/${escapeHtml(projectId)}/review?slide=${escapeHtml(item.id)}" data-active="${String(item.id === slide.id)}"${item.id === slide.id ? ' aria-current="page"' : ""}><span>${String(index + 1).padStart(2, "0")}</span><strong>${escapeHtml(item.title)}<small class="filmstrip-meta">${item.composition?.mode ?? "flow"} · ${item.reveal_steps + 1}段階</small></strong><span class="review-count" data-empty="${String(count === 0)}" aria-label="未解決コメント${count}件">${count}</span></a>`;
  }).join("");
  const sourceCards = textSources.map((source) => {
    const kindLabel = source.kind === "narration" ? "音声原稿" : "画面テキスト";
    const step = source.step === null ? "" : `<small>STEP ${source.step}</small>`;
    return `<article class="review-source" data-review-source data-source-key="${escapeHtml(source.key)}" data-source-label="${escapeHtml(source.label)}" data-kind="${escapeHtml(source.kind)}"><div class="review-source-meta"><span class="review-kind">${kindLabel}</span><strong>${escapeHtml(source.label)}</strong>${step}</div><pre class="review-source-text" data-review-text tabindex="0">${reviewSourceTextHtml(source, options.project, currentComments)}</pre></article>`;
  }).join("");
  const anchorLabels = { whole: "対象全体", current: "現在位置", moved: "位置を再発見", stale: "要再指定" } as const;
  let initiallySelectedOpenComments = 0;
  const commentCards = currentComments.length === 0
    ? '<p class="review-empty" data-review-empty>このスライドにはまだコメントがありません。中央の文章を選択するか、スライド全体を対象にして追加できます。</p>'
    : currentComments.map((comment) => {
      const anchor = reviewCommentWithAnchor(options.project, comment).anchor;
      const quote = comment.selected_text.length === 0
        ? ""
        : `<p class="review-quote">「${escapeHtml(comment.selected_text.slice(0, 500))}${comment.selected_text.length > 500 ? "…" : ""}」</p>`;
      const checked = comment.status === "open" && initiallySelectedOpenComments < 20 ? " checked" : "";
      if (comment.status === "open") initiallySelectedOpenComments += 1;
      const statusAction = comment.status === "open" ? "resolved" : "open";
      const statusLabel = comment.status === "open" ? "解決済みにする" : "未解決へ戻す";
      return `<article class="review-card" id="review-comment-${escapeHtml(comment.id)}" data-review-comment data-comment-id="${escapeHtml(comment.id)}" data-status="${escapeHtml(comment.status)}"><div class="review-card-head"><label><input type="checkbox" data-review-script-comment value="${escapeHtml(comment.id)}"${checked}${comment.status === "resolved" ? " disabled" : ""}><span>${escapeHtml(comment.target_label)}<small class="filmstrip-meta">v${comment.project_version}で追加</small></span></label><span class="anchor-state" data-state="${escapeHtml(anchor.state)}">${anchorLabels[anchor.state]}</span></div>${quote}<p>${escapeHtml(comment.body)}</p><div class="review-card-actions"><button type="button" data-review-status="${statusAction}" data-action-url="/api/projects/${escapeHtml(projectId)}/review-comments/${escapeHtml(comment.id)}" data-csrf="${escapeHtml(options.csrfToken)}">${statusLabel}</button><button class="danger" type="button" data-review-delete data-action-url="/api/projects/${escapeHtml(projectId)}/review-comments/${escapeHtml(comment.id)}" data-csrf="${escapeHtml(options.csrfToken)}">削除</button></div></article>`;
    }).join("");
  const initialInstruction = currentOpenComments.length === 0
    ? ""
    : buildReviewRepairInstruction(options.project, currentOpenComments);
  const aspect = (deck.aspect_ratio ?? "16:9") === "4:3" ? "4 / 3" : "16 / 9";
  return new Response(
    shell(
      `${slide.title} — レビュー`,
      `${accountHeader(options.twitchLogin, options.csrfToken)}
       <main data-surface="review" id="main-content" tabindex="-1" data-review-page data-project-id="${escapeHtml(projectId)}" data-slide-id="${escapeHtml(slide.id)}" data-csrf="${escapeHtml(options.csrfToken)}" data-comment-url="/api/projects/${escapeHtml(projectId)}/slides/${escapeHtml(slide.id)}/review-comments" data-script-url="/api/projects/${escapeHtml(projectId)}/review-instruction">
         <a class="back" href="/dashboard/projects/${escapeHtml(projectId)}">← 研究詳細へ戻る</a>
         <div class="workspace-head"><div><p class="eyebrow">Slide review · ${slideIndex + 1} / ${deck.slides.length}</p><h1>${escapeHtml(slide.title)}</h1><p class="lead">実表示を見ながら、画面テキストと音声原稿へ範囲付きコメントを残します。</p></div><div class="workspace-version"><span class="stage">未解決 ${currentOpenComments.length}</span><a class="button ghost" href="/dashboard/projects/${escapeHtml(projectId)}/slides/${escapeHtml(slide.id)}">編集画面へ</a></div></div>
         <div class="review-workspace">
           <nav class="review-filmstrip" aria-label="レビューするスライド"><div class="filmstrip-search"><span class="filmstrip-search-head"><span>スライド</span><output>${deck.slides.length}枚</output></span></div><div class="review-filmstrip-list">${filmstrip}</div></nav>
           <div class="review-center">
             <section class="panel review-preview"><div class="workspace-frame" style="--workspace-aspect:${aspect}"><span class="frame-loading" data-frame-loading role="status">プレビューを読み込み中…</span><iframe title="${escapeHtml(slide.title)}の実表示" src="/dashboard/projects/${escapeHtml(projectId)}/slides/${escapeHtml(slide.id)}/frame?slide=${slideIndex + 1}&step=${slide.reveal_steps}" data-slide-frame></iframe></div></section>
             <section class="panel"><div class="section-head"><div><p class="eyebrow">Flat source</p><h2>画面の文章と音声原稿</h2></div><span class="count">${textSources.length}項目</span></div><p class="review-select-hint">コメントしたい文字を一つの枠内で選び、近くに出る「コメントを追加」を押してください。Markdown記号を含む保存データをそのまま表示するため、AIが修正する場所と一致します。</p><div class="review-source-list">${sourceCards}</div></section>
             <section class="review-comments" aria-label="コメントとAI修正依頼文">
             <form class="review-composer" data-review-composer><div><p class="eyebrow">New comment</p><h2>コメントを追加</h2></div><p class="review-selection" data-review-selection>スライド全体へのコメントです。中央の文字を選ぶと範囲を指定できます。</p><input type="hidden" name="target_key" value="slide:whole"><input type="hidden" name="range_start"><input type="hidden" name="range_end"><input type="hidden" name="selected_text"><label>指摘・修正してほしいこと<textarea name="body" maxlength="4000" required placeholder="例: 結論を先に示し、根拠との関係が一読で分かる表現にしてください。"></textarea></label><div class="actions"><button type="submit">コメントを追加</button><button type="button" data-review-whole>スライド全体に戻す</button></div><p class="feedback" data-review-feedback aria-live="polite"></p></form>
             <section class="panel"><div class="section-head"><h2>コメント</h2><span class="count">${currentComments.length}件</span></div><div data-review-comment-list>${commentCards}</div></section>
             <section class="review-script"><div><h2>AI修正依頼文</h2><p class="review-select-hint">チェックした未解決コメントを最大20件まで、Codex・ChatGPT・Claudeへ安全に渡せる依頼文にします。これは実行コードではありません。</p></div><div class="actions"><button type="button" data-op="ask" data-review-script-generate${currentOpenComments.length === 0 ? " disabled" : ""}>選択から生成</button><button type="button" data-review-script-copy${currentOpenComments.length === 0 ? " disabled" : ""}>コピー</button></div><textarea readonly data-review-script-output placeholder="未解決コメントを追加すると、ここにAI修正依頼文が表示されます。">${escapeHtml(initialInstruction)}</textarea><p class="feedback" data-review-script-feedback aria-live="polite">${currentOpenComments.length > 0 ? `${Math.min(currentOpenComments.length, 20)}件を含む依頼文です。${currentOpenComments.length > 20 ? "残りはチェックを切り替えて別の依頼文にしてください。" : ""}` : "未解決コメントを追加すると生成できます。"}</p></section>
             </section>
           </div>
         </div>
         <div class="review-selection-toolbar" data-review-selection-toolbar data-placement="above" role="toolbar" aria-label="選択した文章への操作" hidden><button type="button" data-review-selection-action aria-keyshortcuts="Control+Alt+M Meta+Alt+M"><span class="review-selection-icon" aria-hidden="true">＋</span><span data-review-selection-action-label>コメントを追加</span></button></div>
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
  selectedComponentId?: string | null;
  selectedNarrationAt?: number | null;
  assets?: ProjectAsset[];
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
  const currentSlideDashboardPath = `${slideDashboardPath}${escapeHtml(slide.id)}`;
  const projectPath = `/api/projects/${escapeHtml(options.project.project_id)}`;
  const slidePath = `${projectPath}/slides/${escapeHtml(slide.id)}`;
  const slideActionPath = `${slidePath}/actions`;
  const filmstrip = deck.slides
    .map(
      (item, index) => {
        const narrationSegments = item.narration?.segments ?? [];
        const readyVoiceSegments = narrationSegments.filter((segment) => segment.audio_src).length;
        const voiceStatus = narrationSegments.length === 0
          ? "原稿なし"
          : `音声 ${readyVoiceSegments}/${narrationSegments.length}`;
        const roleLabel = SLIDE_ROLE_LABELS[item.role ?? "content"];
        const searchText = `${item.title} ${roleLabel} ${slideCompositionLabel(item)} ${voiceStatus}`.toLocaleLowerCase("ja");
        return `<a class="filmstrip-link" data-filmstrip-slide data-search-text="${escapeHtml(searchText)}" data-slide-title="${escapeHtml(item.title.toLocaleLowerCase("ja"))}" data-role-label="${roleLabel}" data-active="${String(index === slideIndex)}"${index === slideIndex ? ' aria-current="page"' : ""} href="/dashboard/projects/${escapeHtml(options.project.project_id)}/slides/${escapeHtml(item.id)}"><span>${String(index + 1).padStart(2, "0")}</span><strong><span data-filmstrip-title>${escapeHtml(item.title)}</span><small class="stage" data-filmstrip-role>${roleLabel}</small><small class="filmstrip-meta"><span data-filmstrip-duration>${item.duration_seconds}秒</span> · ${item.reveal_steps + 1}段階 · ${escapeHtml(slideCompositionLabel(item))}<br>${voiceStatus}</small></strong></a>`;
      }
    )
    .join("");
  const sceneNodes = slide.composition?.mode === "scene" ? slide.composition.nodes : [];
  const selectedSceneNode = slide.composition?.mode === "scene"
    ? sceneNodes.find((node) => node.id === options.selectedComponentId) ?? sceneNodes[0] ?? null
    : null;
  const canvasBlocks = slide.composition?.mode === "canvas" ? slide.composition.blocks : [];
  const selectedCanvasBlock = slide.composition?.mode === "canvas"
    ? canvasBlocks.find((block) => block.id === options.selectedComponentId) ?? canvasBlocks[0] ?? null
    : null;
  const selectedComponentId = selectedSceneNode?.id ?? selectedCanvasBlock?.id ?? null;
  const componentOutline =
    slide.composition?.mode === "scene"
      ? sceneComponentOutline(slide.composition.nodes, selectedComponentId, currentSlideDashboardPath)
      : slide.composition?.mode === "canvas"
        ? `<ul class="component-outline" id="component-outline">${slide.composition.blocks
            .map(
              (block) => `<li><a class="component-outline-row" data-component-select="${escapeHtml(block.id)}" href="${escapeHtml(`${currentSlideDashboardPath}?component=${encodeURIComponent(block.id)}`)}"${block.id === selectedComponentId ? ' aria-current="true"' : ""}><code>${escapeHtml(block.kind)}</code><span>${escapeHtml(block.id)}<small>x ${block.frame.x}% · y ${block.frame.y}%</small></span><span class="component-step">STEP ${block.at}</span></a></li>`
            )
            .join("")}</ul>`
        : `<p class="mode-note">定型レイアウトです。本文、段階表示、補足欄から構成されます。下の選択から自由配置または入れ子のリッチ構成を開始できます。</p>`;
  const componentCount = sceneNodes.length + canvasBlocks.length;
  const componentTreeActions = sceneNodes.some((node) => node.parent_id !== null)
    ? '<div class="component-search-actions"><button type="button" data-component-tree-expand-all aria-controls="component-outline">すべて展開</button><button type="button" data-component-tree-collapse-all aria-controls="component-outline">まとまりを折りたたむ</button><output data-component-tree-status aria-live="polite"></output></div>'
    : "";
  const componentSearch = componentCount === 0
    ? ""
    : `<label class="component-search">構成を絞り込む<span class="component-search-row"><input type="search" data-component-search placeholder="ID・種類・階層" autocomplete="off"><output data-component-search-count aria-live="polite">${componentCount} / ${componentCount}件</output></span></label>${componentTreeActions}<p class="filmstrip-empty" data-component-search-empty hidden>一致する表示パーツはありません。</p>`;
  const modeNote =
    slide.composition?.mode === "scene"
      ? "登録済みの表示パーツで構成されています。AIから一件ずつ構造を編集でき、この画面では内容、並び方、表示STEP、アニメーション、画像、配色、余白、文字倍率を実表示で調整できます。"
      : slide.composition?.mode === "canvas"
        ? "自由配置の表示パーツです。この画面で内容、画像、位置、大きさ、重なり、表示STEP、アニメーション、見た目を調整できます。入れ子が必要な場合はAIからリッチ構成へ移行できます。"
        : "本文と補足欄を使う定型レイアウトです。";
  const sceneHierarchyIndex = createSceneHierarchyIndex(sceneNodes);
  const workspaceAssetUrls = Object.fromEntries((options.assets ?? []).map((asset) => [asset.asset_id, asset.content_url]));
  const sceneComponentEditors = selectedSceneNode === null
    ? ""
    : [selectedSceneNode]
        .map((node) => {
          const fields = sceneTextFields(node);
          const descendantCount = sceneDescendantIds(node.id, sceneHierarchyIndex).size;
          const affectedCount = descendantCount + 1;
          const hierarchyControls = sceneComponentHierarchyControls(node, sceneNodes, sceneHierarchyIndex);
          const controls = sceneComponentContentControls(node, slide.reveal_steps);
          const kindControls = sceneComponentKindControls(node, options.assets ?? []);
          const appearanceControls = sceneComponentAppearanceControls(node, slide.reveal_steps);
          return `<details class="component-detail" open><summary>${escapeHtml(node.id)} · uf-${escapeHtml(node.kind.replaceAll("_", "-"))} の${fields.length > 0 ? "内容と見た目" : "見た目"}</summary><form class="editor" data-scene-component-editor data-component-id="${escapeHtml(node.id)}" data-versioned-form action="${slidePath}/components/${escapeHtml(node.id)}" data-version="${options.project.version}" data-component="${escapeHtml(JSON.stringify(node))}" data-csrf="${escapeHtml(options.csrfToken)}">${hierarchyControls}${controls}${kindControls}${appearanceControls}${descendantCount > 0 ? `<p class="operation-summary"><strong>まとまりとして操作</strong><span>このパーツと子孫 ${descendantCount}件を一緒に扱います。</span></p>` : ""}<div class="actions"><button type="submit">この表示パーツを保存</button><button type="button" data-scene-component-action="duplicate" data-affected-count="${affectedCount}" data-action-url="${slidePath}/components/${escapeHtml(node.id)}/actions">${descendantCount > 0 ? `まとまりを複製（${affectedCount}パーツ）` : "複製"}</button><button class="danger" type="button" data-scene-component-action="${descendantCount > 0 ? "delete_tree" : "delete"}" data-affected-count="${affectedCount}" data-action-url="${slidePath}/components/${escapeHtml(node.id)}/actions">${descendantCount > 0 ? `まとまりごと削除（${affectedCount}パーツ）` : "削除"}</button><span class="version" data-version-label>v${options.project.version}</span></div><p class="feedback" data-form-feedback aria-live="polite"></p></form></details>`;
        })
        .join("");
  const sceneComponentCreate = slide.composition?.mode === "scene"
    ? sceneComponentCreator({
        nodes: slide.composition.nodes,
        assets: options.assets ?? [],
        action: `${slidePath}/components`,
        version: options.project.version,
        csrfToken: options.csrfToken
      })
    : "";
  const scenePatternCreate = slide.composition?.mode === "scene"
    ? scenePatternCreator({
        nodes: slide.composition.nodes,
        action: `${slidePath}/patterns`,
        version: options.project.version,
        csrfToken: options.csrfToken
      })
    : "";
  const canvasBlockEditors = selectedCanvasBlock === null
    ? ""
    : canvasBlockEditor({
        block: selectedCanvasBlock,
        assets: options.assets ?? [],
        action: `${slidePath}/blocks/${escapeHtml(selectedCanvasBlock.id)}`,
        version: options.project.version,
        csrfToken: options.csrfToken,
        maxStep: slide.reveal_steps
      });
  const canvasBlockCreator = slide.composition?.mode === "canvas"
    ? `<details class="component-detail"><summary>表示パーツを追加</summary><form class="editor" data-canvas-block-create data-versioned-form data-method="POST" action="${slidePath}/blocks" data-version="${options.project.version}" data-csrf="${escapeHtml(options.csrfToken)}"><div class="editor-grid"><label>種類<select name="kind"><option value="markdown">テキスト</option><option value="shape">図形</option><option value="image"${(options.assets ?? []).length === 0 ? " disabled" : ""}>画像${(options.assets ?? []).length === 0 ? "（画像を先に追加）" : ""}</option></select></label><label>画像パーツで使用する画像<select name="asset_id"><option value="">選択してください</option>${(options.assets ?? []).map((asset) => `<option value="${escapeHtml(asset.asset_id)}">${escapeHtml(asset.alt_text || asset.original_filename)}</option>`).join("")}</select></label></div><p class="inherit-note">追加後に内容、位置、大きさ、重なり順、見た目を調整できます。</p><div class="actions"><button type="submit">表示パーツを追加</button><span class="version" data-version-label>v${options.project.version}</span></div><p class="feedback" data-form-feedback aria-live="polite"></p></form></details>`
    : "";
  const workspaceSlideCreator = slideCreator({
    action: `${projectPath}/slides`,
    version: options.project.version,
    csrfToken: options.csrfToken,
    slideCount: deck.slides.length,
    defaultPosition: slideIndex + 1
  });
  const compositionEditor = slide.composition === null || slide.composition === undefined
    ? `<form class="editor" data-composition-create data-versioned-form data-method="POST" action="${slidePath}/composition" data-version="${options.project.version}" data-csrf="${escapeHtml(options.csrfToken)}"><fieldset><legend>自由な構成を開始</legend><label class="check-label"><input name="composition_mode" type="radio" value="canvas" checked><span><strong>自由配置</strong><small class="inherit-note">本文と補足を独立したテキスト枠へ変換し、座標・大きさを直接調整します。</small></span></label><label class="check-label"><input name="composition_mode" type="radio" value="scene"><span><strong>リッチ構成</strong><small class="inherit-note">本文と補足を入れ子の表示パーツへ変換し、stack・grid・グラフなどを追加できます。</small></span></label><p class="inherit-note">現在の本文と補足欄は残したまま表示パーツへコピーします。開始後も元の文章は内容欄から確認できます。</p></fieldset><div class="actions"><button type="submit">選んだ自由構成を開始</button><span class="version" data-version-label>v${options.project.version}</span></div><p class="feedback" data-form-feedback aria-live="polite"></p></form>`
    : `<form class="editor" data-composition-editor data-versioned-form action="${slidePath}" data-version="${options.project.version}" data-slide-id="${escapeHtml(slide.id)}" data-csrf="${escapeHtml(options.csrfToken)}"><fieldset><legend>構成全体の表示</legend><label>背景色<span class="color-control"><input name="composition_background" type="color" value="${escapeHtml(slide.composition.background)}" aria-label="構成全体の背景色を色見本から選ぶ"><input type="text" value="${escapeHtml(slide.composition.background)}" data-color-text="composition_background" aria-label="構成全体の背景色のHEX値" pattern="#[0-9A-Fa-f]{6}" maxlength="7" spellcheck="false"></span></label><label class="check-label"><input name="composition_clip_content" type="checkbox"${slide.composition.clip_content ? " checked" : ""}>スライド枠外を隠す</label><p class="inherit-note">枠外を隠すと、自由配置したパーツのはみ出しを切り取ります。品質確認の見切れ診断と合わせて確認してください。</p></fieldset><div class="actions"><button type="submit">構成全体を保存</button><span class="version" data-version-label>v${options.project.version}</span></div><p class="feedback" data-form-feedback aria-live="polite"></p></form>`;
  const effectiveTemplateId = slide.template_id ?? deck.default_template_id ?? null;
  const activeTemplate = (deck.templates ?? []).find(
    (template) => template.id === effectiveTemplateId
  );
  const visualPreset = activeTemplate?.visual_preset ?? "studio";
  const bodyFont = activeTemplate?.body_font ?? "system-sans";
  const headingFont = activeTemplate?.heading_font ?? "system-sans";
  const density = activeTemplate?.density ?? "comfortable";
  const motion = activeTemplate?.motion_style ?? "calm";
  const motif = activeTemplate?.motif ?? "none";
  const headingTreatment = activeTemplate?.heading_treatment ?? "plain";
  const imageTreatment = activeTemplate?.image_treatment ?? "natural";
  const panelTreatment = activeTemplate?.panel_treatment ?? "flat";
  const selectedRole = slide.role ?? "content";
  const selectedRoleStyle = activeTemplate?.role_styles?.[selectedRole];
  const roleMainContrast = activeTemplate === undefined
    ? null
    : colorContrast(
        selectedRoleStyle?.background ?? activeTemplate.background,
        selectedRoleStyle?.foreground ?? activeTemplate.foreground
      );
  const roleSidebarContrast = activeTemplate === undefined
    ? null
    : colorContrast(
        selectedRoleStyle?.surface ?? activeTemplate.surface,
        selectedRoleStyle?.muted ?? activeTemplate.muted
      );
  const directTemplateSlides = activeTemplate === undefined
    ? 0
    : deck.slides.filter((item) => item.template_id === activeTemplate.id).length;
  const inheritedTemplateSlides = activeTemplate !== undefined && deck.default_template_id === activeTemplate.id
    ? deck.slides.filter((item) => item.template_id === null || item.template_id === undefined).length
    : 0;
  const typography = resolveSlideTypography(
    slide.typography,
    selectedRoleStyle?.line_height ?? activeTemplate?.line_height ?? 1.5
  );
  const typographyPreviewPresets = Object.fromEntries(
    (Object.keys(SLIDE_TYPOGRAPHY_LABELS) as Array<keyof typeof SLIDE_TYPOGRAPHY_LABELS>).map(
      (preset) => [
        preset,
        resolveSlideTypography({ preset }, activeTemplate?.line_height ?? 1.5)
      ]
    )
  );
  const mainContrast = activeTemplate === undefined
    ? null
    : colorContrast(activeTemplate.background, activeTemplate.foreground);
  const sidebarContrast = activeTemplate === undefined
    ? null
    : colorContrast(activeTemplate.surface, activeTemplate.muted);
  const effectiveEnter = slide.enter_animation ?? selectedRoleStyle?.enter_animation ?? activeTemplate?.enter_animation ?? "fade";
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
  const narrationColorField = (name: string, label: string, value: string | undefined, fallback: string) => `<label>${label}<span class="color-control"><input type="color" value="${escapeHtml(value ?? fallback)}" data-narration-color-preview="${name}" aria-label="${label}を色見本から選ぶ"><input name="${name}" type="text" value="${escapeHtml(value ?? "")}" data-narration-color-text="${name}" placeholder="空欄で表示形式の既定" pattern="^$|^#[0-9A-Fa-f]{6}$" maxlength="7" spellcheck="false"></span></label>`;
  const narrationColorControls = `${narrationColorField("appearance_background", "背景色", narrationAppearance.background, "#111827")}${narrationColorField("appearance_foreground", "文字色", narrationAppearance.foreground, "#f8fafc")}${narrationColorField("appearance_border_color", "境界線色", narrationAppearance.border_color, "#52647c")}${narrationColorField("appearance_accent", "話者・進捗色", narrationAppearance.accent, activeTemplate?.accent ?? deck.accent)}`;
  const narrationPalettes = [
    ["夜のパネル", { background: "#0f172a", foreground: "#f8fafc", border_color: "#64748b", accent: "#38bdf8", corner_radius_px: 18 }],
    ["明るい紙面", { background: "#f8fafc", foreground: "#172033", border_color: "#94a3b8", accent: "#2563eb", corner_radius_px: 10 }],
    ["ずんだ色", { background: "#edf9dc", foreground: "#18320f", border_color: "#6bbd45", accent: "#6bbd45", corner_radius_px: 18 }],
    ["高コントラスト", { background: "#000000", foreground: "#ffffff", border_color: "#ffffff", accent: "#ffcf32", corner_radius_px: 0 }]
  ] as const;
  const narrationPalettePicker = `<div class="narration-palette" aria-label="読み上げ枠の配色プリセット">${narrationPalettes.map(([label, palette]) => `<button class="narration-color-pick" type="button" data-narration-color-pick="${escapeHtml(JSON.stringify(palette))}" style="--palette-background:${palette.background};--palette-border:${palette.border_color};--palette-accent:${palette.accent}"><span class="narration-color-swatch" aria-hidden="true"></span><span>${label}</span></button>`).join("")}<button class="narration-color-pick" type="button" data-narration-color-reset><span class="narration-color-swatch" aria-hidden="true" style="--palette-background:transparent;--palette-border:#94a3b8;--palette-accent:#94a3b8"></span><span>形式の既定</span></button></div>`;
  const effectiveSpeaker =
    slide.narration?.speaker ?? deck.narration_defaults?.speaker ?? null;
  const profiles = deck.voicevox?.profiles ?? [];
  const defaultProfile = profiles.find(
    (profile) => profile.id === deck.voicevox?.default_profile_id
  );
  const templateOptions = [
    `<option value=""${slide.template_id === null || slide.template_id === undefined ? " selected" : ""}>発表全体の既定を使う</option>`,
    ...(deck.templates ?? []).map(
      (template) => `<option value="${escapeHtml(template.id)}"${slide.template_id === template.id ? " selected" : ""}>${escapeHtml(template.name)}${deck.default_template_id === template.id ? " · 発表全体の既定" : ""}</option>`
    )
  ].join("");
  const appearancePreviewFor = (requestedTemplateId: string | null) => {
    const resolvedTemplateId =
      requestedTemplateId === null ? deck.default_template_id ?? null : requestedTemplateId;
    const template = (deck.templates ?? []).find(
      (item) => item.id === resolvedTemplateId
    );
    const preset = template?.visual_preset ?? (deck.layout === "minimal" ? "paper" : "studio");
    const defaults = TEMPLATE_PRESET_DEFAULTS[preset];
    return {
      template_name: template?.name ?? "組み込み",
      template_id: template?.id ?? `builtin-${deck.layout}`,
      user_template: template !== undefined,
      region_layout: template?.region_layout ?? "sidebar-right",
      visual_preset: preset,
      body_font: template?.body_font ?? defaults.body_font ?? "system-sans",
      heading_font: template?.heading_font ?? defaults.heading_font ?? "system-sans",
      density: template?.density ?? defaults.density ?? "comfortable",
      motion_style: template?.motion_style ?? defaults.motion_style ?? "calm",
      enter_animation: template?.enter_animation ?? defaults.enter_animation,
      sidebar_width_percent: template?.sidebar_width_percent ?? defaults.sidebar_width_percent,
      background: template?.background ?? defaults.background,
      surface: template?.surface ?? defaults.surface,
      foreground: template?.foreground ?? defaults.foreground,
      muted: template?.muted ?? defaults.muted,
      accent: template?.accent ?? defaults.accent,
      accent_secondary: template?.accent_secondary ?? defaults.accent_secondary ?? defaults.accent,
      border: template?.border ?? defaults.border ?? defaults.muted,
      corner_radius_px: template?.corner_radius_px ?? defaults.corner_radius_px,
      spacing_scale: template?.spacing_scale ?? defaults.spacing_scale,
      font_scale: template?.font_scale ?? defaults.font_scale,
      body_weight: template?.body_weight ?? defaults.body_weight ?? 400,
      heading_weight: template?.heading_weight ?? defaults.heading_weight ?? 800,
      line_height: template?.line_height ?? defaults.line_height ?? 1.5,
      letter_spacing_em: template?.letter_spacing_em ?? defaults.letter_spacing_em ?? 0,
      motif: template?.motif ?? defaults.motif ?? "none",
      motif_color: template?.motif_color ?? defaults.motif_color ?? template?.accent ?? defaults.accent,
      motif_opacity: template?.motif_opacity ?? defaults.motif_opacity ?? 0.1,
      motif_scale: template?.motif_scale ?? defaults.motif_scale ?? 1,
      heading_treatment: template?.heading_treatment ?? defaults.heading_treatment ?? "plain",
      image_treatment: template?.image_treatment ?? defaults.image_treatment ?? "natural",
      panel_treatment: template?.panel_treatment ?? defaults.panel_treatment ?? "flat",
      role_styles: template?.role_styles ?? {},
      apply_line_height: (slide.typography?.preset ?? "standard") === "standard" && slide.typography?.line_height === undefined
    };
  };
  const appearancePreviewTemplates = Object.fromEntries([
    ["", appearancePreviewFor(null)],
    ...(deck.templates ?? []).map((template) => [
      template.id,
      appearancePreviewFor(template.id)
    ])
  ]);
  const animationOptions = Object.entries(ANIMATION_LABELS)
    .map(
      ([value, label]) => `<option value="${value}"${slide.enter_animation === value ? " selected" : ""}>${escapeHtml(label)}</option>`
    )
    .join("");
  const visualPresetPicker = (selected: string) => `<div class="visual-picker" role="group" aria-label="配色プリセットを選ぶ">${Object.entries(VISUAL_LABELS).map(([value, label]) => {
    const preset = TEMPLATE_PRESET_DEFAULTS[value as keyof typeof TEMPLATE_PRESET_DEFAULTS];
    const palette = {
      background: preset.background,
      surface: preset.surface,
      foreground: preset.foreground,
      muted: preset.muted,
      accent: preset.accent,
      accent_secondary: preset.accent_secondary ?? preset.accent,
      border: preset.border ?? preset.muted
    };
    return `<button class="visual-pick" type="button" data-visual-pick="${value}" data-visual-palette="${escapeHtml(JSON.stringify(palette))}" aria-pressed="${String(value === selected)}" style="--visual-swatch:${preset.background};--visual-accent:${preset.accent}"><span class="visual-swatch" aria-hidden="true"></span><span>${label}</span></button>`;
  }).join("")}</div><p class="inherit-note">選ぶと配色一式を適用します。下の色はその後も個別に調整できます。</p>`;
  const fontPresetPicker = (selected: string) => `<div class="font-picker" role="group" aria-label="本文と見出しのフォントをまとめて選ぶ">${Object.entries(FONT_LABELS).map(([value, label]) => `<button class="font-pick" type="button" data-font-pick="${value}" data-font-candidates="${escapeHtml(JSON.stringify(FONT_CANDIDATES[value as keyof typeof FONT_LABELS]))}" aria-pressed="${String(value === selected)}"><span>最自由研究 Aa</span><small>${label}</small></button>`).join("")}</div>`;
  const designAxisPicker = (field: string, selected: string, labels: Record<string, string>) => `<div class="design-axis-picker" role="group" aria-label="${escapeHtml(field === "motif" ? "背景モチーフ" : field === "heading_treatment" ? "見出し処理" : field === "image_treatment" ? "画像処理" : "カード・補足欄処理")}を選ぶ">${Object.entries(labels).map(([value, label]) => `<button class="design-axis-pick" type="button" data-design-field="${escapeHtml(field)}" data-design-pick="${escapeHtml(value)}" aria-pressed="${String(value === selected)}"><span class="design-axis-wire" aria-hidden="true"></span><span>${escapeHtml(label)}</span></button>`).join("")}</div>`;
  const roleStyleColor = (field: string, label: string, value: string | undefined, fallback: string) => `<label>${label}<span class="color-control"><input name="role_style_${field}_picker" type="color" value="${escapeHtml(value ?? fallback)}" data-role-style-color="${field}" aria-label="${label}を色見本から選ぶ"><input name="role_style_${field}" type="text" value="${escapeHtml(value ?? "")}" data-role-style-color-text="${field}" placeholder="空欄で基本色 ${escapeHtml(fallback)}" pattern="^$|^#[0-9A-Fa-f]{6}$" maxlength="7" spellcheck="false"></span></label>`;
  const roleStyleOptions = (entries: Array<[string, string]>, selected: string | undefined) => `<option value="">基本を継承</option>${entries.map(([value, label]) => `<option value="${escapeHtml(value)}"${selected === value ? " selected" : ""}>${escapeHtml(label)}</option>`).join("")}`;
  const roleStyleNumber = (field: string, label: string, value: number | undefined, attributes: string) => `<label>${label}<input name="role_style_${field}" type="number" ${attributes} value="${value ?? ""}" placeholder="基本を継承"></label>`;
  const configuredRoleSummary = Object.entries(activeTemplate?.role_styles ?? {}).flatMap(([role, value]) => value === undefined ? [] : [`<span>${SLIDE_ROLE_LABELS[role as keyof typeof SLIDE_ROLE_LABELS]}</span>`]).join("");
  const roleStyleEditor = activeTemplate === undefined ? "" : `<fieldset data-role-style-editor data-role-styles="${escapeHtml(JSON.stringify(activeTemplate.role_styles ?? {}))}" data-role-style-base="${escapeHtml(JSON.stringify({ background: activeTemplate.background, surface: activeTemplate.surface, foreground: activeTemplate.foreground, muted: activeTemplate.muted, accent: activeTemplate.accent, accent_secondary: activeTemplate.accent_secondary ?? activeTemplate.accent, border: activeTemplate.border ?? activeTemplate.muted, motif_color: activeTemplate.motif_color ?? activeTemplate.accent }))}">
    <legend>役割ごとのデザイン差分</legend>
    <p class="inherit-note">基本デザインを複製せず、表紙、章扉、比較、結果などに必要な差分だけを設定します。配色だけでなく、文字、密度、余白、動きまで役割として現在のスライドへ即時プレビューできます。</p>
    <div class="editor-grid"><label>編集する役割<select name="role_style_role">${Object.entries(SLIDE_ROLE_LABELS).map(([value, label]) => `<option value="${value}"${selectedRole === value ? " selected" : ""}>${label}</option>`).join("")}</select></label><label class="check-label"><input name="role_style_enabled" type="checkbox"${selectedRoleStyle === undefined ? "" : " checked"}>この役割に差分を設定</label></div>
    <div class="role-style-summary" data-role-style-summary>${configuredRoleSummary || "<span>差分なし</span>"}</div>
    <div class="role-style-controls">
      <div class="editor-grid">
        <label>見た目の系統<select name="role_style_visual_preset">${roleStyleOptions(Object.entries(VISUAL_LABELS), selectedRoleStyle?.visual_preset)}</select></label>
        <label>領域配置<select name="role_style_region_layout">${roleStyleOptions([["single", "単一"], ["sidebar-right", "右補足"], ["sidebar-left", "左補足"], ["lower-third", "下段補足"], ["split", "左右均等"], ["top-band", "上段補足"], ["focus", "中央集中"]], selectedRoleStyle?.region_layout)}</select></label>
        <label>背景モチーフ<select name="role_style_motif">${roleStyleOptions(Object.entries(MOTIF_LABELS), selectedRoleStyle?.motif)}</select></label>
        <label>見出し処理<select name="role_style_heading_treatment">${roleStyleOptions(Object.entries(HEADING_TREATMENT_LABELS), selectedRoleStyle?.heading_treatment)}</select></label>
        <label>画像処理<select name="role_style_image_treatment">${roleStyleOptions(Object.entries(IMAGE_TREATMENT_LABELS), selectedRoleStyle?.image_treatment)}</select></label>
        <label>カード・補足欄<select name="role_style_panel_treatment">${roleStyleOptions(Object.entries(PANEL_TREATMENT_LABELS), selectedRoleStyle?.panel_treatment)}</select></label>
      </div>
      <div class="editor-grid">${roleStyleColor("background", "背景", selectedRoleStyle?.background, activeTemplate.background)}${roleStyleColor("surface", "カード・補足面", selectedRoleStyle?.surface, activeTemplate.surface)}${roleStyleColor("foreground", "本文", selectedRoleStyle?.foreground, activeTemplate.foreground)}${roleStyleColor("muted", "補助文字", selectedRoleStyle?.muted, activeTemplate.muted)}${roleStyleColor("accent", "アクセント", selectedRoleStyle?.accent, activeTemplate.accent)}${roleStyleColor("accent_secondary", "第2アクセント", selectedRoleStyle?.accent_secondary, activeTemplate.accent_secondary ?? activeTemplate.accent)}${roleStyleColor("border", "境界線", selectedRoleStyle?.border, activeTemplate.border ?? activeTemplate.muted)}${roleStyleColor("motif_color", "モチーフ色", selectedRoleStyle?.motif_color, activeTemplate.motif_color ?? activeTemplate.accent)}</div>
      <details class="component-detail"><summary>文字・密度・余白・動きも役割に合わせる</summary><div class="disclosure-body">
        <div class="editor-grid">
          <label>本文フォント<select name="role_style_body_font">${roleStyleOptions(Object.entries(FONT_LABELS), selectedRoleStyle?.body_font)}</select></label>
          <label>見出しフォント<select name="role_style_heading_font">${roleStyleOptions(Object.entries(FONT_LABELS), selectedRoleStyle?.heading_font)}</select></label>
          <label>情報密度<select name="role_style_density">${roleStyleOptions(Object.entries(DENSITY_LABELS), selectedRoleStyle?.density)}</select></label>
          <label>動きの強さ<select name="role_style_motion_style">${roleStyleOptions(Object.entries(MOTION_LABELS), selectedRoleStyle?.motion_style)}</select></label>
          <label>表示アニメーション<select name="role_style_enter_animation">${roleStyleOptions(Object.entries(ANIMATION_LABELS), selectedRoleStyle?.enter_animation)}</select></label>
          <label>段階アニメーション<select name="role_style_reveal_animation">${roleStyleOptions(Object.entries(ANIMATION_LABELS), selectedRoleStyle?.reveal_animation)}</select></label>
          ${roleStyleNumber("sidebar_width_percent", "補足幅（%）", selectedRoleStyle?.sidebar_width_percent, 'min="20" max="45" step="1"')}
          ${roleStyleNumber("corner_radius_px", "角の丸み", selectedRoleStyle?.corner_radius_px, 'min="0" max="48" step="1"')}
          ${roleStyleNumber("spacing_scale", "余白倍率", selectedRoleStyle?.spacing_scale, 'min="0.75" max="1.5" step="0.05"')}
          ${roleStyleNumber("font_scale", "文字倍率", selectedRoleStyle?.font_scale, 'min="0.75" max="1.3" step="0.05"')}
          ${roleStyleNumber("body_weight", "本文の太さ", selectedRoleStyle?.body_weight, 'min="300" max="900" step="100"')}
          ${roleStyleNumber("heading_weight", "見出しの太さ", selectedRoleStyle?.heading_weight, 'min="300" max="900" step="100"')}
          ${roleStyleNumber("line_height", "行間", selectedRoleStyle?.line_height, 'min="1" max="2" step="0.05"')}
          ${roleStyleNumber("letter_spacing_em", "字間（em）", selectedRoleStyle?.letter_spacing_em, 'min="-0.08" max="0.2" step="0.01"')}
          ${roleStyleNumber("motif_opacity", "モチーフの濃さ", selectedRoleStyle?.motif_opacity, 'min="0" max="0.5" step="0.05"')}
          ${roleStyleNumber("motif_scale", "モチーフの大きさ", selectedRoleStyle?.motif_scale, 'min="0.5" max="3" step="0.1"')}
        </div>
      </div></details>
      <p class="quality-status" data-role-contrast-status data-level="${roleMainContrast !== null && roleSidebarContrast !== null && roleMainContrast >= 4.5 && roleSidebarContrast >= 4.5 ? "ok" : "warning"}">この役割の本文 ${roleMainContrast?.toFixed(1)}:1 · 補足 ${roleSidebarContrast?.toFixed(1)}:1</p>
    </div>
  </fieldset>`;
  const coverLayoutPicker = `<div class="cover-picker" role="group" aria-label="表紙レイアウトを選ぶ">${[["center", "中央"], ["split", "左右分割"], ["poster", "ポスター"], ["minimal", "余白重視"], ["statement", "一言強調"], ["band", "中央帯"], ["corner", "左下"], ["frame", "額縁"]].map(([value, label]) => `<button class="cover-pick" type="button" data-cover-pick="${value}" aria-pressed="${String((slide.cover_layout ?? "center") === value)}"><span class="cover-wire" aria-hidden="true"></span><span>${label}</span></button>`).join("")}</div>`;
  const narrationDisplayPicker = `<div class="narration-picker" role="group" aria-label="読み上げ文の表示形式を選ぶ">${Object.entries(NARRATION_DISPLAY_LABELS).map(([value, label]) => `<button class="narration-display-pick" type="button" data-narration-display-pick="${value}" aria-pressed="${String(narrationDisplay === value)}"><span class="narration-wire" aria-hidden="true"></span><span>${label}</span></button>`).join("")}</div>`;
  const regionLayoutPicker = activeTemplate === undefined ? "" : `<div class="region-picker" role="group" aria-label="本文と補足の領域配置を選ぶ">${[["single", "単一"], ["sidebar-right", "右補足"], ["sidebar-left", "左補足"], ["lower-third", "下段補足"], ["split", "左右均等"], ["top-band", "上段補足"], ["focus", "中央集中"]].map(([value, label]) => `<button class="region-pick" type="button" data-region-pick="${value}" aria-pressed="${String(activeTemplate.region_layout === value)}"><span class="region-wire" aria-hidden="true"></span><span>${label}</span></button>`).join("")}</div>`;
  const animationPicker = (selected: string, inherit: boolean) => {
    const icons: Record<string, string> = { none: "—", fade: "◌", rise: "↑", zoom: "⊕", wipe: "▰", "slide-left": "←", "slide-right": "→", pop: "✦", blur: "◎" };
    const entries = inherit ? [["", "テンプレートを継承"] as const, ...Object.entries(ANIMATION_LABELS)] : Object.entries(ANIMATION_LABELS);
    return `<div class="animation-picker" role="group" aria-label="表示アニメーションを選ぶ">${entries.map(([value, label]) => `<button class="animation-pick" type="button" data-animation-pick="${value}" data-animation-target="enter_animation" aria-pressed="${String(selected === value)}"><span class="animation-symbol" aria-hidden="true">${icons[value] ?? "↗"}</span><span>${label}</span></button>`).join("")}</div><button class="animation-replay" type="button" data-animation-replay="enter_animation">▶ 動きをもう一度見る</button>`;
  };
  const tonePicker = `<div class="tone-picker" role="group" aria-label="スライドの色調を選ぶ">${Object.entries(TONE_LABELS).map(([value, label]) => `<button class="tone-pick" type="button" data-tone-pick="${value}" aria-pressed="${String(slide.tone === value)}"><span class="tone-swatch" aria-hidden="true"></span><span>${label}</span></button>`).join("")}</div>`;
  const templateCreator = `<details class="component-detail"${activeTemplate === undefined ? " open" : ""}><summary>研究に合わせたデザインを作る</summary><form class="editor" data-template-create data-versioned-form data-method="POST" action="${projectPath}/templates" data-version="${options.project.version}" data-csrf="${escapeHtml(options.csrfToken)}"><div class="editor-grid"><label>デザイン名<input name="name" maxlength="80" required value="自分のスタイル"></label><label>ID<input name="template_id" pattern="[a-z0-9][a-z0-9-]{0,63}" required value="style-${options.project.version}"></label></div><label>どんな見た目にしたいか<textarea name="design_notes" maxlength="1000" placeholder="例: 植物観察の手帳らしさ。緑は落ち着いた色にして、写真を大きく見せる。派手なネオン表現は避ける。"></textarea></label><div class="editor-grid"><label>既存案から引き継ぐ（任意）<select name="source_template_id"><option value="">安全な出発点から作る</option>${(deck.templates ?? []).map((template) => `<option value="${escapeHtml(template.id)}">${escapeHtml(template.name)}${deck.default_template_id === template.id ? " · 発表全体の既定" : ""}</option>`).join("")}</select></label><label>出発点の見た目<select name="visual_preset">${Object.entries(VISUAL_LABELS).map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select></label></div><p class="inherit-note">出発点は読みやすい色・文字・余白をまとめて用意するだけです。作成後にモチーフ、見出し、画像、配色を独立して変えられます。既存案を選ぶと、その設定を複製します。</p><label class="check-label"><input type="checkbox" name="make_default" checked>発表全体の既定デザインにする</label><div class="actions"><button type="submit">デザインを作って調整する</button><span class="version" data-version-label>v${options.project.version}</span></div><p class="feedback" data-form-feedback aria-live="polite"></p></form></details>`;
  const templateEditor = activeTemplate
      ? `<form class="editor" data-template-editor data-versioned-form action="${projectPath}/templates/${escapeHtml(activeTemplate.id)}" data-version="${options.project.version}" data-slide-id="${escapeHtml(slide.id)}" data-template-id="${escapeHtml(activeTemplate.id)}" data-csrf="${escapeHtml(options.csrfToken)}">
        <p class="inherit-note" data-template-impact>保存すると現在${directTemplateSlides + inheritedTemplateSlides}枚へ反映されます（直接指定 ${directTemplateSlides}枚・既定を継承 ${inheritedTemplateSlides}枚）。</p>
        <label>テンプレート名<input name="name" maxlength="80" required value="${escapeHtml(activeTemplate.name)}"></label>
        <label>このデザインの方針<textarea name="design_notes" maxlength="1000" placeholder="例: 氷の冷たさと手書きの実験ノートを組み合わせる。写真を主役にし、青緑を少量だけ使う。">${escapeHtml(activeTemplate.design_notes ?? "")}</textarea></label><p class="inherit-note">見た目には直接表示されません。研究テーマ、作者の好み、避けたい表現を残すと、接続したAIも同じ意図で個別項目を調整できます。</p>
        <div class="editor-grid"><label>見た目のプリセット<select name="visual_preset">${Object.entries(VISUAL_LABELS).map(([value, label]) => `<option value="${value}"${visualPreset === value ? " selected" : ""}>${label}</option>`).join("")}</select></label><label>情報密度<select name="density">${Object.entries(DENSITY_LABELS).map(([value, label]) => `<option value="${value}"${density === value ? " selected" : ""}>${label}</option>`).join("")}</select></label></div>
        ${visualPresetPicker(visualPreset)}
        <fieldset><legend>領域</legend>${regionLayoutPicker}<div class="editor-grid"><label>配置<select name="region_layout">${[["single", "単一"], ["sidebar-right", "右補足"], ["sidebar-left", "左補足"], ["lower-third", "下段補足"], ["split", "左右均等"], ["top-band", "上段補足"], ["focus", "中央集中"]].map(([value, label]) => `<option value="${value}"${activeTemplate.region_layout === value ? " selected" : ""}>${label}</option>`).join("")}</select></label><label>補足幅（%）<input name="sidebar_width_percent" type="number" min="20" max="45" value="${activeTemplate.sidebar_width_percent}" required></label></div><div class="editor-grid"><label>角の丸み<input name="corner_radius_px" type="number" min="0" max="48" value="${activeTemplate.corner_radius_px}" required></label><label>余白倍率<input name="spacing_scale" type="number" min="0.75" max="1.5" step="0.05" value="${activeTemplate.spacing_scale}" required></label></div></fieldset>
        <fieldset><legend>色</legend><div class="editor-grid">${[["background", "背景", activeTemplate.background], ["surface", "補足面", activeTemplate.surface], ["foreground", "本文", activeTemplate.foreground], ["muted", "補助文字", activeTemplate.muted], ["accent", "アクセント", activeTemplate.accent], ["accent_secondary", "第2アクセント", activeTemplate.accent_secondary ?? activeTemplate.accent], ["border", "境界線", activeTemplate.border ?? activeTemplate.muted]].map(([name, label, value]) => `<label>${label}<span class="color-control"><input name="${name}" type="color" value="${escapeHtml(String(value))}" aria-label="${label}を色見本から選ぶ"><input type="text" value="${escapeHtml(String(value))}" data-color-text="${name}" aria-label="${label}のHEX値" pattern="#[0-9A-Fa-f]{6}" maxlength="7" spellcheck="false"></span></label>`).join("")}</div><p class="quality-status" data-contrast-status data-level="${mainContrast !== null && sidebarContrast !== null && mainContrast >= 4.5 && sidebarContrast >= 4.5 ? "ok" : "warning"}">本文 ${mainContrast?.toFixed(1)}:1 · 補足 ${sidebarContrast?.toFixed(1)}:1${mainContrast !== null && sidebarContrast !== null && mainContrast >= 4.5 && sidebarContrast >= 4.5 ? " — 標準文字の目安4.5:1以上です。" : " — 4.5:1未満の組み合わせを見直してください。"}</p></fieldset>
        <fieldset><legend>研究らしさを作る装飾</legend><p class="inherit-note">プリセットと切り離して組み合わせられます。モチーフは背景だけ、見出し、画像、カード・補足欄の処理は全スライドの該当要素へ適用されます。</p><label>背景モチーフ<select name="motif">${Object.entries(MOTIF_LABELS).map(([value, label]) => `<option value="${value}"${motif === value ? " selected" : ""}>${label}</option>`).join("")}</select></label>${designAxisPicker("motif", motif, MOTIF_LABELS)}<div class="editor-grid"><label>モチーフ色<span class="color-control"><input name="motif_color" type="color" value="${escapeHtml(activeTemplate.motif_color ?? activeTemplate.accent)}" aria-label="モチーフ色を色見本から選ぶ"><input type="text" value="${escapeHtml(activeTemplate.motif_color ?? activeTemplate.accent)}" data-color-text="motif_color" aria-label="モチーフ色のHEX値" pattern="#[0-9A-Fa-f]{6}" maxlength="7" spellcheck="false"></span></label><label>濃さ<input name="motif_opacity" type="number" min="0" max="0.5" step="0.05" value="${activeTemplate.motif_opacity ?? 0.1}"></label><label>大きさ<input name="motif_scale" type="number" min="0.5" max="3" step="0.1" value="${activeTemplate.motif_scale ?? 1}"></label></div><label>見出し処理<select name="heading_treatment">${Object.entries(HEADING_TREATMENT_LABELS).map(([value, label]) => `<option value="${value}"${headingTreatment === value ? " selected" : ""}>${label}</option>`).join("")}</select></label>${designAxisPicker("heading_treatment", headingTreatment, HEADING_TREATMENT_LABELS)}<label>画像処理<select name="image_treatment">${Object.entries(IMAGE_TREATMENT_LABELS).map(([value, label]) => `<option value="${value}"${imageTreatment === value ? " selected" : ""}>${label}</option>`).join("")}</select></label>${designAxisPicker("image_treatment", imageTreatment, IMAGE_TREATMENT_LABELS)}<label>カード・補足欄<select name="panel_treatment">${Object.entries(PANEL_TREATMENT_LABELS).map(([value, label]) => `<option value="${value}"${panelTreatment === value ? " selected" : ""}>${label}</option>`).join("")}</select></label>${designAxisPicker("panel_treatment", panelTreatment, PANEL_TREATMENT_LABELS)}</fieldset>
        ${roleStyleEditor}
        <fieldset><legend>文字</legend>${fontPresetPicker(bodyFont === headingFont ? bodyFont : "")}<p class="inherit-note">端末にある日本語フォントを優先して使うためOSで字形が少し変わります。公開前は固定プレビューの自動縮小と見切れ診断も確認してください。</p><div class="editor-grid"><label>本文フォント<select name="body_font">${Object.entries(FONT_LABELS).map(([value, label]) => `<option value="${value}"${bodyFont === value ? " selected" : ""}>${label}</option>`).join("")}</select></label><label>見出しフォント<select name="heading_font">${Object.entries(FONT_LABELS).map(([value, label]) => `<option value="${value}"${headingFont === value ? " selected" : ""}>${label}</option>`).join("")}</select></label><label>本文の太さ<input name="body_weight" type="number" min="300" max="900" step="100" value="${activeTemplate.body_weight ?? 400}"></label><label>見出しの太さ<input name="heading_weight" type="number" min="300" max="900" step="100" value="${activeTemplate.heading_weight ?? 800}"></label><label>文字倍率<input name="font_scale" type="number" min="0.75" max="1.3" step="0.05" value="${activeTemplate.font_scale}"></label><label>行間<input name="line_height" type="number" min="1" max="2" step="0.05" value="${activeTemplate.line_height ?? 1.5}"></label><label>字間（em）<input name="letter_spacing_em" type="number" min="-0.08" max="0.2" step="0.01" value="${activeTemplate.letter_spacing_em ?? 0}"></label></div></fieldset>
        <fieldset><legend>動き</legend>${animationPicker(activeTemplate.enter_animation, false)}<div class="editor-grid"><label>動きの強さ<select name="motion_style">${Object.entries(MOTION_LABELS).map(([value, label]) => `<option value="${value}"${motion === value ? " selected" : ""}>${label}</option>`).join("")}</select></label><label>表示アニメーション<select name="enter_animation">${Object.entries(ANIMATION_LABELS).map(([value, label]) => `<option value="${value}"${activeTemplate.enter_animation === value ? " selected" : ""}>${label}</option>`).join("")}</select></label><label>段階アニメーション<select name="reveal_animation">${Object.entries(ANIMATION_LABELS).map(([value, label]) => `<option value="${value}"${activeTemplate.reveal_animation === value ? " selected" : ""}>${label}</option>`).join("")}</select></label></div></fieldset>
        <label class="check-label"><input type="checkbox" name="make_default"${deck.default_template_id === activeTemplate.id ? " checked" : ""}>発表全体の既定テンプレートにする</label>
        <div class="actions"><button type="submit">テンプレートを保存</button><button class="danger" type="button" data-template-delete data-template-name="${escapeHtml(activeTemplate.name)}" data-delete-url="${projectPath}/templates/${escapeHtml(activeTemplate.id)}">このテンプレートを削除</button><span class="version" data-version-label>v${options.project.version}</span></div><p class="feedback" data-form-feedback aria-live="polite"></p>
      </form>`
    : `<p class="mode-note">組み込みスタイルを使用中です。テンプレートを選ぶと色、フォント、密度、余白、動きを編集できます。</p>`;
  const typographyEditor = `<form class="editor" data-typography-editor data-versioned-form action="${slidePath}/typography" data-version="${options.project.version}" data-slide-id="${escapeHtml(slide.id)}" data-typography-presets="${escapeHtml(JSON.stringify(typographyPreviewPresets))}" data-effective-typography="${escapeHtml(JSON.stringify(typography))}" data-csrf="${escapeHtml(options.csrfToken)}">
    <p class="inherit-note">定型レイアウトの文章配分を一枚単位で調整します。未入力の項目は選択した組版プリセットを使います。</p>
    <div class="editor-grid"><label>組版プリセット<select name="preset">${Object.entries(SLIDE_TYPOGRAPHY_LABELS).map(([value, label]) => `<option value="${value}"${typography.preset === value ? " selected" : ""}>${label}</option>`).join("")}</select></label><label>段数<input name="columns" type="number" min="1" max="3" value="${slide.typography?.columns ?? ""}" placeholder="実効 ${typography.columns}"></label></div>
    <fieldset><legend>文字サイズと行送り</legend><div class="editor-grid"><label>本文倍率<input name="body_scale" type="number" min="0.5" max="1.4" step="0.05" value="${slide.typography?.body_scale ?? ""}" placeholder="実効 ${typography.body_scale}"></label><label>見出し倍率<input name="heading_scale" type="number" min="0.5" max="1.5" step="0.05" value="${slide.typography?.heading_scale ?? ""}" placeholder="実効 ${typography.heading_scale}"></label><label>行間<input name="typography_line_height" type="number" min="1" max="2" step="0.05" value="${slide.typography?.line_height ?? ""}" placeholder="実効 ${typography.line_height}"></label><label>段落間隔（em）<input name="paragraph_spacing_em" type="number" min="0" max="2" step="0.05" value="${slide.typography?.paragraph_spacing_em ?? ""}" placeholder="実効 ${typography.paragraph_spacing_em}"></label><label>段間隔（em）<input name="column_gap_em" type="number" min="0.5" max="5" step="0.1" value="${slide.typography?.column_gap_em ?? ""}" placeholder="実効 ${typography.column_gap_em}"></label></div></fieldset>
    <fieldset><legend>配置</legend><div class="editor-grid"><label>文字揃え<select name="text_align"><option value=""${slide.typography?.text_align === undefined ? " selected" : ""}>プリセットを使用（${typography.text_align === "center" ? "中央" : "左"}）</option><option value="start"${slide.typography?.text_align === "start" ? " selected" : ""}>左</option><option value="center"${slide.typography?.text_align === "center" ? " selected" : ""}>中央</option></select></label><label>縦位置<select name="vertical_align"><option value=""${slide.typography?.vertical_align === undefined ? " selected" : ""}>プリセットを使用（${typography.vertical_align === "center" ? "中央" : "上"}）</option><option value="start"${slide.typography?.vertical_align === "start" ? " selected" : ""}>上</option><option value="center"${slide.typography?.vertical_align === "center" ? " selected" : ""}>中央</option></select></label></div></fieldset>
    <div class="actions"><button type="submit">文章レイアウトを保存</button><span class="version" data-version-label>v${options.project.version}</span></div><p class="feedback" data-form-feedback aria-live="polite"></p>
  </form>`;
  const defaultNarrationTuning = mergeVoicevoxTuning(
    defaultProfile?.tuning ?? undefined
  );
  const profileTunings = Object.fromEntries([
    ["", defaultNarrationTuning],
    ...profiles.map((profile) => [
      profile.id,
      mergeVoicevoxTuning(profile.tuning ?? undefined)
    ])
  ]);
  const profileCatalogIds: Record<string, string> = {};
  for (const [profileId, profile] of [
    ["", defaultProfile] as const,
    ...profiles.map((profile) => [profile.id, profile] as const)
  ]) {
    if (profile === undefined) continue;
    const catalogProfile = VOICEVOX_CATALOG.find(
      (item) => item.speakerUuid === profile.speaker_uuid && item.styleId === profile.style_id
    );
    if (catalogProfile !== undefined) profileCatalogIds[profileId] = catalogProfile.id;
  }
  const voicevoxSampleUrl = `/api/projects/${options.project.project_id}/voice/sample`;
  const narrationSegments = slide.narration?.segments ?? [];
  const selectedNarrationSegment = narrationSegments.find(
    (segment) => segment.at === options.selectedNarrationAt
  ) ?? narrationSegments[0] ?? null;
  const voiceSegments = selectedNarrationSegment !== null
    ? [selectedNarrationSegment]
        .map((segment) => {
          const profile =
            (segment.voice_profile_id
              ? profiles.find((item) => item.id === segment.voice_profile_id)
              : undefined) ?? defaultProfile;
          const effectiveTuning = mergeVoicevoxTuning(
            profile?.tuning ?? undefined,
            segment.voice_tuning ?? undefined
          );
          const stepDuration = slide.duration_seconds / (slide.reveal_steps + 1);
          const estimatedDuration = Math.max(
            1.5,
            segment.text.length / (7 * effectiveTuning.speedScale)
          ) + (segment.pause_before_ms ?? 0) / 1000 + (segment.pause_after_ms ?? 350) / 1000 +
            (segment.voice_cues?.reduce((total, cue) => total + (cue.pause_after_ms ?? 0), 0) ?? 0) / 1000;
          const profileOptions = [
            `<option value=""${segment.voice_profile_id === null || segment.voice_profile_id === undefined ? " selected" : ""}>発表全体の既定${defaultProfile ? `（${escapeHtml(defaultProfile.label)}）` : ""}</option>`,
            ...profiles.map(
              (item) => `<option value="${escapeHtml(item.id)}"${segment.voice_profile_id === item.id ? " selected" : ""}>${escapeHtml(item.label)} · ${escapeHtml(item.speaker_name)} ${escapeHtml(item.style_name)}</option>`
            )
          ].join("");
          const voiceCues = segment.voice_cues ?? [{
            id: "cue-1",
            text: segment.text,
            voice_profile_id: null,
            voice_tuning: null,
            pause_after_ms: 0
          }];
          const cueMarkup = voiceCues.map((cue, index) => {
            const cueProfileOptions = [
              `<option value=""${cue.voice_profile_id === null || cue.voice_profile_id === undefined ? " selected" : ""}>この区間の声を継承</option>`,
              ...profiles.map((item) => `<option value="${escapeHtml(item.id)}"${cue.voice_profile_id === item.id ? " selected" : ""}>${escapeHtml(item.label)} · ${escapeHtml(item.speaker_name)} ${escapeHtml(item.style_name)}</option>`)
            ].join("");
            return `<fieldset class="voice-cue" data-voice-cue><legend class="sr-only">発話ブロック ${index + 1}</legend><div class="voice-cue-head"><strong data-voice-cue-label>発話 ${index + 1}</strong><button type="button" class="danger" data-remove-voice-cue${voiceCues.length === 1 ? " disabled" : ""}>削除</button></div><input type="hidden" name="cue_id" value="${escapeHtml(cue.id)}"><label>この声で読む文<textarea name="cue_text" maxlength="500" required>${escapeHtml(cue.text)}</textarea></label><div class="editor-grid"><label>声<select name="cue_profile_id">${cueProfileOptions}</select></label><label>直後の休符（秒）<input name="cue_pause_after_seconds" type="number" min="0" max="10" step="0.1" value="${(cue.pause_after_ms ?? 0) / 1000}"></label></div><div class="voice-cue-preset" role="group" aria-label="話し方のプリセット"><button type="button" data-op="edit" data-voice-cue-preset="standard">標準</button><button type="button" data-op="edit" data-voice-cue-preset="emphasis">強調</button><button type="button" data-op="edit" data-voice-cue-preset="calm">落ち着き</button><button type="button" data-op="edit" data-voice-cue-preset="quick">早口</button></div><div class="tuning-grid"><label>速度<input name="cue_speedScale" type="number" min="${VOICEVOX_TUNING_LIMITS.speedScale.min}" max="${VOICEVOX_TUNING_LIMITS.speedScale.max}" step="0.01" value="${cue.voice_tuning?.speedScale ?? ""}" placeholder="継承"></label><label>高さ<input name="cue_pitchScale" type="number" min="${VOICEVOX_TUNING_LIMITS.pitchScale.min}" max="${VOICEVOX_TUNING_LIMITS.pitchScale.max}" step="0.01" value="${cue.voice_tuning?.pitchScale ?? ""}" placeholder="継承"></label><label>抑揚<input name="cue_intonationScale" type="number" min="${VOICEVOX_TUNING_LIMITS.intonationScale.min}" max="${VOICEVOX_TUNING_LIMITS.intonationScale.max}" step="0.01" value="${cue.voice_tuning?.intonationScale ?? ""}" placeholder="継承"></label></div></fieldset>`;
          }).join("");
          const cueTemplateOptions = [`<option value="">この区間の声を継承</option>`, ...profiles.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.label)} · ${escapeHtml(item.speaker_name)} ${escapeHtml(item.style_name)}</option>`)].join("");
          const cueTemplate = `<template data-voice-cue-template><fieldset class="voice-cue" data-voice-cue><legend class="sr-only">新しい発話ブロック</legend><div class="voice-cue-head"><strong data-voice-cue-label>発話</strong><button type="button" class="danger" data-remove-voice-cue>削除</button></div><input type="hidden" name="cue_id" value=""><label>この声で読む文<textarea name="cue_text" maxlength="500" required placeholder="声やトーンを変える位置で文章を分けます"></textarea></label><div class="editor-grid"><label>声<select name="cue_profile_id">${cueTemplateOptions}</select></label><label>直後の休符（秒）<input name="cue_pause_after_seconds" type="number" min="0" max="10" step="0.1" value="0"></label></div><div class="voice-cue-preset" role="group" aria-label="話し方のプリセット"><button type="button" data-op="edit" data-voice-cue-preset="standard">標準</button><button type="button" data-op="edit" data-voice-cue-preset="emphasis">強調</button><button type="button" data-op="edit" data-voice-cue-preset="calm">落ち着き</button><button type="button" data-op="edit" data-voice-cue-preset="quick">早口</button></div><div class="tuning-grid"><label>速度<input name="cue_speedScale" type="number" min="${VOICEVOX_TUNING_LIMITS.speedScale.min}" max="${VOICEVOX_TUNING_LIMITS.speedScale.max}" step="0.01" placeholder="継承"></label><label>高さ<input name="cue_pitchScale" type="number" min="${VOICEVOX_TUNING_LIMITS.pitchScale.min}" max="${VOICEVOX_TUNING_LIMITS.pitchScale.max}" step="0.01" placeholder="継承"></label><label>抑揚<input name="cue_intonationScale" type="number" min="${VOICEVOX_TUNING_LIMITS.intonationScale.min}" max="${VOICEVOX_TUNING_LIMITS.intonationScale.max}" step="0.01" placeholder="継承"></label></div></fieldset></template>`;
          return `<form class="voice-segment editor" id="narration-segment-${segment.at}" data-segment-editor data-segment-preview data-versioned-form action="${slidePath}/narration/segments/${segment.at}" data-version="${options.project.version}" data-slide-id="${escapeHtml(slide.id)}" data-segment-at="${segment.at}" data-effective-tuning="${escapeHtml(JSON.stringify(effectiveTuning))}" data-profile-tunings="${escapeHtml(JSON.stringify(profileTunings))}" data-profile-catalogs="${escapeHtml(JSON.stringify(profileCatalogIds))}" data-step-duration="${stepDuration}" data-csrf="${escapeHtml(options.csrfToken)}">
            <div class="voice-segment-head"><span class="component-step">STEP ${segment.at}</span><span class="voice-timing" data-segment-duration data-state="${estimatedDuration > stepDuration * 1.15 ? "warning" : "ok"}">概算 ${estimatedDuration.toFixed(1)}秒 / STEP目安 ${stepDuration.toFixed(1)}秒</span><span class="audio-state${segment.audio_src ? " ready" : ""}">${segment.audio_src ? "VOICEVOX音声あり" : "ブラウザ音声で代替"}</span></div>
            <textarea name="text" data-composed-narration hidden>${escapeHtml(segment.text)}</textarea><p class="voice-composed"><strong>画面に表示する全文</strong><br><span data-composed-narration-preview>${escapeHtml(segment.text)}</span></p>
            <div class="editor-grid"><label>この区間の話者名<input name="speaker" maxlength="80" value="${escapeHtml(segment.speaker ?? "")}" placeholder="スライド設定を継承"></label><label>VOICEVOXの声<select name="voice_profile_id">${profileOptions}</select></label></div>
            <p class="inherit-note">現在有効な声: ${escapeHtml(profile ? `${profile.label} / ${profile.speaker_name} ${profile.style_name}` : "未設定（ブラウザ音声）")}。空欄の調声値は選んだ声またはVOICEVOX標準値を継承します。</p>
            <fieldset><legend>区間全体の調声（空欄で継承）</legend><div class="tuning-grid">${(Object.keys(DEFAULT_VOICEVOX_TUNING) as Array<keyof VoicevoxTuning>).map((key) => `<label>${TUNING_LABELS[key]}<input name="tuning_${key}" type="number" min="${VOICEVOX_TUNING_LIMITS[key].min}" max="${VOICEVOX_TUNING_LIMITS[key].max}" step="0.01" value="${segment.voice_tuning?.[key] ?? ""}" placeholder="実効 ${effectiveTuning[key]}"></label>`).join("")}</div></fieldset>
            <fieldset><legend>文中の声とトーン</legend><div class="voice-cue-list" data-voice-cue-list>${cueMarkup}</div>${cueTemplate}<button type="button" data-op="edit" data-add-voice-cue${voiceCues.length >= 8 ? " disabled" : ""}>＋ 声を変える位置を追加</button><small class="inherit-note">最大8ブロック。各ブロックの文章は続けて画面へ表示され、声・速度・高さ・抑揚だけを切り替えられます。</small></fieldset>
            <fieldset><legend>読み上げ前後の余白</legend><div class="voice-pause-grid"><label>読み始める前（秒）<input name="pause_before_seconds" type="number" min="0" max="10" step="0.1" value="${(segment.pause_before_ms ?? 0) / 1000}"></label><label>読み終わった後（秒）<input name="pause_after_seconds" type="number" min="0" max="10" step="0.1" value="${(segment.pause_after_ms ?? 350) / 1000}"></label></div><small class="inherit-note">自動送りでは「読み終わった後」の余白を待ってから次へ進みます。文中の沈黙は各発話の「直後の休符」を使います。</small></fieldset>
            <p class="inherit-note">ブラウザ仮試聴は速度・高さ・音量と休符を近似します。VOICEVOX固有の声と抑揚は音声生成後に最終確認してください。</p>
            <div class="actions"><button type="button" data-op="run" data-segment-speech-preview aria-pressed="false">ブラウザで仮試聴</button>${Object.keys(profileCatalogIds).length > 0 ? `<button type="button" data-op="run" data-segment-voicevox-sample="${voicevoxSampleUrl}" aria-pressed="false">この声をVOICEVOXで試聴</button>` : ""}<button type="submit">この区間を保存</button><button type="button" class="danger" data-narration-segment-delete data-delete-url="${slidePath}/narration/segments/${segment.at}" data-csrf="${escapeHtml(options.csrfToken)}">区間を削除</button><span class="version" data-version-label>v${options.project.version}</span></div><p class="feedback" data-form-feedback aria-live="polite"></p>
          </form>`;
        })
        .join("")
    : `<p class="prose">読み上げ区間はまだありません。「読み上げ区間を追加」から最初の原稿を入力できます。</p>`;
  const narrationSegmentOutline = narrationSegments.length > 1
    ? `<label class="component-search">読み上げ区間を絞り込む<span class="component-search-row"><input type="search" data-narration-search placeholder="STEP・原稿・音声状態" autocomplete="off"><output data-narration-search-count aria-live="polite">${narrationSegments.length} / ${narrationSegments.length}件</output></span></label><p class="filmstrip-empty" data-narration-search-empty hidden>一致する読み上げ区間はありません。</p><nav class="segment-outline" aria-label="読み上げ区間">${narrationSegments.map((segment) => {
      const audioState = segment.audio_src ? "VOICEVOX音声あり" : "ブラウザ音声で代替";
      const preview = [...segment.text].slice(0, 24).join("");
      return `<a data-narration-select="${segment.at}" data-search-text="${escapeHtml(`step ${segment.at} ${segment.text} ${audioState}`.toLocaleLowerCase("ja"))}" aria-label="STEP ${segment.at}: ${escapeHtml(preview)} · ${audioState}" href="${currentSlideDashboardPath}?step=${segment.at}&narration=${segment.at}#narration-segment-${segment.at}"${segment.at === selectedNarrationSegment?.at ? ' aria-current="true"' : ""}>STEP ${segment.at}</a>`;
    }).join("")}</nav>`
    : "";
  const usedNarrationSteps = new Set(
    slide.narration?.segments.map((segment) => segment.at) ?? []
  );
  const availableNarrationSteps = Array.from(
    { length: slide.reveal_steps + 1 },
    (_, index) => index
  ).filter((step) => !usedNarrationSteps.has(step));
  const narrationSegmentCreator = availableNarrationSteps.length
    ? `<details class="component-detail"><summary>読み上げ区間を追加</summary><form class="editor" data-narration-segment-create data-segment-preview data-versioned-form data-method="POST" action="${slidePath}/narration/segments" data-version="${options.project.version}" data-slide-id="${escapeHtml(slide.id)}" data-effective-tuning="${escapeHtml(JSON.stringify(defaultNarrationTuning))}" data-profile-catalogs="${escapeHtml(JSON.stringify(profileCatalogIds))}" data-step-duration="${slide.duration_seconds / (slide.reveal_steps + 1)}" data-csrf="${escapeHtml(options.csrfToken)}"><label>表示する段階<select name="at">${availableNarrationSteps.map((step) => `<option value="${step}">STEP ${step}</option>`).join("")}</select><small class="inherit-note">選ぶと左の実表示も同じSTEPへ移動します。</small></label><label>表示・読み上げ文<textarea name="text" maxlength="2000" required placeholder="この段階で読み上げる文"></textarea></label><span class="voice-timing" data-segment-duration data-state="ok">概算 1.5秒 / STEP目安 ${(slide.duration_seconds / (slide.reveal_steps + 1)).toFixed(1)}秒</span><div class="actions"><button type="button" data-op="run" data-segment-speech-preview aria-pressed="false" disabled>ブラウザで仮試聴</button>${profileCatalogIds[""] ? `<button type="button" data-op="run" data-segment-voicevox-sample="${voicevoxSampleUrl}" aria-pressed="false">既定の声をVOICEVOXで試聴</button>` : ""}<button type="submit">区間を追加</button><span class="version" data-version-label>v${options.project.version}</span></div><p class="feedback" data-form-feedback aria-live="polite"></p></form></details>`
    : `<p class="inherit-note">STEP 0〜${slide.reveal_steps}にはすべて読み上げ区間があります。</p>`;
  const compositionMode = slide.composition?.mode ?? "flow";
  const flowComposition = compositionMode === "flow";
  const contentSectionTitle = flowComposition ? "内容" : "基本情報と代替テキスト";
  const workspaceTotalDurationSeconds = deck.slides.reduce(
    (total, item) => total + item.duration_seconds,
    0
  );
  const deckLayoutLabel = { cinematic: "シネマティック", biim: "BIIM", minimal: "余白重視" }[deck.layout];
  const effectiveSummary = `<div class="setting-summary" aria-label="現在有効な設定">
    <span class="setting-chip"><small>レイアウト</small>${deckLayoutLabel}</span>
    <span class="setting-chip" data-workspace-duration data-total-duration="${workspaceTotalDurationSeconds}" data-slide-duration="${slide.duration_seconds}" data-state="${workspaceTotalDurationSeconds > MAX_PRESENTATION_DURATION_SECONDS ? "warning" : "ok"}" role="status"><small>全体時間</small><span data-workspace-duration-label>${formatDuration(workspaceTotalDurationSeconds)}${workspaceTotalDurationSeconds > MAX_PRESENTATION_DURATION_SECONDS ? " · 20分超過" : ""}</span></span>
    <span class="setting-chip"><small>テンプレート</small><span data-setting-value="template">${escapeHtml(activeTemplate?.name ?? "組み込み")}</span></span>
    <span class="setting-chip"><small>配色</small><span data-setting-value="palette">${VISUAL_LABELS[selectedRoleStyle?.visual_preset ?? visualPreset]}</span></span>
    <span class="setting-chip"><small>フォント</small><span data-setting-value="fonts">${FONT_LABELS[selectedRoleStyle?.body_font ?? bodyFont]} / ${FONT_LABELS[selectedRoleStyle?.heading_font ?? headingFont]}</span></span>
    <span class="setting-chip"><small>領域</small><span data-setting-value="region">${({ single: "単一", "sidebar-right": "右補足", "sidebar-left": "左補足", "lower-third": "下段補足", split: "左右均等", "top-band": "上段補足", focus: "中央集中" } as const)[selectedRoleStyle?.region_layout ?? activeTemplate?.region_layout ?? "sidebar-right"]}</span></span>
    <span class="setting-chip"><small>密度</small><span data-setting-value="density">${DENSITY_LABELS[selectedRoleStyle?.density ?? density]}</span></span>
    <span class="setting-chip"><small>モチーフ</small><span data-setting-value="motif">${MOTIF_LABELS[selectedRoleStyle?.motif ?? motif]}</span></span>
    <span class="setting-chip"><small>役割</small><span data-setting-value="role">${SLIDE_ROLE_LABELS[selectedRole]}</span></span>
    <span class="setting-chip"><small>パネル</small><span data-setting-value="panel">${PANEL_TREATMENT_LABELS[selectedRoleStyle?.panel_treatment ?? panelTreatment]}</span></span>
    <span class="setting-chip"><small>動き</small><span data-setting-value="motion">${MOTION_LABELS[selectedRoleStyle?.motion_style ?? motion]}</span></span>
    <span class="setting-chip"><small>組版</small><span data-setting-value="typography">${SLIDE_TYPOGRAPHY_LABELS[typography.preset]} · ${typography.columns}段</span></span>
    <span class="setting-chip"><small>色調</small><span data-setting-value="tone">${TONE_LABELS[slide.tone]}</span></span>
    <span class="setting-chip"><small>アニメーション</small><span data-setting-value="animation">${ANIMATION_LABELS[effectiveEnter]}</span></span>
    <span class="setting-chip"><small>読み上げ</small><span data-setting-value="narration">${NARRATION_DISPLAY_LABELS[narrationDisplay]}</span></span>
    <span class="setting-chip"><small>音声</small>${escapeHtml(defaultProfile?.label ?? "ブラウザ音声")}</span>
  </div>`;
  return new Response(
    shell(
      `${slide.title} — スライド編集`,
      `${accountHeader(options.twitchLogin, options.csrfToken)}
       <main data-surface="workspace" id="main-content" tabindex="-1">
         <a class="back" href="/dashboard/projects/${escapeHtml(options.project.project_id)}">← 研究詳細へ戻る</a>
         <div class="workspace-head"><div><p class="eyebrow">スライド編集 · ${slideIndex + 1} / ${deck.slides.length}</p><h1 data-current-slide-title>${escapeHtml(slide.title)}</h1><p class="workspace-head-links"><a href="/dashboard/projects/${escapeHtml(options.project.project_id)}/review?slide=${escapeHtml(slide.id)}">このスライドをレビュー →</a></p></div><div class="workspace-version"><span class="save-state" data-save-state data-state="saved" role="status" aria-live="polite">保存済み</span><span data-workspace-version>v${options.project.version}</span>${previousSlideLink}${nextSlideLink}<button type="button" data-preview-focus aria-pressed="false">プレビューを広げる</button><a class="button ghost" href="/dashboard/projects/${escapeHtml(options.project.project_id)}/slides/${escapeHtml(slide.id)}/frame?slide=${slideIndex + 1}&step=0" target="_blank" rel="noopener">別画面で開く</a><div class="slide-actions" role="group" aria-label="スライド構成の操作"><button type="button" data-op="edit" data-slide-action="move" data-op="edit" data-position="${Math.max(0, slideIndex - 1)}" data-action-url="${slideActionPath}" data-csrf="${escapeHtml(options.csrfToken)}"${slideIndex === 0 ? " disabled" : ""}>↑ 前へ</button><button type="button" data-op="edit" data-slide-action="move" data-op="edit" data-position="${slideIndex + 1}" data-action-url="${slideActionPath}" data-csrf="${escapeHtml(options.csrfToken)}"${slideIndex === deck.slides.length - 1 ? " disabled" : ""}>↓ 後へ</button><button type="button" data-op="edit" data-slide-action="duplicate" data-action-url="${slideActionPath}" data-csrf="${escapeHtml(options.csrfToken)}">複製</button><button class="danger" type="button" data-slide-action="delete" data-action-url="${slideActionPath}" data-csrf="${escapeHtml(options.csrfToken)}"${deck.slides.length === 1 ? " disabled" : ""}>削除</button></div><span class="feedback" data-slide-action-feedback aria-live="polite"></span></div></div>
         <nav class="mobile-workspace-tabs" role="tablist" aria-label="モバイル編集表示" hidden><button id="mobile-tab-preview" type="button" role="tab" data-mobile-pane="preview" aria-selected="true" aria-controls="workspace-preview-pane">プレビュー<span class="tab-badge" data-mobile-preview-badge hidden>未確認</span></button><button id="mobile-tab-edit" type="button" role="tab" data-mobile-pane="edit" aria-selected="false" aria-controls="workspace-edit-pane" tabindex="-1">編集</button><button id="mobile-tab-slides" type="button" role="tab" data-mobile-pane="slides" aria-selected="false" aria-controls="workspace-slides-pane" tabindex="-1">スライド一覧</button></nav>
         <div class="slide-workspace" data-workspace-asset-urls="${escapeHtml(JSON.stringify(workspaceAssetUrls))}" data-selected-component="${escapeHtml(selectedComponentId ?? "")}" data-selected-narration="${selectedNarrationSegment?.at ?? ""}">
           <nav class="filmstrip" id="workspace-slides-pane" data-filmstrip-project="${escapeHtml(options.project.project_id)}"><label class="filmstrip-search"><span class="filmstrip-search-head"><span>${deck.slides.length}枚から検索</span><output data-filmstrip-search-count aria-live="polite">${deck.slides.length} / ${deck.slides.length}枚</output></span><input type="search" data-filmstrip-search placeholder="タイトル・構成・音声状態" autocomplete="off"></label>${filmstrip}<p class="filmstrip-empty" data-filmstrip-empty hidden>一致するスライドはありません。Escキーで検索を解除できます。</p></nav>
           <section class="panel workspace-preview" id="workspace-preview-pane">
             <div class="workspace-frame" style="--workspace-aspect:${(deck.aspect_ratio ?? "16:9") === "4:3" ? "4 / 3" : "16 / 9"};--workspace-aspect-num:${(deck.aspect_ratio ?? "16:9") === "4:3" ? "1.3333" : "1.7778"}"><span class="frame-loading" data-frame-loading role="status">プレビューを読み込み中…</span><iframe title="${escapeHtml(slide.title)}の実表示" src="/dashboard/projects/${escapeHtml(options.project.project_id)}/slides/${escapeHtml(slide.id)}/frame?slide=${slideIndex + 1}&step=0" data-slide-frame data-aspect-ratio="${deck.aspect_ratio ?? "16:9"}"></iframe></div>
             <div class="step-control"><button type="button" data-step-direction="previous">← 段階</button><output data-step-output aria-live="polite">STEP 0 / ${slide.reveal_steps}</output><button type="button" data-step-direction="next">段階 →</button>${slide.composition?.mode === "scene" || slide.composition?.mode === "canvas" ? '<button type="button" data-grid-snap aria-pressed="false">5%グリッド OFF</button>' : ""}</div>
             ${slide.composition?.mode === "scene" || slide.composition?.mode === "canvas" ? '<p class="inherit-note">パーツをクリックすると編集欄を開きます。自由配置はドラッグで移動、右下でリサイズ、矢印キーで1%移動（Shiftで5%）、Alt＋矢印で大きさを調整し、Ctrl／⌘＋Sで選択中のパーツを保存できます。</p>' : ""}
             <p class="quality-status" data-layout-status role="status" aria-live="polite">実表示の文字収まりを確認しています…</p>
           </section>
           <aside class="inspector" id="workspace-edit-pane">${workspaceSlideCreator}
             <div class="inspector-tabs" role="tablist" aria-label="編集項目" hidden><button id="inspector-tab-content" type="button" role="tab" data-inspector-pane="content" aria-controls="inspector-content">内容</button><button id="inspector-tab-design" type="button" role="tab" data-inspector-pane="design" aria-controls="inspector-design">デザイン</button><button id="inspector-tab-narration" type="button" role="tab" data-inspector-pane="narration" aria-controls="inspector-narration">読み上げ</button><button id="inspector-tab-structure" type="button" role="tab" data-inspector-pane="structure" aria-controls="inspector-structure">構造</button></div>
                          <details class="inspector-section" id="inspector-content" data-inspector-section="content"${flowComposition ? " open" : ""}><summary>${contentSectionTitle}</summary><div class="inspector-body">
               <form class="editor" data-slide-editor data-versioned-form action="${slidePath}" data-version="${options.project.version}" data-slide-id="${escapeHtml(slide.id)}" data-composition-mode="${compositionMode}" data-max-step="${slide.reveal_steps}" data-step-count="${slide.reveal_steps + 1}" data-csrf="${escapeHtml(options.csrfToken)}">
                 ${flowComposition ? "" : '<p class="mode-note">このスライドで見える文章・画像・図形は「構造」の表示パーツです。ここでは一覧・検索・構成変換に使う代替テキストと基本情報だけを編集します。</p>'}
                 <label>タイトル<input name="title" maxlength="120" required value="${escapeHtml(slide.title)}"></label>
                 <label>想定秒数<input name="duration_seconds" type="number" min="1" max="1200" required value="${slide.duration_seconds}"><small class="inherit-note" data-duration-breakdown>読み上げを含むスライド全体の目安です。${slide.reveal_steps + 1}段階では1段階あたり約${(slide.duration_seconds / (slide.reveal_steps + 1)).toFixed(1)}秒です。</small></label>
                 <label>${flowComposition ? "スライド本文" : "代替テキスト"}（Markdown対応）<span class="markdown-toolbar" role="toolbar" aria-label="スライド本文の書式"><button type="button" data-op="edit" data-markdown-action="heading" data-markdown-target="content_markdown">見出し</button><button type="button" data-op="edit" data-markdown-action="bullet" data-markdown-target="content_markdown">箇条書き</button><button type="button" data-op="edit" data-markdown-action="number" data-markdown-target="content_markdown">番号</button><button type="button" data-op="edit" data-markdown-action="bold" data-markdown-target="content_markdown">強調</button><button type="button" data-op="edit" data-markdown-action="table" data-markdown-target="content_markdown">比較表</button></span><textarea name="content_markdown" maxlength="20000" data-recommended-limit="${flowComposition ? recommendedFlowBodyLimit(slide, deck.aspect_ratio ?? "16:9") : 0}" required>${escapeHtml(slide.content_markdown)}</textarea><small class="inherit-note">${flowComposition ? "組版・比率・補足欄から文章量の目安を計算し、入力中も実表示へ反映します。" : "発表画面には直接表示されません。見える内容は「構造」の表示パーツで編集してください。"}</small></label><div class="content-structure" data-content-structure aria-live="polite"><span data-content-stat="headings">見出し 0</span><span data-content-stat="paragraphs">段落 0</span><span data-content-stat="lists">箇条書き 0</span><span data-content-stat="reading">音読 約0秒</span><button type="button" data-op="edit" data-reading-layout hidden>「読み物」組版を試す</button></div>
                 <label>${flowComposition ? "補足欄（読み上げない情報）" : "代替の補足情報"}<span class="markdown-toolbar" role="toolbar" aria-label="補足欄の書式"><button type="button" data-op="edit" data-markdown-action="heading" data-markdown-target="sidebar_markdown">見出し</button><button type="button" data-op="edit" data-markdown-action="bullet" data-markdown-target="sidebar_markdown">箇条書き</button><button type="button" data-op="edit" data-markdown-action="bold" data-markdown-target="sidebar_markdown">強調</button><button type="button" data-op="edit" data-markdown-action="table" data-markdown-target="sidebar_markdown">比較表</button></span><textarea name="sidebar_markdown" maxlength="10000">${escapeHtml(slide.sidebar_markdown ?? "")}</textarea><small class="inherit-note">${flowComposition ? "作者コメント、出典、追加データなど、音声に含めない情報を置けます。" : "発表画面には直接表示されません。必要な補足は「構造」のパーツへ入れてください。"}</small></label>
                 <div class="actions"><button type="submit">${flowComposition ? "内容を保存" : "基本情報と代替テキストを保存"}</button>${nextSlidePath === null ? "" : `<button type="submit" data-op="edit" data-save-next="${nextSlidePath}">保存して次へ</button>`}${slide.role === "content" && flowComposition && deck.slides.length < 100 ? `<button type="button" data-slide-split="${slidePath}/split" data-csrf="${escapeHtml(options.csrfToken)}">カーソル位置で2枚に分割</button>` : ""}<span class="version" data-version-label>v${options.project.version}</span></div>
                 ${slide.role === "content" && (slide.composition === null || slide.composition === undefined) && deck.slides.length < 100 ? '<p class="inherit-note">本文の分けたい位置へカーソルを置いて分割します。見た目と補足欄は両方へ引き継ぎ、段階表示と読み上げは想定時間の位置に応じて分配します。</p>' : ""}
                 <p class="feedback" data-form-feedback aria-live="polite"></p>
               </form>
             </div></details>
             <details class="inspector-section" id="inspector-design" data-inspector-section="design"><summary>デザイン</summary><div class="inspector-body">
               <form class="editor" data-appearance-editor data-versioned-form action="${slidePath}" data-version="${options.project.version}" data-slide-id="${escapeHtml(slide.id)}" data-preview-templates="${escapeHtml(JSON.stringify(appearancePreviewTemplates))}" data-csrf="${escapeHtml(options.csrfToken)}"><label>テンプレート<select name="template_id">${templateOptions}</select></label><div class="editor-grid"><label>このスライドの役割<select name="role">${Object.entries(SLIDE_ROLE_LABELS).map(([value, label]) => `<option value="${value}"${(slide.role ?? "content") === value ? " selected" : ""}>${label}</option>`).join("")}</select></label><label>表紙レイアウト<select name="cover_layout">${[["center", "中央タイトル"], ["split", "左右分割"], ["poster", "ポスター"], ["minimal", "余白重視"], ["statement", "一言を強調"], ["band", "中央帯"], ["corner", "左下タイトル"], ["frame", "額縁"]].map(([value, label]) => `<option value="${value}"${(slide.cover_layout ?? "center") === value ? " selected" : ""}>${label}</option>`).join("")}</select></label></div>${coverLayoutPicker}<p class="inherit-note">役割ごとの配色や部品表現は、選択中のデザインに設定した差分を自動で継承します。</p><div class="editor-grid"><label>色調<select name="tone">${Object.entries(TONE_LABELS).map(([value, label]) => `<option value="${value}"${slide.tone === value ? " selected" : ""}>${label}</option>`).join("")}</select></label><label>表示アニメーション<select name="enter_animation"><option value=""${slide.enter_animation === null || slide.enter_animation === undefined ? " selected" : ""}>テンプレートを継承</option>${animationOptions}</select></label></div>${tonePicker}${animationPicker(slide.enter_animation ?? "", true)}<div class="actions"><button type="submit">スライド外観を保存</button><span class="version" data-version-label>v${options.project.version}</span></div><p class="feedback" data-form-feedback aria-live="polite"></p></form>
               ${typographyEditor}
               ${templateCreator}
               ${templateEditor}
             </div></details>
             <details class="inspector-section" id="inspector-narration" data-inspector-section="narration"><summary>読み上げ</summary><div class="inspector-body">
               <details class="voice-howto"><summary>はじめての読み上げ設定 · 声と間の作り方</summary><div class="voice-howto-body"><ol><li>まずSTEPごとに「読み上げ区間」を作ります。画面に出す文と読む文は同じです。</li><li>文中で雰囲気を変える場所に「声を変える位置」を追加し、文章を発話ブロックへ分けます。</li><li>沈黙は発話ブロックの「直後の休符」、ページ送り前の余韻は「読み終わった後」で調整します。</li></ol><p>ブラウザ仮試聴はすぐ確認するための近似音声です。保存後に研究詳細の音声画面でVOICEVOXを生成すると、選んだキャラクター・スタイル・調声・休符を含む公開用音声になります。</p></div></details>
               <form class="editor" data-narration-settings-editor data-versioned-form action="${slidePath}/narration/settings" data-version="${options.project.version}" data-slide-id="${escapeHtml(slide.id)}" data-csrf="${escapeHtml(options.csrfToken)}"><div class="editor-grid"><label>表示形式<select name="display">${Object.entries(NARRATION_DISPLAY_LABELS).map(([value, label]) => `<option value="${value}"${narrationDisplay === value ? " selected" : ""}>${label}</option>`).join("")}</select></label><label>スライド話者名<input name="speaker" maxlength="80" value="${escapeHtml(slide.narration?.speaker ?? "")}" placeholder="発表全体の既定: ${escapeHtml(deck.narration_defaults?.speaker ?? "なし")}"></label></div>${narrationDisplayPicker}<fieldset><legend>読み上げ枠</legend><div class="editor-grid"><label>配置<select name="placement">${[["bottom", "下部"], ["overlay-bottom", "下部に重ねる"], ["sidebar", "補足欄"]].map(([value, label]) => `<option value="${value}"${narrationAppearance.placement === value ? " selected" : ""}>${label}</option>`).join("")}</select></label><label>大きさ<select name="size">${[["compact", "小"], ["normal", "標準"], ["large", "大"]].map(([value, label]) => `<option value="${value}"${narrationAppearance.size === value ? " selected" : ""}>${label}</option>`).join("")}</select></label><label>文字揃え<select name="text_align"><option value="start"${narrationAppearance.text_align === "start" ? " selected" : ""}>左</option><option value="center"${narrationAppearance.text_align === "center" ? " selected" : ""}>中央</option></select></label><label>文字倍率<input name="text_scale" type="number" min="0.75" max="1.5" step="0.05" value="${narrationAppearance.text_scale}"></label><label>最大行数<input name="max_lines" type="number" min="2" max="8" value="${narrationAppearance.max_lines}"></label></div><label class="check-label"><input name="speaker_visible" type="checkbox"${narrationAppearance.speaker_visible ? " checked" : ""}>話者名を表示</label><label class="check-label"><input name="progress_visible" type="checkbox"${narrationAppearance.progress_visible ? " checked" : ""}>読み上げ進捗を表示</label></fieldset><fieldset><legend>読み上げ枠の色</legend>${narrationPalettePicker}<div class="editor-grid">${narrationColorControls}<label>角丸（px）<input name="appearance_corner_radius_px" type="number" min="0" max="64" value="${narrationAppearance.corner_radius_px ?? ""}" placeholder="空欄で表示形式の既定"></label></div><p class="inherit-note">空欄は選択した表示形式とテンプレートの色を使います。</p></fieldset><p class="inherit-note">話者の実効値: ${escapeHtml(effectiveSpeaker ?? "なし")}。この欄で保存するとスライド設定として上書きします。</p><div class="actions"><button type="submit">読み上げ枠を保存</button><span class="version" data-version-label>v${options.project.version}</span></div><p class="feedback" data-form-feedback aria-live="polite"></p></form>
               ${narrationSegmentCreator}${narrationSegmentOutline}${voiceSegments}
             </div></details>
             <details class="inspector-section" id="inspector-structure" data-inspector-section="structure"${flowComposition ? "" : " open"}><summary>構造 · ${escapeHtml(slideCompositionLabel(slide))}</summary><div class="inspector-body"><p class="mode-note">${escapeHtml(modeNote)}</p>${compositionEditor}${canvasBlockCreator}${scenePatternCreate}${sceneComponentCreate}${canvasBlockEditors}${sceneComponentEditors}${componentSearch}${componentOutline}</div></details>
           ${effectiveSummary}
             <details class="workspace-guide"><summary>この編集画面の使い方</summary><div class="workspace-guide-body"><p><strong>1 · スライドを選ぶ</strong>左の一覧で一枚を選びます。検索するとタイトル・構成・音声状態で絞れます。</p><p><strong>2 · 実表示で確認</strong>中央は公開時と同じrendererです。段階ボタンでSTEPごとの見え方を確認します。</p><p><strong>3 · 項目ごとに保存</strong>プレビュー下の編集ドックで、内容、デザイン、読み上げ、構造を編集します。変更した欄の保存ボタンを押します。</p><p><strong>4 · 品質を解消</strong>見切れや文字サイズは品質確認に出ます。研究詳細で全スライド確認後、previewを作成します。</p></div></details>
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
      `<main data-surface="disclosure" id="main-content" tabindex="-1"><section class="panel notice"><p class="eyebrow">Not found</p><h1 class="detail-title">研究が見つかりません</h1><p class="lead">削除されたか、このアカウントでは表示できない研究です。</p><a class="button primary" href="/dashboard">自分の研究へ戻る</a></section></main>`
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
