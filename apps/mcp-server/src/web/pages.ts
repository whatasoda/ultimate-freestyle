import { escapeHtml } from "../auth/pages";
import { PROJECT_IMAGE_LIMIT, type ProjectAsset } from "../assets/schema";
import type {
  ProjectRecord,
  ProjectSummary,
  SlideBlock,
  SlideSceneNode
} from "../projects/schema";
import type {
  DashboardProjectSummary,
  ProjectDraftRevision,
  ProjectDraftRevisionSummary
} from "../projects/repository";
import {
  DEFAULT_VOICEVOX_TUNING,
  VOICEVOX_TUNING_LIMITS,
  mergeVoicevoxTuning,
  type VoicevoxTuning
} from "@ultimate-freestyle/research-schema/voice";
import {
  MAX_PRESENTATION_ASSETS,
  MAX_PRESENTATION_ASSET_BYTES,
  MAX_PRESENTATION_DURATION_SECONDS,
  type PublicationStatus
} from "../publications/service";
import {
  listPresentationAssetIds,
  PRESENTATION_RENDERER_VERSION
} from "../presentation/render";
import { VOICEVOX_CATALOG } from "@ultimate-freestyle/research-schema/voicevox-catalog";
import { resolveSlideTypography } from "../projects/typography";
import { TEMPLATE_PRESET_DEFAULTS } from "../projects/mutation-tools";
import { MAX_JOB_CHARACTERS } from "../voicevox/service";

const STAGE_LABELS: Record<ProjectSummary["stage"], string> = {
  discovery: "発見",
  design: "設計",
  fieldwork: "調査・実験",
  story: "構成",
  production: "制作",
  review: "見直し"
};

function formatDuration(seconds: number): string {
  return `${Math.floor(seconds / 60)}分${String(seconds % 60).padStart(2, "0")}秒`;
}

type ProjectSlide = NonNullable<ProjectRecord["document"]["deck"]>["slides"][number];
type ProjectVoicevox = NonNullable<
  NonNullable<ProjectRecord["document"]["deck"]>["voicevox"]
>;

function markdownTableShape(markdown: string): { columns: number; rows: number } {
  const lines = markdown.split(/\r?\n/);
  let columns = 0;
  let rows = 0;
  const cells = (line: string) => line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
  for (let index = 0; index < lines.length - 1; index += 1) {
    const header = cells(lines[index] ?? "");
    const separator = cells(lines[index + 1] ?? "");
    if (
      header.length < 2 ||
      header.length !== separator.length ||
      !separator.every((cell) => /^:?-{3,}:?$/.test(cell))
    ) continue;
    let tableRows = 1;
    for (let row = index + 2; row < lines.length; row += 1) {
      if (!(lines[row] ?? "").includes("|")) break;
      tableRows += 1;
    }
    columns = Math.max(columns, header.length);
    rows = Math.max(rows, tableRows);
  }
  return { columns, rows };
}

function staticSlideQuality(
  slide: ProjectSlide,
  aspectRatio: "16:9" | "4:3",
  voicevox?: ProjectVoicevox | null
): string[] {
  const warnings: string[] = [];
  const titleLimit = slide.role === "cover"
    ? aspectRatio === "4:3" ? 22 : 30
    : aspectRatio === "4:3" ? 34 : 44;
  if (slide.title.length > titleLimit) {
    warnings.push(
      `タイトルが${slide.title.length}文字あります。改行位置と見出しの自動縮小を確認してください。`
    );
  }
  if (slide.title.split(/\s+/).some((word) => /^[\x20-\x7e]+$/.test(word) && word.length > 24)) {
    warnings.push("タイトルに長い英数字の語があります。空白または改行を入れて見切れを防いでください。");
  }
  if (slide.composition === null || slide.composition === undefined) {
    const adjustedBodyLimit = recommendedFlowBodyLimit(slide, aspectRatio);
    if (slide.content_markdown.length > adjustedBodyLimit) {
      warnings.push(
        `本文が${slide.content_markdown.length}文字あります。実表示の自動縮小と段組みを確認してください。`
      );
    }
    if ((slide.sidebar_markdown?.length ?? 0) > (aspectRatio === "4:3" ? 220 : 300)) {
      warnings.push("補足欄の文章量が多いため、本文との配分を確認してください。");
    }
    const contentTable = markdownTableShape(slide.content_markdown);
    if (contentTable.columns > (aspectRatio === "4:3" ? 3 : 4) || contentTable.rows > 7) {
      warnings.push("比較表が密です。列数・行数またはスライド分割を確認してください。");
    }
    const sidebarTable = markdownTableShape(slide.sidebar_markdown ?? "");
    if (sidebarTable.columns > 2 || sidebarTable.rows > 5) {
      warnings.push("補足欄の比較表が密です。列数・行数または本文側への移動を確認してください。");
    }
  }
  const narrationAppearance = slide.narration?.appearance;
  const narrationLimit = slide.narration?.display === "inline"
    ? 500
    : Math.max(90, (narrationAppearance?.max_lines ?? 4) * 45);
  if ((slide.narration?.segments ?? []).some((segment) => segment.text.length > narrationLimit)) {
    warnings.push("一度に表示する読み上げ文が長いため、区間分割または表示形式を確認してください。");
  }
  const unitDuration = slide.duration_seconds / (slide.reveal_steps + 1);
  if ((slide.narration?.segments ?? []).some((segment) => {
    const profileId = segment.voice_profile_id ?? voicevox?.default_profile_id;
    const profile = voicevox?.profiles.find((item) => item.id === profileId);
    const speed = mergeVoicevoxTuning(
      profile?.tuning ?? undefined,
      segment.voice_tuning ?? undefined
    ).speedScale;
    return segment.text.length / (7 * speed) > unitDuration * 1.15;
  })) {
    warnings.push("読み上げの概算時間がSTEPの想定秒数を超えています。原稿、話速、想定秒数を確認してください。");
  }
  return warnings;
}

function recommendedFlowBodyLimit(
  slide: ProjectSlide,
  aspectRatio: "16:9" | "4:3"
): number {
  const typography = resolveSlideTypography(slide.typography);
  const presetFactor = {
    statement: 0.55,
    standard: 1,
    article: 1.45,
    columns: 1.5,
    dense: 1.75
  }[typography.preset];
  const base = aspectRatio === "4:3" ? 460 : 600;
  const sidebarFactor = slide.sidebar_markdown?.trim() ? 0.78 : 1;
  const scaleFactor = Math.pow(1 / typography.body_scale, 1.6);
  const lineHeightFactor = 1.5 / typography.line_height;
  const columnFactor = 1 + (typography.columns - 1) * 0.08;
  return Math.round(Math.min(1_600, Math.max(180, base * sidebarFactor * presetFactor * scaleFactor * lineHeightFactor * columnFactor)) / 10) * 10;
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

const DASHBOARD_SCRIPT_SRC = "/assets/dashboard.js?v=112";

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
      .hero { display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(18rem, .75fr); gap: clamp(2rem, 6vw, 5rem); align-items: center; }
      .hero-copy { min-width: 0; }
      .landing-flow { display: grid; gap: .75rem; margin: 0; padding: 1rem; border: 1px solid var(--line); border-radius: 1rem; background: #101a28cc; list-style: none; counter-reset: landing-step; }
      .landing-flow li { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: .75rem; align-items: start; padding: .8rem; border-radius: .75rem; background: #08111bbb; color: #c7d3e1; line-height: 1.55; counter-increment: landing-step; }
      .landing-flow li::before { content: counter(landing-step); display: grid; place-items: center; width: 1.8rem; height: 1.8rem; border-radius: 50%; background: var(--accent); color: white; font-weight: 850; }
      .landing-flow strong { display: block; margin-bottom: .2rem; color: var(--ink); }
      .landing-flow small { color: var(--muted); }
      .eyebrow { margin: 0 0 .7rem; color: #91ddff; font-size: .78rem; font-weight: 850; letter-spacing: .14em; text-transform: uppercase; }
      h1 { margin: 0; font-size: clamp(2.25rem, 7vw, 5.4rem); line-height: 1.02; letter-spacing: -.045em; }
      .keep-word { white-space: nowrap; }
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
      .dashboard-filter { display: flex; align-items: center; flex-wrap: wrap; justify-content: flex-end; gap: .4rem; }
      .dashboard-filter button { min-height: 2.35rem; padding: .45rem .65rem; font-size: .78rem; }
      .dashboard-filter button[aria-pressed="true"] { border-color: #9d7bff; background: #8062df30; color: white; }
      .dashboard-sort { display: flex; align-items: center; gap: .35rem; color: var(--muted); font-size: .78rem; }
      .dashboard-sort select { min-height: 2.35rem; padding: .4rem .55rem; border: 1px solid var(--line); border-radius: .55rem; background: #0a111b; color: var(--ink); font: inherit; }
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
      .project-statuses { display: flex; flex-wrap: wrap; gap: .35rem; margin-top: .8rem; }
      .project-status { padding: .22rem .45rem; border: 1px solid #52647c; border-radius: 999px; color: #c4cfdd; font-size: .7rem; font-weight: 750; }
      .project-status[data-state="ready"] { border-color: #36785b; background: #15312566; color: #9be6bd; }
      .project-status[data-state="attention"] { border-color: #826b30; background: #2a210d; color: #ffe09a; }
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
      .stat-list dd[data-state="warning"] { color: #ffd681; }
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
      .slide-quality-warning { display: inline-flex; margin-top: .32rem; padding: .16rem .42rem; border: 1px solid #826b30; border-radius: 999px; background: #2a210d; color: #ffe09a; font-size: .68rem; font-weight: 760; }
      .slide-list { max-height: 32rem; overflow: auto; overscroll-behavior: contain; }
      .quality-sweep { display: grid; gap: .8rem; }
      .quality-sweep-head { display: flex; align-items: center; flex-wrap: wrap; gap: .7rem; }
      .quality-sweep-head progress { min-width: min(100%, 14rem); flex: 1; accent-color: #74e6b2; }
      .quality-sweep-results { display: grid; gap: .45rem; margin: 0; padding: 0; list-style: none; }
      .quality-sweep-results li { padding: .65rem .75rem; border: 1px solid var(--line); border-radius: .65rem; background: #08111b; color: #c7d3e1; line-height: 1.55; }
      .quality-sweep-results a { color: #b9ddff; font-weight: 760; }
      .quality-sweep-preview { width: min(100%, 48rem); aspect-ratio: var(--quality-sweep-aspect, 16 / 9); overflow: hidden; border: 1px solid #40516a; border-radius: .65rem; background: #05080d; }
      .quality-sweep-preview[hidden] { display: none; }
      .quality-sweep-preview iframe { display: block; width: 100%; height: 100%; border: 0; }
      .asset-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr)); gap: .8rem; }
      .asset { overflow: hidden; border: 1px solid var(--line); border-radius: .8rem; background: #0b1420; }
      .asset img { display: block; width: 100%; aspect-ratio: 16 / 10; object-fit: cover; background: #08101a; }
      .asset-body { display: grid; gap: .55rem; padding: .75rem; }
      .asset-body p { margin: 0; font-size: .86rem; }
      .asset-body button { justify-self: start; min-height: 2.2rem; padding: .45rem .7rem; font-size: .8rem; }
      .asset-alt { display: grid; gap: .45rem; }
      .asset-alt label { display: grid; gap: .3rem; color: #c9d5e4; font-size: .78rem; }
      .asset-alt input { width: 100%; padding: .55rem; border: 1px solid var(--line); border-radius: .5rem; background: #07101a; color: var(--ink); font: inherit; }
      .asset-alt .actions { gap: .45rem; }
      .upload { display: grid; gap: .8rem; margin-bottom: 1rem; padding: 1rem; border: 1px dashed #52647c; border-radius: .8rem; background: #0c1724; }
      .upload label { display: grid; gap: .35rem; color: #c9d5e4; font-size: .9rem; }
      .upload input { width: 100%; padding: .65rem; border: 1px solid var(--line); border-radius: .55rem; background: #0a111b; color: var(--ink); font: inherit; }
      .upload-dropzone { padding: 1rem; border: 1px dashed #6b7f99; border-radius: .75rem; background: #08111b; text-align: center; transition: border-color .15s ease, background .15s ease; }
      .upload-dropzone[data-drag-active="true"] { border-color: #91ddff; background: #123149; color: #e5f6ff; }
      .upload-dropzone span { font-weight: 760; }
      .upload-dropzone small { color: var(--muted); }
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
      .markdown-toolbar { display: flex; flex-wrap: wrap; gap: .35rem; margin-bottom: -.55rem; }
      .markdown-toolbar button { min-height: 2rem; padding: .35rem .55rem; font-size: .75rem; }
      .visual-picker { display: grid; grid-template-columns: repeat(auto-fit, minmax(6.2rem, 1fr)); gap: .45rem; }
      .visual-pick { display: grid; grid-template-columns: 1.4rem minmax(0, 1fr); gap: .45rem; min-height: 2.5rem; padding: .45rem; border: 1px solid var(--line); background: #0a111b; color: #cbd6e4; font-size: .72rem; text-align: left; }
      .visual-pick[aria-pressed="true"] { border-color: #9d7bff; background: #8062df24; color: white; }
      .visual-swatch { width: 1.4rem; height: 1.4rem; border: 1px solid #ffffff44; border-radius: 50%; background: var(--visual-swatch); box-shadow: inset -.45rem 0 var(--visual-accent); }
      .visual-pick[data-visual-pick="studio"] { --visual-swatch: #111827; --visual-accent: #8062df; }
      .visual-pick[data-visual-pick="paper"] { --visual-swatch: #f7f3ea; --visual-accent: #4f91e8; }
      .visual-pick[data-visual-pick="editorial"] { --visual-swatch: #f2eadb; --visual-accent: #9b513c; }
      .visual-pick[data-visual-pick="neon"] { --visual-swatch: #09071b; --visual-accent: #4de9ff; }
      .visual-pick[data-visual-pick="retro-game"] { --visual-swatch: #171a20; --visual-accent: #ffd166; }
      .visual-pick[data-visual-pick="soft-pop"] { --visual-swatch: #f7edf5; --visual-accent: #e879b7; }
      .visual-pick[data-visual-pick="scientific"] { --visual-swatch: #edf4f5; --visual-accent: #1b7b91; }
      .visual-pick[data-visual-pick="museum"] { --visual-swatch: #f4efe2; --visual-accent: #a57b34; }
      .visual-pick[data-visual-pick="terminal"] { --visual-swatch: #07110b; --visual-accent: #54f58a; }
      .color-control { display: grid; grid-template-columns: 3.2rem minmax(0, 1fr); gap: .45rem; }
      .editor .color-control input[type="color"] { min-height: 2.9rem; padding: .25rem; cursor: pointer; }
      .editor .color-control input[data-color-text] { min-width: 0; font-family: "SFMono-Regular", Consolas, monospace; text-transform: lowercase; }
      .editor .color-control input[data-color-text][aria-invalid="true"] { border-color: #e88787; }
      .font-picker { display: grid; grid-template-columns: repeat(auto-fit, minmax(7.4rem, 1fr)); gap: .45rem; }
      .font-pick { display: grid; gap: .2rem; min-height: 3.4rem; padding: .5rem; border: 1px solid var(--line); background: #0a111b; color: #e4ebf5; text-align: left; }
      .font-pick[aria-pressed="true"] { border-color: #9d7bff; background: #8062df24; }
      .font-pick small { color: var(--muted); font: 600 .64rem/1.2 system-ui, sans-serif; }
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
      .cover-pick { display: grid; gap: .35rem; min-height: 4.4rem; padding: .45rem; border: 1px solid var(--line); background: #0a111b; color: #cbd6e4; font-size: .68rem; }
      .cover-pick[aria-pressed="true"] { border-color: #9d7bff; background: #8062df24; color: white; }
      .cover-wire { position: relative; display: block; width: 100%; aspect-ratio: 16 / 9; border: 1px solid #6b7c92; border-radius: .2rem; background: #162131; }
      .cover-wire::before, .cover-wire::after { content: ""; position: absolute; border-radius: 99px; background: #dce6f3; }
      .cover-wire::before { left: 18%; top: 38%; width: 64%; height: 12%; }
      .cover-wire::after { left: 30%; top: 58%; width: 40%; height: 6%; background: #91ddff; }
      .cover-pick[data-cover-pick="split"] .cover-wire { background: linear-gradient(90deg, #162131 50%, #26364b 50%); }
      .cover-pick[data-cover-pick="split"] .cover-wire::before { left: 8%; width: 36%; }
      .cover-pick[data-cover-pick="split"] .cover-wire::after { left: 57%; top: 30%; width: 30%; height: 36%; border-radius: .2rem; }
      .cover-pick[data-cover-pick="poster"] .cover-wire::before { left: 7%; top: 22%; width: 75%; height: 22%; }
      .cover-pick[data-cover-pick="poster"] .cover-wire::after { left: 7%; top: 52%; width: 52%; }
      .cover-pick[data-cover-pick="minimal"] .cover-wire::before { left: 36%; top: 44%; width: 28%; height: 7%; }
      .cover-pick[data-cover-pick="minimal"] .cover-wire::after { left: 42%; top: 57%; width: 16%; height: 4%; }
      .cover-pick[data-cover-pick="statement"] .cover-wire::before { left: 9%; top: 30%; width: 82%; height: 25%; background: #91ddff; }
      .cover-pick[data-cover-pick="statement"] .cover-wire::after { display: none; }
      .cover-pick[data-cover-pick="band"] .cover-wire::before { left: 0; top: 35%; width: 100%; height: 30%; border-radius: 0; background: #31435b; }
      .cover-pick[data-cover-pick="band"] .cover-wire::after { left: 28%; top: 48%; width: 44%; height: 6%; }
      .cover-pick[data-cover-pick="corner"] .cover-wire::before { left: 10%; top: 52%; width: 58%; height: 13%; }
      .cover-pick[data-cover-pick="corner"] .cover-wire::after { left: 7%; top: 48%; width: 2%; height: 27%; border-radius: 0; background: #91ddff; }
      .cover-pick[data-cover-pick="frame"] .cover-wire { border: 3px double #91ddff; }
      .cover-pick[data-cover-pick="frame"] .cover-wire::before { left: 23%; top: 39%; width: 54%; height: 10%; }
      .cover-pick[data-cover-pick="frame"] .cover-wire::after { left: 36%; top: 57%; width: 28%; }
      .narration-picker { display: grid; grid-template-columns: repeat(auto-fit, minmax(5.8rem, 1fr)); gap: .45rem; }
      .narration-display-pick { display: grid; gap: .35rem; min-height: 4.4rem; padding: .45rem; border: 1px solid var(--line); background: #0a111b; color: #cbd6e4; font-size: .68rem; }
      .narration-display-pick[aria-pressed="true"] { border-color: #9d7bff; background: #8062df24; color: white; }
      .narration-wire { position: relative; display: block; width: 100%; aspect-ratio: 16 / 9; overflow: hidden; border: 1px solid #6b7c92; border-radius: .2rem; background: #253247; }
      .narration-wire::before, .narration-wire::after { content: ""; position: absolute; }
      .narration-wire::before { left: 5%; right: 5%; bottom: 6%; height: 31%; border: 1px solid #91ddff; border-radius: .18rem; background: #0a111bdd; }
      .narration-wire::after { left: 12%; right: 14%; bottom: 17%; height: 4%; border-radius: 99px; background: #e8eff8; box-shadow: 0 .42rem #a9b5c7; }
      .narration-display-pick[data-narration-display-pick="commentary"] .narration-wire::before { height: 20%; border-radius: 0; }
      .narration-display-pick[data-narration-display-pick="commentary"] .narration-wire::after { bottom: 13%; box-shadow: none; }
      .narration-display-pick[data-narration-display-pick="inline"] .narration-wire::before { height: 38%; border-color: #d8dee8; background: #f8fafcee; }
      .narration-display-pick[data-narration-display-pick="inline"] .narration-wire::after { bottom: 24%; background: #2b3543; box-shadow: 0 .38rem #718096, 0 .76rem #718096; }
      .narration-display-pick[data-narration-display-pick="subtitle"] .narration-wire::before { left: 14%; right: 14%; bottom: 8%; height: 13%; border: 0; background: #000a; }
      .narration-display-pick[data-narration-display-pick="subtitle"] .narration-wire::after { bottom: 13%; box-shadow: none; }
      .narration-display-pick[data-narration-display-pick="minimal"] .narration-wire::before { left: 25%; right: 25%; bottom: 9%; height: 14%; border: 0; border-radius: 99px; background: #000a; }
      .narration-palette { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .4rem; }
      .narration-color-pick { display: grid; grid-template-columns: 1.4rem minmax(0, 1fr); gap: .45rem; min-height: 2.5rem; padding: .45rem; border: 1px solid var(--line); background: #0a111b; color: #cbd6e4; font-size: .72rem; text-align: left; }
      .narration-color-swatch { width: 1.4rem; height: 1.4rem; border: 1px solid var(--palette-border); border-radius: .35rem; background: var(--palette-background); box-shadow: inset 0 -.35rem var(--palette-accent); }
      .narration-display-pick[data-narration-display-pick="minimal"] .narration-wire::after { left: 34%; right: 34%; bottom: 14%; box-shadow: none; }
      .region-picker { display: grid; grid-template-columns: repeat(auto-fit, minmax(5.4rem, 1fr)); gap: .45rem; }
      .region-pick { display: grid; gap: .35rem; min-height: 4.2rem; padding: .45rem; border: 1px solid var(--line); background: #0a111b; color: #cbd6e4; font-size: .66rem; }
      .region-pick[aria-pressed="true"] { border-color: #9d7bff; background: #8062df24; color: white; }
      .region-wire { display: block; width: 100%; aspect-ratio: 16 / 9; border: 1px solid #6b7c92; border-radius: .2rem; background: #26364b; }
      .region-pick[data-region-pick="sidebar-right"] .region-wire { background: linear-gradient(90deg, #26364b 0 70%, #8062df 70%); }
      .region-pick[data-region-pick="sidebar-left"] .region-wire { background: linear-gradient(90deg, #8062df 0 30%, #26364b 30%); }
      .region-pick[data-region-pick="lower-third"] .region-wire { background: linear-gradient(#26364b 0 68%, #8062df 68%); }
      .region-pick[data-region-pick="split"] .region-wire { background: linear-gradient(90deg, #26364b 0 49%, #8062df 49% 51%, #34465d 51%); }
      .region-pick[data-region-pick="top-band"] .region-wire { background: linear-gradient(#8062df 0 28%, #26364b 28%); }
      .region-pick[data-region-pick="focus"] .region-wire { background: radial-gradient(ellipse at center, #8062df 0 36%, #26364b 37%); }
      .animation-picker { display: grid; grid-template-columns: repeat(auto-fit, minmax(5.8rem, 1fr)); gap: .4rem; }
      .animation-pick { display: grid; grid-template-columns: 1.4rem minmax(0, 1fr); gap: .35rem; align-items: center; min-height: 2.6rem; padding: .4rem .5rem; border: 1px solid var(--line); background: #0a111b; color: #cbd6e4; font-size: .68rem; text-align: left; }
      .animation-pick[aria-pressed="true"] { border-color: #9d7bff; background: #8062df24; color: white; }
      .animation-symbol { display: grid; place-items: center; width: 1.35rem; height: 1.35rem; border-radius: .35rem; background: #20314a; color: #b9ddff; font-size: .8rem; font-weight: 900; }
      .animation-replay { justify-self: start; min-height: 2.25rem; padding: .4rem .65rem; font-size: .75rem; }
      .tone-picker { display: grid; grid-template-columns: repeat(auto-fit, minmax(5.8rem, 1fr)); gap: .4rem; }
      .tone-pick { display: grid; grid-template-columns: 1.5rem minmax(0, 1fr); gap: .4rem; align-items: center; min-height: 2.6rem; padding: .4rem .5rem; border: 1px solid var(--line); background: #0a111b; color: #cbd6e4; font-size: .68rem; text-align: left; }
      .tone-pick[aria-pressed="true"] { border-color: #9d7bff; background: #8062df24; color: white; }
      .tone-swatch { width: 1.45rem; height: 1.45rem; border: 1px solid #ffffff55; border-radius: .35rem; background: var(--tone-color); box-shadow: inset 0 -.38rem var(--tone-accent); }
      .tone-pick[data-tone-pick="dark"] { --tone-color: #111827; --tone-accent: #9d7bff; }
      .tone-pick[data-tone-pick="light"] { --tone-color: #f7f3ea; --tone-accent: #4f91e8; }
      .tone-pick[data-tone-pick="signal"] { --tone-color: #2d1f55; --tone-accent: #ffcf4a; }
      .tone-pick[data-tone-pick="quiet"] { --tone-color: #e8edf2; --tone-accent: #718096; }
      .loading-style-picker { display: grid; grid-template-columns: repeat(auto-fit, minmax(6rem, 1fr)); gap: .45rem; }
      .loading-style-pick { display: grid; gap: .35rem; min-height: 4.6rem; padding: .45rem; border: 1px solid var(--line); background: #0a111b; color: #cbd6e4; font-size: .68rem; }
      .loading-style-pick[aria-pressed="true"] { border-color: #9d7bff; background: #8062df24; color: white; }
      .loading-wire { position: relative; display: block; width: 100%; aspect-ratio: 16 / 9; overflow: hidden; border: 1px solid #52647c; border-radius: .2rem; background: #080d15; }
      .loading-wire::before, .loading-wire::after { content: ""; position: absolute; }
      .loading-wire::before { left: 25%; right: 25%; top: 42%; height: 10%; border-radius: 99px; background: #91ddff; }
      .loading-wire::after { left: 20%; right: 20%; bottom: 18%; height: 4%; border-radius: 99px; background: #52647c; }
      .loading-style-pick[data-loading-style-pick="pulse"] .loading-wire::before { left: 36%; right: auto; top: 24%; width: 28%; height: auto; aspect-ratio: 1; background: radial-gradient(circle, #8062df, transparent 68%); }
      .loading-style-pick[data-loading-style-pick="orbit"] .loading-wire::before { left: 31%; right: auto; top: 17%; width: 38%; height: auto; aspect-ratio: 1; border: 2px solid #4f91e8; background: transparent; }
      .loading-style-pick[data-loading-style-pick="research-log"] .loading-wire { background: repeating-linear-gradient(90deg, #d9d2c5 0 1px, #f3efe6 1px 18%); }
      .loading-style-pick[data-loading-style-pick="research-log"] .loading-wire::before { left: 8%; right: 24%; top: 28%; background: #273444; }
      .actions { display: flex; align-items: center; flex-wrap: wrap; gap: .7rem; }
      button:disabled { cursor: not-allowed; opacity: .55; }
      button[aria-busy="true"] { cursor: wait; }
      .character-count { justify-self: end; margin-top: -.2rem; color: var(--muted); font-size: .7rem; font-variant-numeric: tabular-nums; }
      .character-count[data-near-limit="true"] { color: #ffd681; font-weight: 750; }
      .character-count[data-over-limit="true"] { color: #ff9fa9; font-weight: 800; }
      .content-structure { display: flex; align-items: center; flex-wrap: wrap; gap: .35rem; padding: .55rem; border: 1px solid var(--line); border-radius: .6rem; background: #08111b80; }
      .content-structure span { padding: .25rem .42rem; border-radius: 999px; background: #172536; color: #c9d5e4; font-size: .7rem; font-variant-numeric: tabular-nums; }
      .content-structure button { min-height: 2rem; margin-left: auto; padding: .3rem .5rem; font-size: .72rem; }
      .publish-state { display: grid; gap: .8rem; }
      .preflight-list { display: grid; gap: .45rem; margin: 0; padding: 0; list-style: none; }
      .preflight-item { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: .65rem; align-items: start; padding: .65rem .7rem; border: 1px solid var(--line); border-radius: .65rem; background: #0a131f; color: #c7d3e1; font-size: .82rem; line-height: 1.55; }
      .preflight-item::before { content: "✓"; display: grid; place-items: center; width: 1.35rem; height: 1.35rem; border-radius: 50%; background: #174d3a; color: #91efc4; font-weight: 900; }
      .preflight-item[data-state="attention"]::before { content: "!"; background: #5a4618; color: #ffe29a; }
      .preflight-item[data-state="recommendation"]::before { content: "i"; background: #183f5a; color: #a7ddff; }
      .preflight-item strong, .preflight-item small { display: block; }
      .preflight-item small { margin-top: .12rem; color: var(--muted); }
      .preflight-action { align-self: center; padding: .25rem .45rem; border-radius: .4rem; color: #b9ddff; font-weight: 750; text-decoration: none; white-space: nowrap; }
      .preflight-action:hover { background: #ffffff0d; }
      .status-row { display: flex; justify-content: space-between; gap: 1rem; padding: .65rem 0; border-top: 1px solid var(--line); }
      .status-row:first-of-type { border-top: 0; }
      .status-row span { color: var(--muted); }
      .publication-history { display: grid; gap: .35rem; margin-top: .65rem; }
      .publication-history .status-row { align-items: center; padding: .55rem .65rem; border: 1px solid var(--line); border-radius: .55rem; }
      .publication-history .status-row span, .publication-history .status-row small { display: grid; gap: .12rem; }
      .publication-history .actions { display: flex; align-items: center; gap: .4rem; }
      .draft-history { display: grid; gap: .45rem; margin-top: .65rem; }
      .draft-revision { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: .6rem; align-items: center; padding: .65rem; border: 1px solid var(--line); border-radius: .6rem; background: #08111b88; }
      .draft-revision p, .draft-revision small { margin: 0; }
      .draft-revision small { color: var(--muted); }
      .revision-preview { width: 100%; aspect-ratio: var(--revision-aspect, 16 / 9); border: 1px solid #40516a; border-radius: .8rem; background: #05080d; }
      .revision-slide-list { display: grid; gap: .45rem; margin: 0; padding: 0; list-style: none; }
      .revision-slide-list li { display: grid; grid-template-columns: 2.5rem minmax(0, 1fr) auto; gap: .6rem; padding: .65rem; border: 1px solid var(--line); border-radius: .6rem; color: #cbd6e4; }
      .success { color: #74e6b2 !important; }
      .warning { color: #ffd681 !important; }
      .upload-actions { display: flex; align-items: center; flex-wrap: wrap; gap: .75rem; }
      .feedback { min-height: 1.4em; margin: 0; color: #9fddf5; font-size: .88rem; }
      .draft-recovery { display: flex; align-items: center; justify-content: space-between; gap: .7rem; margin: 0; padding: .65rem .75rem; border: 1px solid #826b30; border-radius: .65rem; background: #2a210d; color: #ffe09a; font-size: .78rem; line-height: 1.5; }
      .draft-recovery.conflict { display: grid; background: #321d14; border-color: #a45c3e; }
      .draft-recovery p { margin: 0; }
      .draft-recovery-actions { display: flex; flex-wrap: wrap; gap: .45rem; }
      .draft-recovery button { min-height: 2rem; padding: .35rem .55rem; white-space: nowrap; font-size: .72rem; }
      .notice { max-width: 42rem; margin: 3rem auto; text-align: center; }
      main.workspace-main { width: min(96vw, 100rem); padding-top: 1rem; }
      .workspace-head { display: grid; gap: .75rem; margin-bottom: 1rem; }
      .workspace-head > div:first-child { min-width: 0; }
      .workspace-head h1 { max-width: min(100%, 32ch); font-size: clamp(1.65rem, 3vw, 2.8rem); line-height: 1.12; overflow-wrap: anywhere; word-break: auto-phrase; text-wrap: balance; }
      .workspace-version { display: flex; align-items: center; justify-content: flex-start; flex-wrap: wrap; gap: .55rem; color: var(--muted); }
      .slide-actions { display: flex; flex-wrap: wrap; gap: .4rem; align-items: center; }
      .slide-actions button { min-height: 2.2rem; padding: .45rem .62rem; }
      .slide-actions .danger { border-color: #7e3b49; color: #ffb8c3; }
      .actions .danger { border-color: #7e3b49; color: #ffb8c3; }
      [data-appearance-editor]:has(select[name="role"] option[value="content"]:checked) label:has(select[name="cover_layout"]), [data-appearance-editor]:has(select[name="role"] option[value="content"]:checked) [aria-label="表紙レイアウトを選ぶ"] { display: none; }
      .save-state { padding: .28rem .55rem; border: 1px solid #36785b; border-radius: 999px; background: #15312566; color: #9be8c1; font-size: .75rem; font-weight: 760; white-space: nowrap; }
      .save-state[data-state="dirty"] { border-color: #826b30; background: #2a210d; color: #ffe09a; }
      .save-state[data-state="saving"] { border-color: #35506a; background: #0a1b29; color: #bfe6f7; }
      .slide-workspace { display: grid; grid-template-columns: minmax(10rem, 15rem) minmax(0, 1fr) minmax(17rem, 22rem); gap: 1rem; align-items: start; }
      .mobile-workspace-tabs { display: none; }
      body[data-preview-focus="true"] .slide-workspace { grid-template-columns: minmax(0, 1fr); }
      body[data-preview-focus="true"] .filmstrip, body[data-preview-focus="true"] .inspector { display: none; }
      body[data-preview-focus="true"] .workspace-preview { width: min(100%, 96rem); margin: 0 auto; }
      .filmstrip, .inspector { display: grid; gap: .65rem; align-content: start; max-height: calc(100vh - 10rem); overflow: auto; }
      .filmstrip-search { position: sticky; z-index: 2; top: 0; display: grid; gap: .3rem; padding-bottom: .35rem; background: linear-gradient(var(--bg) 80%, transparent); color: var(--muted); font-size: .72rem; font-weight: 700; }
      .filmstrip-search input { min-height: 2.35rem; padding: .5rem .65rem; font-size: .8rem; }
      .filmstrip-empty { margin: .4rem; color: var(--muted); font-size: .8rem; }
      .filmstrip-link { display: grid; grid-template-columns: 2rem minmax(0, 1fr); gap: .55rem; padding: .7rem; border: 1px solid var(--line); border-radius: .65rem; color: #bdc9d8; text-decoration: none; }
      .filmstrip-link span { color: var(--muted); font: 700 .76rem/1.3 ui-monospace, monospace; }
      .filmstrip-link strong { overflow-wrap: anywhere; font-size: .86rem; line-height: 1.35; }
      .filmstrip-link .filmstrip-meta { display: block; margin-top: .3rem; color: var(--muted); font-size: .68rem; font-weight: 550; line-height: 1.45; }
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
      .setting-chip[data-state="warning"] { border-color: #826b30; background: #2a210d; color: #ffe09a; }
      .inspector-section { overflow: hidden; border: 1px solid var(--line); border-radius: 1rem; background: var(--panel); }
      .inspector-section > summary { display: flex; align-items: center; justify-content: space-between; gap: .7rem; padding: 1rem 1.15rem; cursor: pointer; font-weight: 820; }
      .inspector-section > summary::marker { color: var(--accent); }
      .inspector-section[open] > summary { border-bottom: 1px solid var(--line); }
      .inspector-body { display: grid; gap: .9rem; padding: 1rem; }
      .editor fieldset { display: grid; gap: .7rem; min-width: 0; margin: 0; padding: .8rem; border: 1px solid var(--line); border-radius: .7rem; }
      .editor legend { padding: 0 .35rem; color: #dce6f3; font-size: .82rem; font-weight: 800; }
      .component-items { display: grid; gap: .7rem; }
      .editor .component-item { border-color: #40516a; background: #08111b80; }
      .component-item legend { color: #b9ddff; }
      .component-item legend code { margin-left: .35rem; color: var(--muted); font-size: .68rem; font-weight: 600; }
      [data-component-frame-controls][data-enabled="false"] .editor-grid { opacity: .48; }
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
      .voice-segment:target { border-color: var(--accent); box-shadow: 0 0 0 3px #2bb9ec33; }
      .voice-segment-head { display: flex; flex-wrap: wrap; justify-content: space-between; gap: .65rem; align-items: center; }
      .voice-timing { color: var(--muted); font-size: .72rem; font-variant-numeric: tabular-nums; }
      .voice-timing[data-state="warning"] { color: #ffcb78; font-weight: 750; }
      .audio-state { color: #ffd681; font-size: .75rem; }
      .audio-state.ready { color: #74e6b2; }
      .tuning-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .55rem; }
      .tuning-grid label { font-size: .78rem; }
      .inherit-note { color: var(--muted); font-size: .74rem; line-height: 1.55; }
      .quality-status { display: flex; align-items: center; gap: .6rem; margin: 0; padding: .75rem; border: 1px solid #35506a; border-radius: .7rem; background: #0a1b29; color: #bfe6f7; font-size: .84rem; line-height: 1.55; }
      .quality-status[data-level="warning"] { border-color: #826b30; background: #2a210d; color: #ffe09a; }
      .quality-list { display: grid; gap: .45rem; margin: 0; padding-left: 1.2rem; color: #bdc9d8; font-size: .8rem; line-height: 1.55; }
      .quality-list [data-layout-warning] { padding-right: .25rem; }
      .quality-list [data-diagnostic-fix] { min-height: 1.9rem; margin-left: .5rem; padding: .25rem .5rem; font-size: .72rem; }
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
      .voice-preset-fields { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: .65rem; min-width: 0; }
      .voice-preset select { width: 100%; padding: .65rem; border: 1px solid #52647c; border-radius: .55rem; background: #08111b; color: var(--ink); font: inherit; }
      .voice-preset small { margin-top: .25rem; color: var(--muted); line-height: 1.5; }
      .voice-preset .stage { justify-self: end; }
      .voice-quick { display: flex; flex-wrap: wrap; gap: .45rem; }
      .voice-quick button { min-height: 2.2rem; padding: .45rem .7rem; font-size: .78rem; }
      .voice-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(6.5rem, 1fr)); gap: .55rem; }
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
      .voice-result-count { margin-left: auto; color: var(--muted); font-size: .75rem; font-variant-numeric: tabular-nums; }
      .voice-search { width: 100%; min-height: 2.55rem; padding: .55rem .7rem; border: 1px solid var(--line); border-radius: .6rem; background: #0a111b; color: var(--ink); font: inherit; }
      .voice-review { overflow: hidden; border: 1px solid var(--line); border-radius: .75rem; background: #08111b77; }
      .voice-review > summary { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: .7rem; align-items: center; padding: .8rem; cursor: pointer; }
      .voice-review > summary::marker { color: var(--accent); }
      .voice-review-title { min-width: 0; }
      .voice-review-title strong, .voice-review-title small { display: block; overflow-wrap: anywhere; }
      .voice-review-title small { margin-top: .2rem; color: var(--muted); }
      .voice-review-body { display: grid; gap: .75rem; padding: 0 .8rem .8rem; }
      .voice-review-body p { margin: 0; color: #d7e0eb; line-height: 1.7; white-space: pre-wrap; overflow-wrap: anywhere; }
      .voice-audio-timeline { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: .65rem; align-items: center; }
      .voice-audio-timeline input { width: 100%; accent-color: var(--accent); }
      .voice-audio-timeline output { min-width: 7.5rem; color: var(--muted); font-size: .75rem; font-variant-numeric: tabular-nums; text-align: right; }
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
      @media (max-width: 48rem) { .hero, .detail-grid, .editor-grid, .slide-workspace, .tuning-grid, .voice-flow, .voice-hero, .journey-next, .setup-steps, .voice-preset-fields { grid-template-columns: 1fr; } .dashboard-tools { align-items: stretch; flex-direction: column; } .dashboard-filter { justify-content: flex-start; } .editor label.wide { grid-column: auto; } .mobile-workspace-tabs { position: sticky; z-index: 20; top: 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: .35rem; margin: 0 0 .65rem; padding: .45rem; border: 1px solid var(--line); border-radius: .75rem; background: #090f18ee; backdrop-filter: blur(12px); } .mobile-workspace-tabs button { min-height: 2.75rem; padding: .45rem; font-size: .78rem; } .mobile-workspace-tabs button[aria-selected="true"] { border-color: #9d7bff; background: #8062df40; color: white; } .tab-badge { display: inline-flex; margin-left: .25rem; padding: .1rem .3rem; border-radius: 999px; background: #8a4b16; color: #ffe5b8; font-size: .62rem; } .tab-badge[hidden] { display: none; } body[data-mobile-pane="preview"] .slide-workspace > :not(.workspace-preview), body[data-mobile-pane="edit"] .slide-workspace > :not(.inspector), body[data-mobile-pane="slides"] .slide-workspace > :not(.filmstrip) { display: none; } .filmstrip { display: flex; max-height: none; overflow-x: auto; } body[data-mobile-pane="slides"] .filmstrip { display: grid; overflow: visible; } body[data-mobile-pane="slides"] .filmstrip-link { min-width: 0; } .filmstrip-link { min-width: 12rem; } .inspector { grid-column: auto; } .voice-stats, .journey-steps { grid-template-columns: repeat(2, minmax(0, 1fr)); } .voice-next { position: static; } }
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
  return `<details class="component-detail"><summary>スライドを追加</summary><form class="editor" data-slide-create data-versioned-form data-method="POST" action="${options.action}" data-version="${options.version}" data-csrf="${escapeHtml(options.csrfToken)}"><label>タイトル<input name="title" maxlength="120" required placeholder="この一枚で伝えること"></label><div class="editor-grid"><label>雛形<select name="slide_template"><option value="flow">本文スライド</option><option value="cover">表紙</option><option value="canvas">自由配置</option><option value="scene">リッチ構成</option></select></label><label>挿入位置<select name="position">${positions}</select></label></div><p class="inherit-note">最低限の内容で追加し、次の画面で本文・読み上げ・見た目・表示パーツを調整します。</p><div class="actions"><button type="submit">追加して編集する</button><span class="version" data-version-label>v${options.version}</span></div><p class="feedback" data-form-feedback aria-live="polite"></p></form></details>`;
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
    const items = node.items.map((item, index) => `<fieldset class="component-item" data-component-item="${escapeHtml(item.id)}"><legend>項目 ${index + 1} <code>${escapeHtml(item.id)}</code></legend><div class="editor-grid">${sceneTextFieldControl({ name: `items.${index}.label`, label: "ラベル", value: item.label, maxLength: 120, required: true })}${sceneTextFieldControl({ name: `items.${index}.value`, label: "値", value: item.value, maxLength: 20, required: true, number: { min: 0, max: 1_000_000_000, step: 0.01 } })}<label>表示STEP<input name="items.${index}.at" data-component-field data-component-path="items.${index}.at" data-component-number="true" data-nullable="false" type="number" min="0" max="${maxStep}" value="${item.at}"></label><label>色<span class="color-control"><input type="color" value="${escapeHtml(item.color ?? "#9d7bff")}" data-component-color-preview="items.${index}.color" aria-label="項目${index + 1}の色を見本から選ぶ"><input name="items.${index}.color" data-component-field data-component-color-hex data-component-path="items.${index}.color" data-component-number="false" data-nullable="true" value="${escapeHtml(item.color ?? "")}" placeholder="空欄でアクセント色" pattern="^$|^#[0-9A-Fa-f]{6}$" maxlength="7" spellcheck="false"></span></label></div><div class="actions"><button class="ghost" type="button" data-scene-item-action="move" data-item-id="${escapeHtml(item.id)}" data-position="${index - 1}"${index === 0 ? " disabled" : ""}>↑ 前へ</button><button class="ghost" type="button" data-scene-item-action="move" data-item-id="${escapeHtml(item.id)}" data-position="${index + 1}"${index === node.items.length - 1 ? " disabled" : ""}>↓ 後へ</button><button class="ghost danger" type="button" data-scene-item-action="delete" data-item-id="${escapeHtml(item.id)}"${node.items.length <= 1 ? " disabled" : ""}>この項目を削除</button></div></fieldset>`).join("");
    return `<fieldset><legend>グラフ全体</legend><div class="editor-grid">${maxValue}</div></fieldset><div class="component-items">${items}</div><div class="actions"><button class="ghost" type="button" data-scene-item-action="add"${node.items.length >= 12 ? " disabled" : ""}>グラフ項目を追加</button></div>`;
  }
  if (node.kind === "timeline") {
    const items = node.items.map((item, index) => `<fieldset class="component-item" data-component-item="${escapeHtml(item.id)}"><legend>項目 ${index + 1} <code>${escapeHtml(item.id)}</code></legend><div class="editor-grid">${sceneTextFieldControl({ name: `items.${index}.kicker`, label: "時期", value: item.kicker, maxLength: 120, nullable: true })}${sceneTextFieldControl({ name: `items.${index}.heading`, label: "見出し", value: item.heading, maxLength: 500, required: true })}${sceneTextFieldControl({ name: `items.${index}.detail`, label: "詳細", value: item.detail, maxLength: 2_000, multiline: true, nullable: true })}<label>表示STEP<input name="items.${index}.at" data-component-field data-component-path="items.${index}.at" data-component-number="true" data-nullable="false" type="number" min="0" max="${maxStep}" value="${item.at}"></label></div><div class="actions"><button class="ghost" type="button" data-scene-item-action="move" data-item-id="${escapeHtml(item.id)}" data-position="${index - 1}"${index === 0 ? " disabled" : ""}>↑ 前へ</button><button class="ghost" type="button" data-scene-item-action="move" data-item-id="${escapeHtml(item.id)}" data-position="${index + 1}"${index === node.items.length - 1 ? " disabled" : ""}>↓ 後へ</button><button class="ghost danger" type="button" data-scene-item-action="delete" data-item-id="${escapeHtml(item.id)}"${node.items.length <= 1 ? " disabled" : ""}>この項目を削除</button></div></fieldset>`).join("");
    return `<div class="component-items">${items}</div><div class="actions"><button class="ghost" type="button" data-scene-item-action="add"${node.items.length >= 12 ? " disabled" : ""}>時系列項目を追加</button></div>`;
  }
  const controls = sceneTextFields(node).map(sceneTextFieldControl).join("");
  return controls ? `<fieldset><legend>内容</legend><div class="editor-grid">${controls}</div></fieldset>` : "";
}

function sceneComponentHierarchyControls(node: SlideSceneNode, nodes: SlideSceneNode[]): string {
  const descendants = new Set<string>();
  const collect = (parentId: string): void => {
    for (const child of nodes.filter((candidate) => candidate.parent_id === parentId)) {
      if (descendants.has(child.id)) continue;
      descendants.add(child.id);
      collect(child.id);
    }
  };
  collect(node.id);
  const parents = nodes
    .filter((candidate) => ["layer", "stack", "grid"].includes(candidate.kind) && candidate.id !== node.id && !descendants.has(candidate.id))
    .map((candidate) => `<option value="${escapeHtml(candidate.id)}"${candidate.id === node.parent_id ? " selected" : ""}>${escapeHtml(candidate.id)} · ${candidate.kind}</option>`)
    .join("");
  const siblings = nodes
    .filter((candidate) => candidate.parent_id === node.parent_id)
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  const siblingIndex = siblings.findIndex((candidate) => candidate.id === node.id);
  return `<fieldset><legend>階層と並び順</legend><div class="editor-grid"><label>追加先<select name="parent_id" data-component-field data-component-path="parent_id" data-component-number="false" data-nullable="true"><option value=""${node.parent_id === null ? " selected" : ""}>スライド直下</option>${parents}</select></label><label>並び位置<input name="order" data-component-field data-component-path="order" data-component-number="true" data-nullable="false" type="number" min="0" max="${Math.max(0, nodes.length - 1)}" value="${node.order}"></label></div><div class="actions"><button class="ghost" type="button" data-component-order="${siblingIndex - 1}"${siblingIndex <= 0 ? " disabled" : ""}>↑ 前へ</button><button class="ghost" type="button" data-component-order="${siblingIndex + 1}"${siblingIndex === -1 || siblingIndex >= siblings.length - 1 ? " disabled" : ""}>↓ 後へ</button></div><p class="inherit-note">0が先頭です。追加先を変えると、その領域の指定位置へ移動します。自分自身や子孫は追加先に選べません。</p></fieldset>`;
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
  return `<fieldset data-component-frame-controls data-enabled="${String(node.frame !== null && node.frame !== undefined)}"><legend>自由配置</legend><label class="check-label"><input name="frame_enabled" type="checkbox" data-component-frame-toggle${node.frame ? " checked" : ""}>親の自動配置から外し、位置と大きさを指定する</label><div class="actions"><button class="ghost" type="button" data-component-frame-preset="5,5,90,90">余白つき全面</button><button class="ghost" type="button" data-component-frame-preset="5,10,43,80">左半分</button><button class="ghost" type="button" data-component-frame-preset="52,10,43,80">右半分</button><button class="ghost" type="button" data-component-frame-preset="5,5,90,42">上半分</button><button class="ghost" type="button" data-component-frame-preset="5,53,90,42">下半分</button><button class="ghost" type="button" data-component-frame-reset>保存時の配置に戻す</button></div><div class="editor-grid">${frameField("frame.x", "左から", frame.x, 0)}${frameField("frame.y", "上から", frame.y, 0)}${frameField("frame.width", "幅", frame.width, 0.1)}${frameField("frame.height", "高さ", frame.height, 0.1)}</div><p class="feedback" data-component-frame-feedback aria-live="polite"></p><p class="inherit-note">位置と大きさの合計が100%以内になるよう指定します。自動配置へ戻しても入力値は画面内に残るため、再度有効にできます。</p></fieldset>
    <fieldset><legend>表示タイミング</legend><div class="editor-grid">${numberField("at", "表示STEP", node.at, 0, maxStep)}${selectField("animation", "表示アニメーション", node.animation, Object.entries(ANIMATION_LABELS))}</div></fieldset>
    <fieldset><legend>パーツの見た目</legend><div class="editor-grid">${colorField("style.background", "背景色", style.background, "#111827")}${colorField("style.foreground", "文字色", style.foreground, "#f8fafc")}${colorField("style.border_color", "境界線色", style.border_color, "#52647c")}${optionalNumberField("style.border_width_px", "境界線の太さ", style.border_width_px, 0, 0, 8)}${optionalNumberField("style.corner_radius_px", "角丸", style.corner_radius_px, 0, 0, 64)}${optionalNumberField("style.padding_px", "内側余白", style.padding_px, 0, 0, 64)}${optionalNumberField("style.font_scale", "文字倍率", style.font_scale, 1, 0.5, 3, 0.05)}${optionalNumberField("style.opacity", "不透明度", style.opacity, 1, 0.1, 1, 0.05)}${optionalSelectField("style.text_align", "文字揃え", style.text_align, "左", [["start", "左"], ["center", "中央"], ["end", "右"]])}${optionalSelectField("style.vertical_align", "縦位置", style.vertical_align, "上", [["start", "上"], ["center", "中央"], ["end", "下"]])}${optionalSelectField("style.shadow", "影", style.shadow, "なし", [["none", "なし"], ["soft", "柔らかい"], ["strong", "強い"]])}</div><div class="actions"><button class="ghost" type="button" data-component-style-reset>見た目をすべて継承へ戻す</button></div><p class="inherit-note">空欄は周囲の設定を継承します。背景色だけは空欄で透明になります。変更は保存前からプレビューへ反映されます。</p></fieldset>`;
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
  return `<details class="component-detail"><summary>${escapeHtml(block.id)} · ${block.kind} の内容・配置・見た目</summary><form class="editor" data-canvas-block-editor data-block-id="${escapeHtml(block.id)}" data-versioned-form action="${options.action}" data-version="${options.version}" data-component="${escapeHtml(JSON.stringify(block))}" data-asset-urls="${escapeHtml(JSON.stringify(Object.fromEntries(options.assets.map((asset) => [asset.asset_id, asset.content_url]))))}" data-csrf="${escapeHtml(options.csrfToken)}"><fieldset><legend>内容</legend><div class="editor-grid">${content}</div></fieldset><fieldset data-component-frame-controls data-enabled="true"><legend>位置と大きさ</legend><input name="frame_enabled" type="checkbox" data-component-frame-toggle checked hidden><div class="actions"><button class="ghost" type="button" data-component-frame-preset="5,5,90,90">余白つき全面</button><button class="ghost" type="button" data-component-frame-preset="5,10,43,80">左半分</button><button class="ghost" type="button" data-component-frame-preset="52,10,43,80">右半分</button><button class="ghost" type="button" data-component-frame-preset="5,5,90,42">上半分</button><button class="ghost" type="button" data-component-frame-preset="5,53,90,42">下半分</button><button class="ghost" type="button" data-component-frame-reset>保存時の配置に戻す</button></div><div class="editor-grid">${frameField("frame.x", "左から", block.frame.x, 0)}${frameField("frame.y", "上から", block.frame.y, 0)}${frameField("frame.width", "幅", block.frame.width, 0.1)}${frameField("frame.height", "高さ", block.frame.height, 0.1)}</div><p class="feedback" data-component-frame-feedback aria-live="polite"></p></fieldset><fieldset><legend>重なりと表示</legend><div class="editor-grid">${field("z_index", "重なり順", block.z_index, 'type="number" min="0" max="100"')}${field("at", "表示STEP", block.at, `type="number" min="0" max="${options.maxStep}"`)}${select("animation", "表示アニメーション", block.animation, Object.entries(ANIMATION_LABELS))}</div></fieldset><fieldset><legend>見た目</legend><div class="editor-grid">${color("style.background", "背景色", style.background, "#111827")}${color("style.foreground", "文字色", style.foreground, "#f8fafc")}${color("style.border_color", "境界線色", style.border_color, "#52647c")}${optionalNumber("style.border_width_px", "境界線の太さ", style.border_width_px, 0, 0, 8)}${optionalNumber("style.corner_radius_px", "角丸", style.corner_radius_px, 0, 0, 64)}${optionalNumber("style.padding_px", "内側余白", style.padding_px, 0, 0, 64)}${optionalNumber("style.font_scale", "文字倍率", style.font_scale, 1, 0.5, 3, 0.05)}${optionalNumber("style.opacity", "不透明度", style.opacity, 1, 0.1, 1, 0.05)}${optionalSelect("style.text_align", "文字揃え", style.text_align, "左", [["start", "左"], ["center", "中央"], ["end", "右"]])}${optionalSelect("style.vertical_align", "縦位置", style.vertical_align, "上", [["start", "上"], ["center", "中央"], ["end", "下"]])}${optionalSelect("style.shadow", "影", style.shadow, "なし", [["none", "なし"], ["soft", "柔らかい"], ["strong", "強い"]])}</div><div class="actions"><button class="ghost" type="button" data-component-style-reset>見た目をすべて継承へ戻す</button></div></fieldset><div class="actions"><button type="submit">この表示パーツを保存</button><button class="ghost" type="button" data-canvas-block-action="duplicate" data-action-url="${options.action}/actions">複製</button><button class="ghost danger" type="button" data-canvas-block-action="delete" data-action-url="${options.action}/actions">削除</button><span class="version" data-version-label>v${options.version}</span></div><p class="feedback" data-form-feedback aria-live="polite"></p></form></details>`;
}

export function landingPage(options: {
  broadcasterLogin: string;
  minFollowDays: number;
}): Response {
  return new Response(
    shell(
      "最自由研究",
      `<header class="site-header"><a class="brand" href="/">最自由研究</a></header>
       <main><section class="hero">
         <div class="hero-copy"><p class="eyebrow">Ultimate freestyle research</p>
         <h1>気になったことを、<span class="keep-word">研究にする。</span></h1>
         <p class="lead">AIとの対話で自由研究を育て、発表用のWebスライドまで一つの場所で管理します。Twitchで本人確認すると、自分の研究一覧を確認できます。</p>
         <a class="button primary" href="/login">Twitchでログイン</a>
         <p class="hint">限定公開中です。Twitchで${escapeHtml(options.broadcasterLogin)}を${options.minFollowDays}日以上フォローしている方、または現在サブスク中の方が利用できます。</p></div>
         <ol class="landing-flow" aria-label="利用の流れ"><li><span><strong>AIと研究を作る</strong><small>Codexなど、Remote MCPに対応したAIアプリから対話します。</small></span></li><li><span><strong>Webで一枚ずつ確認</strong><small>文言、組版、配色、音声、見切れを実表示で仕上げます。</small></span></li><li><span><strong>確認した版を公開</strong><small>固定プレビューを最後まで見てから公開版を切り替えます。</small></span></li></ol>
       </section></main>`
    ),
    { headers: headers() }
  );
}

export function dashboardPage(options: {
  twitchLogin: string;
  csrfToken: string;
  projects: DashboardProjectSummary[];
}): Response {
  const cards = options.projects
    .map(
      (project) => {
        const previewCurrent = project.preview_project_version === project.version && project.preview_renderer_version === PRESENTATION_RENDERER_VERSION;
        const publishedCurrent = project.published_project_version === project.version && project.published_renderer_version === PRESENTATION_RENDERER_VERSION;
        const publicationLabel = publishedCurrent
          ? "公開中"
          : project.published_project_version !== null
            ? "公開後に変更あり"
            : previewCurrent && project.preview_reviewed_at !== null
              ? "公開できます"
              : previewCurrent
                ? "プレビュー確認待ち"
                : "プレビュー未作成";
        const publicationState = publishedCurrent ? "ready" : "attention";
        const cardState = !project.has_presentation ? "missing" : publishedCurrent ? "published" : "attention";
        const voiceLabel = project.voice_segment_count === 0
          ? "音声原稿なし"
          : project.voice_ready_count === project.voice_segment_count
            ? `音声 ${project.voice_ready_count}/${project.voice_segment_count} 完成`
            : `音声 ${project.voice_ready_count}/${project.voice_segment_count}`;
        const voiceState = project.voice_segment_count > 0 && project.voice_ready_count === project.voice_segment_count ? "ready" : "attention";
        const searchText = `${project.title} ${STAGE_LABELS[project.stage]} ${voiceLabel} ${publicationLabel}`.toLocaleLowerCase("ja");
        return `<a class="card-link" data-project-card data-presentation="${project.has_presentation ? "ready" : "missing"}" data-project-state="${cardState}" data-title="${escapeHtml(project.title)}" data-updated="${escapeHtml(project.updated_at)}" data-duration="${project.total_duration_seconds}" data-search-text="${escapeHtml(searchText)}" href="/dashboard/projects/${escapeHtml(project.project_id)}"><article class="card" data-project-id="${escapeHtml(project.project_id)}">
        <div class="card-top"><span class="stage">${STAGE_LABELS[project.stage]}</span><span class="version">v${project.version}</span></div>
        <h2>${escapeHtml(project.title)}</h2>
        <p class="meta">${project.has_presentation ? `発表 ${project.slide_count}枚 · ${formatDuration(project.total_duration_seconds)}` : "発表は未構成"}</p>
        ${project.has_presentation ? `<div class="project-statuses"><span class="project-status" data-state="${voiceState}">${voiceLabel}</span><span class="project-status" data-state="${publicationState}">${publicationLabel}</span></div>` : ""}
        <p class="meta">最終更新 ${escapeHtml(formatDate(project.updated_at))}</p>
      </article></a>`;
      }
    )
    .join("");
  const content =
    cards.length > 0
      ? `<div class="dashboard-tools"><label class="dashboard-search">研究を絞り込む<input type="search" data-project-search placeholder="タイトル・制作段階・音声・公開状態" autocomplete="off"></label><div class="dashboard-filter" role="group" aria-label="研究一覧の表示設定"><button class="ghost" type="button" data-project-filter="all" aria-pressed="true">すべて</button><button class="ghost" type="button" data-project-filter="ready" aria-pressed="false">発表あり</button><button class="ghost" type="button" data-project-filter="published" aria-pressed="false">公開中</button><button class="ghost" type="button" data-project-filter="attention" aria-pressed="false">要仕上げ</button><button class="ghost" type="button" data-project-filter="missing" aria-pressed="false">未構成</button><label class="dashboard-sort">並び順<select data-project-sort><option value="updated">更新が新しい順</option><option value="title">題名順</option><option value="duration">発表時間が長い順</option></select></label><span class="count" data-project-count>${options.projects.length}件を表示</span></div></div><div class="grid" data-project-grid>${cards}</div><p class="search-empty" data-project-search-empty hidden>一致する研究がありません。検索語または絞り込みを変えてください。</p>`
      : `<section class="empty"><h2>まだ研究がありません</h2><p>Codexなどの対応AIクライアントへ、下の文を貼り付けると最初の研究を始められます。</p><div class="copy-box"><code>最自由研究MCPを使って、新しい研究を対話しながら作りたいです。まず興味のあることを聞いてください。</code><div class="actions"><button type="button" data-copy-text="最自由研究MCPを使って、新しい研究を対話しながら作りたいです。まず興味のあることを聞いてください。">AIに頼む文をコピー</button><span class="feedback" data-copy-feedback aria-live="polite"></span></div></div></section>`;
  const connectionGuide = `<details class="connection-guide"${options.projects.length === 0 ? " open" : ""}><summary>AIクライアントとの接続方法</summary><div class="connection-body"><p>Remote MCPに対応したCodex、ChatGPT、Claudeなどから接続します。アプリによって設定画面の名前は「MCP」「コネクタ」「連携」など異なります。</p><ol class="setup-steps"><li>AIクライアントの連携設定で、下のMCP URLを追加します。</li><li>開いた画面でTwitchログインを完了します。</li><li>AIへ「最自由研究MCPを使いたい」と伝えます。</li></ol><div class="endpoint-box"><code>https://saijiyu-kenkyu.2764.moe/mcp</code><button type="button" data-copy-text="https://saijiyu-kenkyu.2764.moe/mcp" data-copy-success="MCP URLをコピーしました。">MCP URLをコピー</button><span class="feedback" data-copy-feedback aria-live="polite"></span></div><p class="inherit-note">TwitchのパスワードやtokenをAIへ貼る必要はありません。認証はTwitchの画面で行います。</p></div></details>`;

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

export function draftRevisionPage(options: {
  twitchLogin: string;
  csrfToken: string;
  current: ProjectRecord;
  revision: ProjectDraftRevision;
}): Response {
  const selected = options.revision.document;
  const currentSlides = options.current.document.deck?.slides ?? [];
  const selectedSlides = selected.deck?.slides ?? [];
  const currentById = new Map(currentSlides.map((slide) => [slide.id, slide]));
  const selectedById = new Map(selectedSlides.map((slide) => [slide.id, slide]));
  const added = selectedSlides.filter((slide) => !currentById.has(slide.id)).length;
  const removed = currentSlides.filter((slide) => !selectedById.has(slide.id)).length;
  const changed = selectedSlides.filter((slide) => {
    const currentSlide = currentById.get(slide.id);
    return currentSlide !== undefined && JSON.stringify(currentSlide) !== JSON.stringify(slide);
  }).length;
  const selectedDuration = selectedSlides.reduce((total, slide) => total + slide.duration_seconds, 0);
  const currentDuration = currentSlides.reduce((total, slide) => total + slide.duration_seconds, 0);
  const comparedFields = ["title", "stage", "summary", "question", "hypothesis", "method"] as const;
  const fieldChanges = comparedFields.filter(
    (field) => JSON.stringify(selected[field]) !== JSON.stringify(options.current.document[field])
  );
  const sourceLabel = { created: "作成", edit: "編集", restore: "復元" }[options.revision.source];
  const isCurrent = options.revision.version === options.current.version;
  const frameUrl = `/dashboard/projects/${escapeHtml(options.current.project_id)}/revisions/${options.revision.version}/frame?slide=1&amp;step=0`;
  const slideList = selectedSlides.length === 0
    ? '<p class="prose">この版には発表スライドがありません。</p>'
    : `<ol class="revision-slide-list">${selectedSlides.map((slide, index) => {
        const prior = currentById.get(slide.id);
        const state = prior === undefined ? "この版だけ" : JSON.stringify(prior) === JSON.stringify(slide) ? "同じ" : "変更";
        return `<li><span>${String(index + 1).padStart(2, "0")}</span><strong>${escapeHtml(slide.title)}</strong><span>${state}</span></li>`;
      }).join("")}</ol>`;
  return new Response(
    shell(
      `v${options.revision.version}を確認 — ${selected.title}`,
      `${accountHeader(options.twitchLogin, options.csrfToken)}
       <main><a class="back" href="/dashboard/projects/${escapeHtml(options.current.project_id)}">← 研究詳細へ戻る</a>
         <div class="section-head"><div><p class="eyebrow">Draft revision</p><h1>v${options.revision.version}を復元前に確認</h1></div><span class="stage">${sourceLabel}</span></div>
         <div class="detail-grid"><div class="detail-column">
           <section class="panel"><h2>${escapeHtml(selected.title)}</h2><p class="meta">${escapeHtml(new Date(options.revision.created_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }))} · ${escapeHtml(STAGE_LABELS[selected.stage])} · ${selectedSlides.length}枚 · ${formatDuration(selectedDuration)}</p></section>
           ${selected.deck === null ? "" : `<section class="panel"><div class="section-head"><div><h2>この版の実表示</h2><p class="meta">読み取り専用です。ページ送り・段階表示も確認できます。</p></div><a class="button ghost" href="${frameUrl}" target="_blank" rel="noopener">別画面で確認</a></div><iframe class="revision-preview" title="v${options.revision.version}の発表プレビュー" src="${frameUrl}" style="--revision-aspect:${selected.deck.aspect_ratio === "4:3" ? "4 / 3" : "16 / 9"}"></iframe></section>`}
           <section class="panel"><h2>この版のスライド</h2>${slideList}</section>
         </div><aside class="detail-column">
           <section class="panel"><h2>現在版 v${options.current.version} との差</h2><dl class="stat-list"><dt>基本項目</dt><dd>${fieldChanges.length === 0 ? "変更なし" : `${fieldChanges.length}項目`}</dd><dt>スライド変更</dt><dd>${changed}枚</dd><dt>この版だけにある</dt><dd>${added}枚</dd><dt>現在版だけにある</dt><dd>${removed}枚</dd><dt>発表時間差</dt><dd>${selectedDuration - currentDuration >= 0 ? "+" : ""}${selectedDuration - currentDuration}秒</dd></dl>${fieldChanges.length === 0 ? "" : `<p class="inherit-note">変更項目: ${escapeHtml(fieldChanges.join("、"))}</p>`}</section>
           <section class="panel"><h2>復元操作</h2><p class="prose">復元しても現在版は消えず、この内容を新しいversionとして保存します。</p>${isCurrent ? '<p class="success">これは現在の下書きです。</p>' : `<button type="button" data-draft-restore="/api/projects/${escapeHtml(options.current.project_id)}/revisions/${options.revision.version}/restore" data-target-version="${options.revision.version}" data-current-version="${options.current.version}" data-csrf="${escapeHtml(options.csrfToken)}">この版を復元</button><p class="feedback" data-draft-restore-feedback aria-live="polite"></p>`}</section>
         </aside></div>
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
  draftRevisions: ProjectDraftRevisionSummary[];
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
        .map((slide, index) => {
          const narration = slide.narration?.segments ?? [];
          const readyVoice = narration.filter((segment) => segment.audio_src).length;
          const voiceLabel = narration.length === 0
            ? "原稿なし"
            : `音声 ${readyVoice}/${narration.length}`;
          const qualityWarnings = staticSlideQuality(
            slide,
            deck?.aspect_ratio ?? "16:9",
            deck?.voicevox
          );
          return `<a class="slide-row" href="/dashboard/projects/${escapeHtml(options.project.project_id)}/slides/${escapeHtml(slide.id)}"><span>${index + 1}</span><strong>${escapeHtml(slide.title)}<small class="stage">${slide.role === "cover" ? "表紙 · " : ""}${escapeHtml(slideCompositionLabel(slide))}</small>${qualityWarnings.length ? `<small class="slide-quality-warning">要確認 ${qualityWarnings.length}</small>` : ""}</strong><span>${slide.duration_seconds}秒 · ${slide.reveal_steps + 1}段階<small class="stage">${voiceLabel}</small></span></a>`;
        })
        .join("")
    : `<p class="prose">発表スライドはまだ構成されていません。</p>`;
  const addSlidePrompt = `「${document.title}」の発表へ新しいスライドを1枚追加したいです。前後の流れを確認し、入れる位置・役割・内容を提案してから作成してください。`;
  const reviseSlidesPrompt = `「${document.title}」の発表構成を見直したいです。現在の全スライドを確認し、過不足と順番の改善案を先に示してください。合意した部分だけを個別に変更してください。`;
  const slideAiActions = `<details class="component-detail"><summary>AIでスライドを追加・構成変更</summary><div class="disclosure-body"><p class="inherit-note">接続中のAIクライアントへ依頼文を貼り付けます。AIは現在の構成を自動で確認できます。</p><div class="actions"><button type="button" data-copy-text="${escapeHtml(addSlidePrompt)}">追加を頼む文をコピー</button><button class="ghost" type="button" data-copy-text="${escapeHtml(reviseSlidesPrompt)}">構成見直しを頼む文をコピー</button><span class="feedback" data-copy-feedback aria-live="polite"></span></div></div></details>`;
  const slideCreateForm = deck === null ? "" : slideCreator({
    action: `/api/projects/${escapeHtml(options.project.project_id)}/slides`,
    version: options.project.version,
    csrfToken: options.csrfToken,
    slideCount: slides.length,
    defaultPosition: slides.length
  });
  const evaluationPrompt = `「${document.title}」をresearch://guide/evaluationの8観点でレビューしてください。research://projects/${options.project.project_id}を根拠にし、情報不足は0点ではなくNEにしてください。強み、最大のリスク、最優先の改善を一つずつ示し、最後はその改善につながる質問を一問だけしてください。`;
  const imageAiPrompt = `research://projects/${options.project.project_id}の研究画像一覧を確認し、説明と寸法を根拠に「${document.title}」の発表で有効な使い方を提案してください。まだスライドは変更せず、使う画像と配置の合意後に個別編集してください。`;
  const evaluationPanel = `<details class="panel panel-disclosure"><summary>AIで研究を8観点レビュー</summary><div class="disclosure-body"><p class="prose">問い、仮説、方法、証拠、考察、独自性、発表、制作整合性を0〜4で確認します。根拠がない項目はNEとして扱います。</p><div class="actions"><button type="button" data-copy-text="${escapeHtml(evaluationPrompt)}">評価を頼む文をコピー</button><span class="feedback" data-copy-feedback aria-live="polite"></span></div></div></details>`;
  const assetCards = options.assets.length
    ? `<div class="asset-grid">${options.assets
        .map(
          (asset) => `<article class="asset" data-asset><img src="${escapeHtml(asset.content_url)}" alt="${escapeHtml(asset.alt_text)}" loading="lazy"><div class="asset-body"><p class="meta">${escapeHtml(asset.original_filename)} · ${asset.width}×${asset.height} · ${Math.ceil(asset.byte_size / 1024)} KiB</p><form class="asset-alt" data-image-alt action="/api/images/${escapeHtml(asset.asset_id)}" data-csrf="${escapeHtml(options.csrfToken)}"><label>画像の説明<input name="alt_text" maxlength="500" value="${escapeHtml(asset.alt_text)}" placeholder="何が写っているか"></label><div class="actions"><button class="ghost" type="submit">説明を保存</button><span class="feedback" data-alt-feedback aria-live="polite"></span></div></form><button class="ghost" type="button" data-image-delete="/api/images/${escapeHtml(asset.asset_id)}" data-image-label="${escapeHtml(asset.alt_text || asset.original_filename)}" data-csrf="${escapeHtml(options.csrfToken)}">削除</button><span class="feedback" data-delete-feedback aria-live="polite"></span></div></article>`
        )
        .join("")}</div>`
    : `<p class="prose">まだ画像がありません。</p>`;
  const assetTotalBytes = options.assets.reduce((total, asset) => total + asset.byte_size, 0);
  const assetTotalSize = assetTotalBytes < 1024 * 1024
    ? `${Math.ceil(assetTotalBytes / 1024)} KiB`
    : `${(assetTotalBytes / 1024 / 1024).toFixed(1)} MiB`;
  const referencedAssetIds = listPresentationAssetIds(options.project);
  const referencedAssets = referencedAssetIds
    .map((assetId) => options.assets.find((asset) => asset.asset_id === assetId))
    .filter((asset): asset is ProjectAsset => asset !== undefined);
  const referencedAssetBytes = referencedAssets.reduce((total, asset) => total + asset.byte_size, 0);
  const referencedAssetsValid =
    referencedAssets.length === referencedAssetIds.length &&
    referencedAssetIds.length <= MAX_PRESENTATION_ASSETS &&
    referencedAssetBytes <= MAX_PRESENTATION_ASSET_BYTES;
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
        return `<article class="status-row"><span><strong>v${revision.project_version} · ${escapeHtml(revision.renderer_version)}</strong><small>${escapeHtml(new Date(publishedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }))} · ${escapeHtml(revisionMeta)}</small></span><span class="actions"><a class="button ghost" href="/preview/${escapeHtml(revision.revision_id)}" target="_blank" rel="noopener">この版を確認</a>${active ? '<strong class="success">公開中</strong>' : `<button class="ghost" type="button" data-publish-rollback="/api/projects/${escapeHtml(options.project.project_id)}/publish" data-revision="${escapeHtml(revision.revision_id)}" data-csrf="${escapeHtml(options.csrfToken)}">この版へ戻す</button>`}</span></article>`;
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
  const revisionSourceLabels = { created: "作成", edit: "編集", restore: "復元" } as const;
  const draftHistoryPanel = options.draftRevisions.length === 0
    ? ""
    : `<details class="panel panel-disclosure"><summary>下書き履歴 · ${options.draftRevisions.length}件</summary><div class="disclosure-body"><p class="inherit-note">直近50版を保存します。過去版は現在の下書きを消さず、新しいversionとして復元します。</p><div class="draft-history">${options.draftRevisions.map((revision) => {
        const current = revision.version === options.project.version;
        return `<article class="draft-revision"><div><p><strong>v${revision.version} · ${escapeHtml(revision.title)}</strong>${current ? ' <span class="success">現在</span>' : ""}</p><small>${escapeHtml(revisionSourceLabels[revision.source])} · ${escapeHtml(STAGE_LABELS[revision.stage])} · ${revision.slide_count}枚 · ${formatDuration(revision.total_duration_seconds)} · ${escapeHtml(new Date(revision.created_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }))}</small></div><span class="actions"><a class="button ghost" href="/dashboard/projects/${escapeHtml(options.project.project_id)}/revisions/${revision.version}">内容を確認</a>${current ? "" : `<button class="ghost" type="button" data-draft-restore="/api/projects/${escapeHtml(options.project.project_id)}/revisions/${revision.version}/restore" data-target-version="${revision.version}" data-current-version="${options.project.version}" data-csrf="${escapeHtml(options.csrfToken)}">この版を復元</button>`}</span></article>`;
      }).join("")}</div><p class="feedback" data-draft-restore-feedback aria-live="polite"></p></div></details>`;
  const researchReady =
    (document.question?.trim().length ?? 0) > 0 &&
    (document.method?.trim().length ?? 0) > 0;
  const slidesReady = slides.length > 0;
  const totalDurationSeconds = slides.reduce(
    (total, slide) => total + slide.duration_seconds,
    0
  );
  const longestSlide = slides.reduce<(typeof slides)[number] | undefined>(
    (longest, slide) =>
      longest === undefined || slide.duration_seconds > longest.duration_seconds
        ? slide
        : longest,
    undefined
  );
  const durationWithinLimit =
    totalDurationSeconds > 0 && totalDurationSeconds <= MAX_PRESENTATION_DURATION_SECONDS;
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
  const firstSlideWithMissingAlt = slides.find((slide) => {
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
  });
  const firstSlideWithoutNarration = slides.find(
    (slide) => (slide.narration?.segments.length ?? 0) === 0
  );
  const slidesWithStaticQualityWarnings = slides.filter(
    (slide) => staticSlideQuality(
      slide,
      deck?.aspect_ratio ?? "16:9",
      deck?.voicevox
    ).length > 0
  );
  const firstSlideWithStaticQualityWarning = slidesWithStaticQualityWarnings[0];
  const firstSlidePath = slides[0] === undefined
    ? "#presentation-structure"
    : `/dashboard/projects/${escapeHtml(options.project.project_id)}/slides/${escapeHtml(slides[0].id)}`;
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
      : !durationWithinLimit
        ? {
            title: "発表を20分以内に収める",
            description: `現在は${formatDuration(totalDurationSeconds)}です。スライドの構成または想定秒数を見直してください。`,
            action: `<a class="button" href="${firstSlidePath}">スライドを見直す</a>`
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
      recommended: false,
      label: "研究の問いと方法",
      detail: researchReady ? "発表の前提を確認できます。" : "基本情報で問いと方法を入力してください。",
      href: "#basic-information"
    },
    {
      complete: coverSlideCount > 0,
      recommended: true,
      label: "表紙スライド",
      detail: coverSlideCount > 0 ? `${coverSlideCount}枚を表紙として設定済みです。` : "任意ですが、発表の題名と作者を伝えやすくなります。",
      href: firstSlidePath
    },
    {
      complete: slidesWithMissingAlt + assetsWithMissingAlt === 0,
      recommended: true,
      label: "画像の説明",
      detail: slidesWithMissingAlt + assetsWithMissingAlt === 0
        ? "説明が必要な画像に未入力はありません。"
        : `${slidesWithMissingAlt}枚のスライドと${assetsWithMissingAlt}件の素材に未入力があります。`,
      href: assetsWithMissingAlt > 0
        ? "#research-images"
        : firstSlideWithMissingAlt === undefined
          ? "#research-images"
          : `/dashboard/projects/${escapeHtml(options.project.project_id)}/slides/${escapeHtml(firstSlideWithMissingAlt.id)}`
    },
    {
      complete: slides.length > 0 && narratedSlideCount === slides.length,
      recommended: true,
      label: "表示・読み上げ文",
      detail: slides.length === 0
        ? "スライドを作ると確認できます。"
        : narratedSlideCount === slides.length
          ? `全${slides.length}枚に読み上げ文があります。`
          : `${narratedSlideCount}/${slides.length}枚に設定済みです。音声を使わない構成なら省略できます。`,
      href: firstSlideWithoutNarration === undefined
        ? `/dashboard/projects/${escapeHtml(options.project.project_id)}/voice`
        : `/dashboard/projects/${escapeHtml(options.project.project_id)}/slides/${escapeHtml(firstSlideWithoutNarration.id)}`
    },
    {
      complete: slides.length > 0 && slidesWithStaticQualityWarnings.length === 0,
      recommended: true,
      label: "文字量と表示枠",
      detail: slides.length === 0
        ? "スライドを作ると確認できます。"
        : slidesWithStaticQualityWarnings.length === 0
          ? `全${slides.length}枚で文章量の事前警告はありません。`
          : `${slidesWithStaticQualityWarnings.length}/${slides.length}枚で文章量、表、読み上げ枠の確認をおすすめします。`,
      href: firstSlideWithStaticQualityWarning === undefined
          ? firstSlidePath
          : `/dashboard/projects/${escapeHtml(options.project.project_id)}/slides/${escapeHtml(firstSlideWithStaticQualityWarning.id)}`
    },
    {
      complete: referencedAssetsValid,
      recommended: false,
      label: "公開版の画像容量",
      detail: referencedAssets.length !== referencedAssetIds.length
        ? `${referencedAssetIds.length - referencedAssets.length}件の参照画像が見つかりません。`
        : referencedAssetsValid
          ? `${referencedAssetIds.length}件 · ${(referencedAssetBytes / 1024 / 1024).toFixed(1)}MiBで上限内です。`
          : `${referencedAssetIds.length}/${MAX_PRESENTATION_ASSETS}件 · ${(referencedAssetBytes / 1024 / 1024).toFixed(1)}/30MiBです。使用画像を減らしてください。`,
      href: "#research-images"
    },
    {
      complete: durationWithinLimit,
      recommended: false,
      label: "想定発表時間",
      detail: totalDurationSeconds === 0
        ? "各スライドの想定秒数を確認してください。"
        : durationWithinLimit
          ? `${formatDuration(totalDurationSeconds)}です。20分以内に収まっています。`
          : `現在${formatDuration(totalDurationSeconds)}で、20分以内を${formatDuration(totalDurationSeconds - MAX_PRESENTATION_DURATION_SECONDS)}超えています。`,
      href: totalDurationSeconds > MAX_PRESENTATION_DURATION_SECONDS && longestSlide !== undefined
        ? `/dashboard/projects/${escapeHtml(options.project.project_id)}/slides/${escapeHtml(longestSlide.id)}`
        : firstSlidePath
    },
    {
      complete: previewReviewed,
      recommended: false,
      label: "固定プレビュー",
      detail: previewReviewed ? "現在の版を最後まで確認済みです。" : previewCurrent ? "固定プレビューを最後まで操作し、確認済みにしてください。" : "現在の下書きから作り、最後まで操作して確認してください。",
      href: "#publication"
    }
  ];
  const corePreflightItems = preflightItems.filter((item) => !item.recommended);
  const recommendedPreflightItems = preflightItems.filter((item) => item.recommended);
  const preflightChecklist = `<details${previewCurrent ? "" : " open"}><summary>公開前チェック · 基本 ${corePreflightItems.filter((item) => item.complete).length}/${corePreflightItems.length} · おすすめ ${recommendedPreflightItems.filter((item) => item.complete).length}/${recommendedPreflightItems.length}</summary><ul class="preflight-list">${preflightItems.map((item) => `<li class="preflight-item" data-state="${item.complete ? "complete" : item.recommended ? "recommendation" : "attention"}"><span><strong>${escapeHtml(item.label)}${item.recommended ? " · おすすめ" : ""}</strong><small>${escapeHtml(item.detail)}</small></span>${item.complete ? "" : `<a class="preflight-action" href="${item.href}">${item.recommended ? "確認へ" : "修正へ"} →</a>`}</li>`).join("")}</ul></details>`;
  const publicationPanel = `<section class="panel publish-state" id="publication" data-publication>
    <h2>プレビューと公開</h2>
    ${preflightChecklist}
    <div class="status-row"><span>下書き</span><strong>v${options.project.version}</strong></div>
    <div class="status-row"><span>表示エンジン</span><strong>${escapeHtml(options.publication.current_renderer_version)}</strong></div>
    <div class="status-row"><span>最新プレビュー</span><strong data-preview-status>${preview === null ? "未作成" : `v${preview.project_version} · ${escapeHtml(preview.renderer_version)}${previewCurrent ? "" : " · 要再生成"}`}</strong></div>
    <div class="status-row"><span>プレビュー確認</span><strong data-preview-review-status>${previewReviewed ? "確認済み" : previewCurrent ? "終了画面の到達待ち" : "対象なし"}</strong></div>
    <div class="status-row"><span>公開中</span><strong data-published-status>${published === null ? "未公開" : `v${published.project_version} · ${escapeHtml(published.renderer_version)}`}</strong></div>
    <a class="button ghost" data-preview-link href="${preview === null ? "#" : `/preview/${escapeHtml(preview.revision_id)}`}" target="_blank" rel="noopener"${preview === null ? " hidden" : ""}>最新プレビューを開く</a>
    <a class="button ghost" data-public-link href="${published !== null && options.publication.slug !== null ? `/p/${escapeHtml(options.publication.slug)}` : "#"}" target="_blank" rel="noopener"${published === null || options.publication.slug === null ? " hidden" : ""}>公開ページを開く</a>
    <button class="ghost" type="button" data-copy-public${published === null || options.publication.slug === null ? " hidden" : ""}>公開URLをコピー</button><span class="feedback" data-copy-public-feedback aria-live="polite"></span>
    <button class="danger ghost" type="button" data-unpublish="/api/projects/${escapeHtml(options.project.project_id)}/publish" data-csrf="${escapeHtml(options.csrfToken)}"${published === null ? " hidden" : ""}>公開を停止</button>
    ${publicationHistory}
    ${publicationEvents}
    <div class="actions">
      <button type="button" data-create-preview="/api/projects/${escapeHtml(options.project.project_id)}/previews" data-version="${options.project.version}" data-csrf="${escapeHtml(options.csrfToken)}"${slides.length === 0 ? " disabled" : ""}>現在の下書きをプレビュー</button>
      <button class="ghost" type="button" data-review-preview="/api/projects/${escapeHtml(options.project.project_id)}/previews/${escapeHtml(preview?.revision_id ?? "")}/review" data-project="${escapeHtml(options.project.project_id)}" data-version="${options.project.version}" data-renderer="${escapeHtml(options.publication.current_renderer_version)}" data-revision="${escapeHtml(preview?.revision_id ?? "")}" data-csrf="${escapeHtml(options.csrfToken)}" disabled>${previewReviewed ? "プレビュー確認済み" : "終了画面の到達待ち"}</button>
      <button class="ghost" type="button" data-publish-preview="/api/projects/${escapeHtml(options.project.project_id)}/publish" data-revision="${escapeHtml(preview?.revision_id ?? "")}" data-csrf="${escapeHtml(options.csrfToken)}" data-duration-valid="${String(durationWithinLimit)}" data-preview-reviewed="${String(previewReviewed)}" data-published-current="${String(publishedCurrent)}"${previewReviewed && durationWithinLimit && !publishedCurrent ? "" : " disabled"}>${publishedCurrent ? "この版は公開済み" : "確認した版を公開"}</button>
    </div>
    <p class="feedback${!durationWithinLimit || voiceIncomplete || (preview !== null && !previewCurrent) || (previewCurrent && !previewReviewed) ? " warning" : ""}" data-publish-feedback aria-live="polite">${slides.length === 0 ? "スライドを1枚以上作るとプレビューできます。" : !durationWithinLimit ? `想定発表時間が${formatDuration(totalDurationSeconds)}です。20分以内に短縮してから公開してください。プレビューは短縮前でも確認できます。` : previewCurrent && !previewReviewed ? "固定プレビューを最後の終了画面まで進めると、自動で確認済みになります。" : voiceIncomplete ? `VOICEVOX音声は ${readyVoiceSegments} / ${narrationSegments.length} 区間まで生成済みです。未生成区間はブラウザ音声で代替してプレビューできます。` : preview !== null && !previewCurrent ? previewStaleMessage : "公開中の版は、下書きや表示エンジンを更新しても自動では変わりません。"}</p>
  </section>`;
  const voicePanel = `<section class="panel publish-state"><h2>読み上げ音声</h2>
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
  const qualitySweepPanel = qualitySweepSlides.length === 0
    ? ""
    : `<details class="panel panel-disclosure"><summary>0ページ目と全スライドの実表示を一括確認</summary><div class="disclosure-body quality-sweep"><p class="prose">現在の${escapeHtml(deck?.aspect_ratio ?? "16:9")}の発表枠で${loadingScreen.enabled ? "0ページ目と" : ""}全${slides.length}枚・${qualitySweepStepCount}段階を順番に描画し、見切れ、70%未満の自動縮小、文字コントラスト、読み上げ文の省略、文字サイズ、重なりを探します。</p><div class="quality-sweep-head"><button type="button" data-quality-sweep data-slides="${escapeHtml(JSON.stringify(qualitySweepSlides))}" data-frame-url="${escapeHtml(`/dashboard/projects/${options.project.project_id}/slides/${slides[0]?.id}/frame?slide=1&step=0`)}">一括チェックを開始</button><button class="ghost" type="button" data-quality-sweep-cancel hidden>中断</button><progress data-quality-sweep-progress max="${qualitySweepStepCount}" value="0" hidden>0 / ${qualitySweepStepCount}</progress><span class="feedback" data-quality-sweep-status aria-live="polite">未実行</span></div><ol class="quality-sweep-results" data-quality-sweep-results></ol><div class="quality-sweep-preview" data-quality-sweep-preview style="--quality-sweep-aspect:${(deck?.aspect_ratio ?? "16:9") === "4:3" ? "4 / 3" : "16 / 9"}" hidden><iframe data-quality-sweep-frame title="0ページ目と全スライドの表示確認"></iframe></div></div></details>`;

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
             ${qualitySweepPanel}
             <section class="panel" id="research-images"><h2>研究画像</h2><p class="meta">${options.assets.length} / ${PROJECT_IMAGE_LIMIT}件 · 圧縮後 ${assetTotalSize} を保存中</p>
               <form class="upload" action="/api/projects/${escapeHtml(options.project.project_id)}/images" data-image-upload data-csrf="${escapeHtml(options.csrfToken)}">
                 <label class="upload-dropzone" data-upload-dropzone><span>画像を選択、またはここへドロップ</span><small>JPEG / PNG / 静止WebP</small><input type="file" accept="image/jpeg,image/png,image/webp" required></label>
                 <div class="upload-preview" data-upload-preview hidden><img data-upload-preview-image alt="選択した画像の確認"><p><strong data-upload-preview-name></strong><small data-upload-preview-meta></small></p></div>
                 <label>画像の説明<input name="alt_text" maxlength="500" placeholder="写真や図が何を示しているか"><small class="inherit-note">発表内容を伝える画像には説明を付けます。純粋な装飾なら空欄にできます。</small></label>
                 <div class="upload-actions"><button type="submit">画像を追加</button><span class="meta">JPEG / PNG / 静止WebP、10MiB・40MP・一辺10000pxまで · 保存時に最大2560pxのWebPへ圧縮</span></div>
                 <p class="feedback" data-feedback aria-live="polite"></p>
               </form>
               ${assetCards}
               <p class="inherit-note">固定プレビューで実際に使う画像は30件・合計30MiBまでです。未使用画像は公開版へ複製されません。</p>
               <div class="copy-box"><code>接続したAIは画像本体を引数へ含めず、asset IDと説明の一覧を取得できます。</code><div class="actions"><button class="ghost" type="button" data-copy-text="${escapeHtml(imageAiPrompt)}">画像の使い方をAIへ相談</button><span class="feedback" data-copy-feedback aria-live="polite"></span></div></div>
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
               <dt>想定時間</dt><dd data-state="${durationWithinLimit ? "ok" : "warning"}">${formatDuration(totalDurationSeconds)}${totalDurationSeconds > MAX_PRESENTATION_DURATION_SECONDS ? " · 20分超過" : ""}</dd>
             </dl></section>
             ${draftHistoryPanel}
             <section class="panel" id="presentation-structure"><h2>発表構成</h2><div class="slide-list">${slideRows}</div>${slideCreateForm}${slideAiActions}</section>
             ${evaluationPanel}
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
  const attentionSegmentIndex = options.voice.segments.findIndex(
    (segment) => segment.status !== "ready"
  );
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
    .reduce((total, segment) => total + segment.text.length, 0);
  const segmentList = options.voice.segments.length
    ? options.voice.segments
        .map((segment, index) => {
          const statusLabel =
            VOICE_SEGMENT_STATUS_LABELS[segment.status] ?? segment.status;
          const generated = segment.audio_url !== null;
          const tuningDetails = (Object.keys(TUNING_LABELS) as Array<keyof VoicevoxTuning>)
            .map((key) => `<dt>${TUNING_LABELS[key]}</dt><dd>${segment.effective_tuning[key]}</dd>`)
            .join("");
          return `<details class="voice-review"${index === (attentionSegmentIndex === -1 ? 0 : attentionSegmentIndex) ? " open" : ""} data-voice-segment data-state="${escapeHtml(segment.status)}" data-search-text="${escapeHtml(`${segment.slide_title} ${segment.text} ${segment.profile_label ?? defaultProfileLabel} ${segment.speaker ?? ""}`.toLocaleLowerCase("ja"))}">
            <summary><span class="component-step">${String(index + 1).padStart(2, "0")}</span><span class="voice-review-title"><strong>${escapeHtml(segment.slide_title)} · STEP ${segment.at}</strong><small>${escapeHtml(segment.profile_label ?? defaultProfileLabel)}${segment.speaker ? ` · ${escapeHtml(segment.speaker)}` : ""}</small></span><span class="voice-status ${escapeHtml(segment.status)}">${escapeHtml(statusLabel)}</span></summary>
            <div class="voice-review-body"><p>${escapeHtml(segment.text)}</p><details class="component-detail"><summary>実効調声を確認</summary><dl class="setting-table">${tuningDetails}</dl></details>${generated ? `<div class="voice-audio-timeline"><input type="range" min="0" max="0" step="0.05" value="0" data-voice-preview-seek aria-label="生成音声の再生位置" disabled><output data-voice-preview-time>00:00 / --:--</output></div>` : ""}<div class="actions"><button class="ghost voice-play" type="button" data-voice-preview data-audio-url="${escapeHtml(segment.audio_url ?? "")}" data-voice-text="${escapeHtml(segment.text)}" data-effective-tuning="${escapeHtml(JSON.stringify(segment.effective_tuning))}" aria-pressed="false">${generated ? "生成音声を試聴" : "ブラウザ音声で仮試聴"}</button><a class="button ghost" href="/dashboard/projects/${projectId}/slides/${escapeHtml(segment.slide_id)}?step=${segment.at}#narration-segment-${segment.at}">この区間を編集</a></div><p class="feedback" data-voice-preview-feedback aria-live="polite"></p></div>
          </details>`;
        })
        .join("")
    : `<section class="empty"><h2>読み上げ原稿がありません</h2><p>先にAIクライアントまたはスライド編集画面から、読み上げ区間を追加してください。</p></section>`;
  const generateDisabled =
    !options.voice.configured ||
    summary.needs_generation === 0 ||
    jobActive ||
    generationCharacterCount > MAX_JOB_CHARACTERS;
  return new Response(
    shell(
      `音声を仕上げる — ${options.project.document.title}`,
      `${accountHeader(options.twitchLogin, options.csrfToken)}
       <main class="voice-main" data-voice-page data-project-id="${projectId}" data-version="${options.voice.version}" data-voice-configured="${String(options.voice.configured)}" data-voice-ready="${summary.ready}" data-csrf="${escapeHtml(options.csrfToken)}" data-summary-url="/api/projects/${projectId}/voice">
         <a class="back" href="/dashboard/projects/${projectId}">← 研究詳細へ戻る</a>
         <section class="voice-hero"><div><p class="eyebrow">Voice finishing</p><h1>音声を仕上げる</h1><p class="lead">VOICEVOXの話者とスタイルを選び、不足している読み上げ音声を生成して、区間ごとに確認できます。</p></div><a class="button ghost" href="/dashboard/projects/${projectId}#publication">プレビューと公開へ</a></section>
         <div class="voice-flow">
           <div class="voice-column">
             <section class="panel voice-step"><div class="voice-step-head"><span class="voice-step-number">1</span><div><h2>声を決める</h2><p>40話者・118種類のトークスタイルから発表全体の既定音声を選べます。最初は「ずんだもん・ノーマル」がおすすめです。</p></div></div>
               <div class="voice-quick" aria-label="おすすめの声">${quickProfiles.map((profile) => `<button class="ghost" type="button" data-voice-pick="${escapeHtml(profile.id)}">${escapeHtml(profile.label)}</button>`).join("")}</div>
               <form data-voice-selection-form data-initial-profile="${escapeHtml(selectedCatalogProfile.id)}"><div class="voice-preset"><span class="voice-character" aria-hidden="true">声</span><div><strong>既定の話者・スタイル</strong><div class="voice-preset-fields"><label>話者<select data-voice-speaker>${speakerOptions}</select></label><label>スタイル<select data-voice-profile data-voice-catalog="${escapeHtml(JSON.stringify(voiceCatalogData))}">${profileOptions}</select></label></div><small>区間ごとの声と7種の調声値は、各スライドの読み上げ設定で変更できます。</small></div><span class="stage">${options.voice.configured ? "設定済み" : "おすすめ"}</span></div>
               <div class="actions"><button type="button" data-voice-setup="/api/projects/${projectId}/voice/profile"${jobActive ? " disabled" : ""}>${options.voice.configured ? "選択した声へ変更" : "この声を使う"}</button></div><p class="feedback${options.voice.configured ? " success" : ""}" data-voice-setup-feedback aria-live="polite">${options.voice.configured ? `現在の既定音声は「${escapeHtml(defaultProfileLabel)}」です。声を変えると該当区間の再生成が必要になります。` : "設定すると個別の声を指定していない読み上げ区間へ自動的に適用されます。"}</p></form>
               ${options.voice.configured ? `<details class="component-detail"><summary>既定のトーンを細かく調整</summary><form class="editor" data-voice-profile-tuning data-default-tuning="${escapeHtml(JSON.stringify(DEFAULT_VOICEVOX_TUNING))}" action="/api/projects/${projectId}/voice/profile/tuning"><div class="tuning-grid">${(Object.keys(DEFAULT_VOICEVOX_TUNING) as Array<keyof VoicevoxTuning>).map((key) => `<label>${TUNING_LABELS[key]}<input name="tuning_${key}" type="number" min="${VOICEVOX_TUNING_LIMITS[key].min}" max="${VOICEVOX_TUNING_LIMITS[key].max}" step="0.01" required value="${defaultProfileTuning[key]}"></label>`).join("")}</div><p class="inherit-note">profile未指定の区間へ共通で適用されます。保存すると、この声を使う生成済み音声は再生成が必要です。ブラウザ仮試聴は話速・高さ・音量の近似で、抑揚・間・前後無音はVOICEVOX生成後に確認します。</p><div class="actions"><button class="ghost" type="button" data-voice-profile-tuning-preview aria-pressed="false">ブラウザで仮試聴</button><button class="ghost" type="button" data-voice-profile-tuning-reset>VOICEVOX標準値へ戻す</button><button type="submit"${jobActive ? " disabled" : ""}>既定のトーンを保存</button></div><p class="feedback" data-voice-profile-tuning-feedback aria-live="polite"></p></form></details>` : ""}
             </section>
             <section class="panel voice-step"><div class="voice-step-head"><span class="voice-step-number">2</span><div><h2>不足分を生成する</h2><p>設定や原稿が変わった区間だけを生成します。生成済みの音声は再利用します。</p></div></div>
               <div class="voice-stats"><div class="voice-stat"><span>原稿</span><strong data-voice-total>${summary.total}</strong></div><div class="voice-stat"><span>音声概算</span><strong>${formatDuration(estimatedNarrationSeconds)}</strong></div><div class="voice-stat"><span>生成対象</span><strong>${generationCharacterCount.toLocaleString()}字</strong></div><div class="voice-stat ready"><span>生成済み</span><strong data-voice-ready>${summary.ready}</strong></div><div class="voice-stat pending"><span>要生成<small>失敗含む</small></span><strong data-voice-needed>${summary.needs_generation}</strong></div><div class="voice-stat"><span>失敗</span><strong data-voice-failed>${summary.failed}</strong></div></div>
               <div class="actions"><button type="button" data-voice-generate="/api/projects/${projectId}/voice/jobs"${generateDisabled ? " disabled" : ""}>${jobActive ? "生成中です" : summary.total === 0 ? "読み上げ原稿がありません" : generationCharacterCount > MAX_JOB_CHARACTERS ? "原稿を短縮してください" : summary.needs_generation > 0 ? `不足している${summary.needs_generation}区間を生成` : "すべて生成済み"}</button></div><p class="feedback${generationCharacterCount > MAX_JOB_CHARACTERS ? " warning" : ""}" data-voice-generate-feedback aria-live="polite">${!options.voice.configured ? "先に声を設定してください。" : summary.total === 0 ? "各スライドへ読み上げ原稿を追加すると生成できます。" : generationCharacterCount > MAX_JOB_CHARACTERS ? `生成対象が1回の上限${MAX_JOB_CHARACTERS.toLocaleString()}字を超えています。原稿を短縮してから生成してください。` : summary.needs_generation === 0 ? "生成が必要な区間はありません。" : `生成対象は${generationCharacterCount.toLocaleString()} / ${MAX_JOB_CHARACTERS.toLocaleString()}字です。生成中もこの画面を閉じて構いません。`}</p>
               ${voiceJobCard(currentJob)}
             </section>
             <section class="panel voice-step"><div class="voice-step-head"><span class="voice-step-number">3</span><div><h2>区間ごとに試聴する</h2><p>生成済み音声を確認できます。未生成の区間はブラウザ音声で仮試聴します。</p></div></div><div class="voice-filter" aria-label="区間の絞り込み"><input class="voice-search" type="search" data-voice-search placeholder="スライド名・原稿・声を検索" autocomplete="off"><button class="ghost" type="button" data-voice-filter="all" aria-pressed="true">すべて ${summary.total}</button><button class="ghost" type="button" data-voice-filter="needs_generation" aria-pressed="false">要生成（失敗含む） ${summary.needs_generation}</button><button class="ghost" type="button" data-voice-filter="ready" aria-pressed="false">生成済み ${summary.ready}</button><button class="ghost" type="button" data-voice-filter="failed" aria-pressed="false">失敗 ${summary.failed}</button><output class="voice-result-count" data-voice-visible aria-live="polite">${summary.total} / ${summary.total}件表示</output></div><p class="search-empty" data-voice-filter-empty hidden>この条件に一致する読み上げ区間はありません。</p><div class="voice-segment-list" data-voice-segments>${segmentList}</div></section>
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
        const searchText = `${item.title} ${item.role === "cover" ? "表紙" : "通常"} ${slideCompositionLabel(item)} ${voiceStatus}`.toLocaleLowerCase("ja");
        return `<a class="filmstrip-link" data-filmstrip-slide data-search-text="${escapeHtml(searchText)}" data-slide-title="${escapeHtml(item.title.toLocaleLowerCase("ja"))}" data-active="${String(index === slideIndex)}"${index === slideIndex ? ' aria-current="page"' : ""} href="/dashboard/projects/${escapeHtml(options.project.project_id)}/slides/${escapeHtml(item.id)}"><span>${String(index + 1).padStart(2, "0")}</span><strong><span data-filmstrip-title>${escapeHtml(item.title)}</span>${item.role === "cover" ? '<small class="stage" data-filmstrip-role>表紙</small>' : ""}<small class="filmstrip-meta"><span data-filmstrip-duration>${item.duration_seconds}秒</span> · ${item.reveal_steps + 1}段階 · ${escapeHtml(slideCompositionLabel(item))}<br>${voiceStatus}</small></strong></a>`;
      }
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
        : `<p class="mode-note">定型レイアウトです。本文、段階表示、補足欄から構成されます。下の選択から自由配置または入れ子のリッチ構成を開始できます。</p>`;
  const modeNote =
    slide.composition?.mode === "scene"
      ? "登録済みの表示パーツで構成されています。AIから一件ずつ構造を編集でき、この画面では内容、並び方、表示STEP、アニメーション、画像、配色、余白、文字倍率を実表示で調整できます。"
      : slide.composition?.mode === "canvas"
        ? "自由配置の表示パーツです。この画面で内容、画像、位置、大きさ、重なり、表示STEP、アニメーション、見た目を調整できます。入れ子が必要な場合はAIからリッチ構成へ移行できます。"
        : "本文と補足欄を使う定型レイアウトです。";
  const sceneNodes = slide.composition?.mode === "scene" ? slide.composition.nodes : [];
  const sceneComponentEditors = slide.composition?.mode === "scene"
    ? sceneNodes
        .map((node) => {
          const fields = sceneTextFields(node);
          const hierarchyControls = sceneComponentHierarchyControls(node, sceneNodes);
          const controls = sceneComponentContentControls(node, slide.reveal_steps);
          const kindControls = sceneComponentKindControls(node, options.assets ?? []);
          const appearanceControls = sceneComponentAppearanceControls(node, slide.reveal_steps);
          const assetUrls = Object.fromEntries((options.assets ?? []).map((asset) => [asset.asset_id, asset.content_url]));
          return `<details class="component-detail"><summary>${escapeHtml(node.id)} · uf-${escapeHtml(node.kind.replaceAll("_", "-"))} の${fields.length > 0 ? "内容と見た目" : "見た目"}</summary><form class="editor" data-scene-component-editor data-component-id="${escapeHtml(node.id)}" data-versioned-form action="${slidePath}/components/${escapeHtml(node.id)}" data-version="${options.project.version}" data-component="${escapeHtml(JSON.stringify(node))}" data-asset-urls="${escapeHtml(JSON.stringify(assetUrls))}" data-csrf="${escapeHtml(options.csrfToken)}">${hierarchyControls}${controls}${kindControls}${appearanceControls}<div class="actions"><button type="submit">この表示パーツを保存</button><button class="ghost" type="button" data-scene-component-action="duplicate" data-action-url="${slidePath}/components/${escapeHtml(node.id)}/actions">複製</button><button class="ghost danger" type="button" data-scene-component-action="delete" data-action-url="${slidePath}/components/${escapeHtml(node.id)}/actions">削除</button><span class="version" data-version-label>v${options.project.version}</span></div><p class="feedback" data-form-feedback aria-live="polite"></p></form></details>`;
        })
        .join("")
    : "";
  const sceneComponentCreate = slide.composition?.mode === "scene"
    ? sceneComponentCreator({
        nodes: slide.composition.nodes,
        assets: options.assets ?? [],
        action: `${slidePath}/components`,
        version: options.project.version,
        csrfToken: options.csrfToken
      })
    : "";
  const canvasBlockEditors = slide.composition?.mode === "canvas"
    ? slide.composition.blocks.map((block) => canvasBlockEditor({
        block,
        assets: options.assets ?? [],
        action: `${slidePath}/blocks/${escapeHtml(block.id)}`,
        version: options.project.version,
        csrfToken: options.csrfToken,
        maxStep: slide.reveal_steps
      })).join("")
    : "";
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
  const typography = resolveSlideTypography(
    slide.typography,
    activeTemplate?.line_height ?? 1.5
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
  const narrationColorField = (name: string, label: string, value: string | undefined, fallback: string) => `<label>${label}<span class="color-control"><input type="color" value="${escapeHtml(value ?? fallback)}" data-narration-color-preview="${name}" aria-label="${label}を色見本から選ぶ"><input name="${name}" type="text" value="${escapeHtml(value ?? "")}" data-narration-color-text="${name}" placeholder="空欄で表示形式の既定" pattern="^$|^#[0-9A-Fa-f]{6}$" maxlength="7" spellcheck="false"></span></label>`;
  const narrationColorControls = `${narrationColorField("appearance_background", "背景色", narrationAppearance.background, "#111827")}${narrationColorField("appearance_foreground", "文字色", narrationAppearance.foreground, "#f8fafc")}${narrationColorField("appearance_border_color", "境界線色", narrationAppearance.border_color, "#52647c")}${narrationColorField("appearance_accent", "話者・進捗色", narrationAppearance.accent, activeTemplate?.accent ?? deck.accent)}`;
  const narrationPalettes = [
    ["夜のパネル", { background: "#0f172a", foreground: "#f8fafc", border_color: "#64748b", accent: "#38bdf8", corner_radius_px: 18 }],
    ["明るい紙面", { background: "#f8fafc", foreground: "#172033", border_color: "#94a3b8", accent: "#2563eb", corner_radius_px: 10 }],
    ["ずんだ色", { background: "#edf9dc", foreground: "#18320f", border_color: "#6bbd45", accent: "#6bbd45", corner_radius_px: 18 }],
    ["高コントラスト", { background: "#000000", foreground: "#ffffff", border_color: "#ffffff", accent: "#ffcf32", corner_radius_px: 0 }]
  ] as const;
  const narrationPalettePicker = `<div class="narration-palette" aria-label="読み上げ枠の配色プリセット">${narrationPalettes.map(([label, palette]) => `<button class="narration-color-pick" type="button" data-narration-color-pick="${escapeHtml(JSON.stringify(palette))}" style="--palette-background:${palette.background};--palette-border:${palette.border_color};--palette-accent:${palette.accent}"><span class="narration-color-swatch" aria-hidden="true"></span><span>${label}</span></button>`).join("")}<button class="narration-color-pick ghost" type="button" data-narration-color-reset><span class="narration-color-swatch" aria-hidden="true" style="--palette-background:transparent;--palette-border:#94a3b8;--palette-accent:#94a3b8"></span><span>形式の既定</span></button></div>`;
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
    return {
      template_id: template?.id ?? `builtin-${deck.layout}`,
      user_template: template !== undefined,
      region_layout: template?.region_layout ?? "sidebar-right",
      visual_preset:
        template?.visual_preset ?? (deck.layout === "minimal" ? "paper" : "studio"),
      body_font: template?.body_font ?? "system-sans",
      heading_font: template?.heading_font ?? "system-sans",
      density: template?.density ?? "comfortable",
      motion_style: template?.motion_style ?? "calm",
      enter_animation: template?.enter_animation ?? "fade"
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
  const fontPresetPicker = (selected: string) => `<div class="font-picker" role="group" aria-label="本文と見出しのフォントをまとめて選ぶ">${Object.entries(FONT_LABELS).map(([value, label]) => `<button class="font-pick" type="button" data-font-pick="${value}" aria-pressed="${String(value === selected)}"><span>最自由研究 Aa</span><small>${label}</small></button>`).join("")}</div>`;
  const coverLayoutPicker = `<div class="cover-picker" role="group" aria-label="表紙レイアウトを選ぶ">${[["center", "中央"], ["split", "左右分割"], ["poster", "ポスター"], ["minimal", "余白重視"], ["statement", "一言強調"], ["band", "中央帯"], ["corner", "左下"], ["frame", "額縁"]].map(([value, label]) => `<button class="cover-pick" type="button" data-cover-pick="${value}" aria-pressed="${String((slide.cover_layout ?? "center") === value)}"><span class="cover-wire" aria-hidden="true"></span><span>${label}</span></button>`).join("")}</div>`;
  const narrationDisplayPicker = `<div class="narration-picker" role="group" aria-label="読み上げ文の表示形式を選ぶ">${Object.entries(NARRATION_DISPLAY_LABELS).map(([value, label]) => `<button class="narration-display-pick" type="button" data-narration-display-pick="${value}" aria-pressed="${String(narrationDisplay === value)}"><span class="narration-wire" aria-hidden="true"></span><span>${label}</span></button>`).join("")}</div>`;
  const regionLayoutPicker = activeTemplate === undefined ? "" : `<div class="region-picker" role="group" aria-label="本文と補足の領域配置を選ぶ">${[["single", "単一"], ["sidebar-right", "右補足"], ["sidebar-left", "左補足"], ["lower-third", "下段補足"], ["split", "左右均等"], ["top-band", "上段補足"], ["focus", "中央集中"]].map(([value, label]) => `<button class="region-pick" type="button" data-region-pick="${value}" aria-pressed="${String(activeTemplate.region_layout === value)}"><span class="region-wire" aria-hidden="true"></span><span>${label}</span></button>`).join("")}</div>`;
  const animationPicker = (selected: string, inherit: boolean) => {
    const icons: Record<string, string> = { none: "—", fade: "◌", rise: "↑", zoom: "⊕", wipe: "▰", "slide-left": "←", "slide-right": "→", pop: "✦", blur: "◎" };
    const entries = inherit ? [["", "テンプレートを継承"] as const, ...Object.entries(ANIMATION_LABELS)] : Object.entries(ANIMATION_LABELS);
    return `<div class="animation-picker" role="group" aria-label="表示アニメーションを選ぶ">${entries.map(([value, label]) => `<button class="animation-pick" type="button" data-animation-pick="${value}" data-animation-target="enter_animation" aria-pressed="${String(selected === value)}"><span class="animation-symbol" aria-hidden="true">${icons[value] ?? "↗"}</span><span>${label}</span></button>`).join("")}</div><button class="ghost animation-replay" type="button" data-animation-replay="enter_animation">▶ 動きをもう一度見る</button>`;
  };
  const tonePicker = `<div class="tone-picker" role="group" aria-label="スライドの色調を選ぶ">${Object.entries(TONE_LABELS).map(([value, label]) => `<button class="tone-pick" type="button" data-tone-pick="${value}" aria-pressed="${String(slide.tone === value)}"><span class="tone-swatch" aria-hidden="true"></span><span>${label}</span></button>`).join("")}</div>`;
  const templateCreator = `<details class="component-detail"${activeTemplate === undefined ? " open" : ""}><summary>編集できるテンプレートを追加</summary><form class="editor" data-template-create data-versioned-form data-method="POST" action="${projectPath}/templates" data-version="${options.project.version}" data-csrf="${escapeHtml(options.csrfToken)}"><div class="editor-grid"><label>テンプレート名<input name="name" maxlength="80" required value="自分のスタイル"></label><label>ID<input name="template_id" pattern="[a-z0-9][a-z0-9-]{0,63}" required value="style-${options.project.version}"></label><label>複製元（任意）<select name="source_template_id"><option value="">見た目プリセットから開始</option>${(deck.templates ?? []).map((template) => `<option value="${escapeHtml(template.id)}">${escapeHtml(template.name)}${deck.default_template_id === template.id ? " · 発表全体の既定" : ""}</option>`).join("")}</select></label><label>複製元なしの場合<select name="visual_preset">${Object.entries(VISUAL_LABELS).map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select></label></div><p class="inherit-note">複製元を選ぶと、そのテンプレートの色、フォント、余白、アニメーションを引き継ぎます。追加後に派生版だけを調整できます。</p><label class="check-label"><input type="checkbox" name="make_default" checked>発表全体の既定テンプレートにする</label><div class="actions"><button type="submit">テンプレートを追加</button><span class="version" data-version-label>v${options.project.version}</span></div><p class="feedback" data-form-feedback aria-live="polite"></p></form></details>`;
  const templateEditor = activeTemplate
    ? `<form class="editor" data-template-editor data-versioned-form action="${projectPath}/templates/${escapeHtml(activeTemplate.id)}" data-version="${options.project.version}" data-slide-id="${escapeHtml(slide.id)}" data-csrf="${escapeHtml(options.csrfToken)}">
        <p class="inherit-note">このテンプレートを使う全スライドへ反映されます。</p>
        <label>テンプレート名<input name="name" maxlength="80" required value="${escapeHtml(activeTemplate.name)}"></label>
        <div class="editor-grid"><label>見た目のプリセット<select name="visual_preset">${Object.entries(VISUAL_LABELS).map(([value, label]) => `<option value="${value}"${visualPreset === value ? " selected" : ""}>${label}</option>`).join("")}</select></label><label>情報密度<select name="density">${Object.entries(DENSITY_LABELS).map(([value, label]) => `<option value="${value}"${density === value ? " selected" : ""}>${label}</option>`).join("")}</select></label></div>
        ${visualPresetPicker(visualPreset)}
        <fieldset><legend>領域</legend>${regionLayoutPicker}<div class="editor-grid"><label>配置<select name="region_layout">${[["single", "単一"], ["sidebar-right", "右補足"], ["sidebar-left", "左補足"], ["lower-third", "下段補足"], ["split", "左右均等"], ["top-band", "上段補足"], ["focus", "中央集中"]].map(([value, label]) => `<option value="${value}"${activeTemplate.region_layout === value ? " selected" : ""}>${label}</option>`).join("")}</select></label><label>補足幅（%）<input name="sidebar_width_percent" type="number" min="20" max="45" value="${activeTemplate.sidebar_width_percent}" required></label></div><div class="editor-grid"><label>角の丸み<input name="corner_radius_px" type="number" min="0" max="48" value="${activeTemplate.corner_radius_px}" required></label><label>余白倍率<input name="spacing_scale" type="number" min="0.75" max="1.5" step="0.05" value="${activeTemplate.spacing_scale}" required></label></div></fieldset>
        <fieldset><legend>色</legend><div class="editor-grid">${[["background", "背景", activeTemplate.background], ["surface", "補足面", activeTemplate.surface], ["foreground", "本文", activeTemplate.foreground], ["muted", "補助文字", activeTemplate.muted], ["accent", "アクセント", activeTemplate.accent], ["accent_secondary", "第2アクセント", activeTemplate.accent_secondary ?? activeTemplate.accent], ["border", "境界線", activeTemplate.border ?? activeTemplate.muted]].map(([name, label, value]) => `<label>${label}<span class="color-control"><input name="${name}" type="color" value="${escapeHtml(String(value))}" aria-label="${label}を色見本から選ぶ"><input type="text" value="${escapeHtml(String(value))}" data-color-text="${name}" aria-label="${label}のHEX値" pattern="#[0-9A-Fa-f]{6}" maxlength="7" spellcheck="false"></span></label>`).join("")}</div><p class="quality-status" data-contrast-status data-level="${mainContrast !== null && sidebarContrast !== null && mainContrast >= 4.5 && sidebarContrast >= 4.5 ? "ok" : "warning"}">本文 ${mainContrast?.toFixed(1)}:1 · 補足 ${sidebarContrast?.toFixed(1)}:1${mainContrast !== null && sidebarContrast !== null && mainContrast >= 4.5 && sidebarContrast >= 4.5 ? " — 標準文字の目安4.5:1以上です。" : " — 4.5:1未満の組み合わせを見直してください。"}</p></fieldset>
        <fieldset><legend>文字</legend>${fontPresetPicker(bodyFont === headingFont ? bodyFont : "")}<p class="inherit-note">端末にある日本語フォントを優先して使うためOSで字形が少し変わります。公開前は固定プレビューの自動縮小と見切れ診断も確認してください。</p><div class="editor-grid"><label>本文フォント<select name="body_font">${Object.entries(FONT_LABELS).map(([value, label]) => `<option value="${value}"${bodyFont === value ? " selected" : ""}>${label}</option>`).join("")}</select></label><label>見出しフォント<select name="heading_font">${Object.entries(FONT_LABELS).map(([value, label]) => `<option value="${value}"${headingFont === value ? " selected" : ""}>${label}</option>`).join("")}</select></label><label>本文の太さ<input name="body_weight" type="number" min="300" max="900" step="100" value="${activeTemplate.body_weight ?? 400}"></label><label>見出しの太さ<input name="heading_weight" type="number" min="300" max="900" step="100" value="${activeTemplate.heading_weight ?? 800}"></label><label>文字倍率<input name="font_scale" type="number" min="0.75" max="1.3" step="0.05" value="${activeTemplate.font_scale}"></label><label>行間<input name="line_height" type="number" min="1" max="2" step="0.05" value="${activeTemplate.line_height ?? 1.5}"></label><label>字間（em）<input name="letter_spacing_em" type="number" min="-0.08" max="0.2" step="0.01" value="${activeTemplate.letter_spacing_em ?? 0}"></label></div></fieldset>
        <fieldset><legend>動き</legend>${animationPicker(activeTemplate.enter_animation, false)}<div class="editor-grid"><label>動きの強さ<select name="motion_style">${Object.entries(MOTION_LABELS).map(([value, label]) => `<option value="${value}"${motion === value ? " selected" : ""}>${label}</option>`).join("")}</select></label><label>表示アニメーション<select name="enter_animation">${Object.entries(ANIMATION_LABELS).map(([value, label]) => `<option value="${value}"${activeTemplate.enter_animation === value ? " selected" : ""}>${label}</option>`).join("")}</select></label><label>段階アニメーション<select name="reveal_animation">${Object.entries(ANIMATION_LABELS).map(([value, label]) => `<option value="${value}"${activeTemplate.reveal_animation === value ? " selected" : ""}>${label}</option>`).join("")}</select></label></div></fieldset>
        <label class="check-label"><input type="checkbox" name="make_default"${deck.default_template_id === activeTemplate.id ? " checked" : ""}>発表全体の既定テンプレートにする</label>
        <div class="actions"><button type="submit">テンプレートを保存</button><button class="ghost danger" type="button" data-template-delete data-template-name="${escapeHtml(activeTemplate.name)}" data-delete-url="${projectPath}/templates/${escapeHtml(activeTemplate.id)}">このテンプレートを削除</button><span class="version" data-version-label>v${options.project.version}</span></div><p class="feedback" data-form-feedback aria-live="polite"></p>
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
          const stepDuration = slide.duration_seconds / (slide.reveal_steps + 1);
          const estimatedDuration = Math.max(
            1.5,
            segment.text.length / (7 * effectiveTuning.speedScale)
          );
          const profileOptions = [
            `<option value=""${segment.voice_profile_id === null || segment.voice_profile_id === undefined ? " selected" : ""}>発表全体の既定${defaultProfile ? `（${escapeHtml(defaultProfile.label)}）` : ""}</option>`,
            ...profiles.map(
              (item) => `<option value="${escapeHtml(item.id)}"${segment.voice_profile_id === item.id ? " selected" : ""}>${escapeHtml(item.label)} · ${escapeHtml(item.speaker_name)} ${escapeHtml(item.style_name)}</option>`
            )
          ].join("");
          return `<form class="voice-segment editor" id="narration-segment-${segment.at}" data-segment-editor data-segment-preview data-versioned-form action="${slidePath}/narration/segments/${segment.at}" data-version="${options.project.version}" data-slide-id="${escapeHtml(slide.id)}" data-segment-at="${segment.at}" data-effective-tuning="${escapeHtml(JSON.stringify(effectiveTuning))}" data-profile-tunings="${escapeHtml(JSON.stringify(profileTunings))}" data-step-duration="${stepDuration}" data-csrf="${escapeHtml(options.csrfToken)}">
            <div class="voice-segment-head"><span class="component-step">STEP ${segment.at}</span><span class="voice-timing" data-segment-duration data-state="${estimatedDuration > stepDuration * 1.15 ? "warning" : "ok"}">概算 ${estimatedDuration.toFixed(1)}秒 / STEP目安 ${stepDuration.toFixed(1)}秒</span><span class="audio-state${segment.audio_src ? " ready" : ""}">${segment.audio_src ? "VOICEVOX音声あり" : "ブラウザ音声で代替"}</span></div>
            <label>表示・読み上げ文<textarea name="text" maxlength="2000" required>${escapeHtml(segment.text)}</textarea></label>
            <div class="editor-grid"><label>この区間の話者名<input name="speaker" maxlength="80" value="${escapeHtml(segment.speaker ?? "")}" placeholder="スライド設定を継承"></label><label>VOICEVOXの声<select name="voice_profile_id">${profileOptions}</select></label></div>
            <p class="inherit-note">現在有効な声: ${escapeHtml(profile ? `${profile.label} / ${profile.speaker_name} ${profile.style_name}` : "未設定（ブラウザ音声）")}。空欄の調声値は選んだ声またはVOICEVOX標準値を継承します。</p>
            <fieldset><legend>調声（空欄で継承）</legend><div class="tuning-grid">${(Object.keys(DEFAULT_VOICEVOX_TUNING) as Array<keyof VoicevoxTuning>).map((key) => `<label>${TUNING_LABELS[key]}<input name="tuning_${key}" type="number" min="${VOICEVOX_TUNING_LIMITS[key].min}" max="${VOICEVOX_TUNING_LIMITS[key].max}" step="0.01" value="${segment.voice_tuning?.[key] ?? ""}" placeholder="実効 ${effectiveTuning[key]}"></label>`).join("")}</div></fieldset>
            <p class="inherit-note">ブラウザ仮試聴では速度・高さ・音量を近似します。抑揚、間、前後の無音はVOICEVOX生成後に確認してください。</p>
            <div class="actions"><button type="button" class="ghost" data-segment-speech-preview aria-pressed="false">ブラウザで仮試聴</button><button type="submit">この区間を保存</button><button type="button" class="ghost danger" data-narration-segment-delete data-delete-url="${slidePath}/narration/segments/${segment.at}" data-csrf="${escapeHtml(options.csrfToken)}">区間を削除</button><span class="version" data-version-label>v${options.project.version}</span></div><p class="feedback" data-form-feedback aria-live="polite"></p>
          </form>`;
        })
        .join("")
    : `<p class="prose">読み上げ区間はまだありません。「読み上げ区間を追加」から最初の原稿を入力できます。</p>`;
  const usedNarrationSteps = new Set(
    slide.narration?.segments.map((segment) => segment.at) ?? []
  );
  const availableNarrationSteps = Array.from(
    { length: slide.reveal_steps + 1 },
    (_, index) => index
  ).filter((step) => !usedNarrationSteps.has(step));
  const narrationSegmentCreator = availableNarrationSteps.length
    ? `<details class="component-detail"><summary>読み上げ区間を追加</summary><form class="editor" data-narration-segment-create data-segment-preview data-versioned-form data-method="POST" action="${slidePath}/narration/segments" data-version="${options.project.version}" data-slide-id="${escapeHtml(slide.id)}" data-effective-tuning="${escapeHtml(JSON.stringify(defaultNarrationTuning))}" data-step-duration="${slide.duration_seconds / (slide.reveal_steps + 1)}" data-csrf="${escapeHtml(options.csrfToken)}"><label>表示する段階<select name="at">${availableNarrationSteps.map((step) => `<option value="${step}">STEP ${step}</option>`).join("")}</select><small class="inherit-note">選ぶと左の実表示も同じSTEPへ移動します。</small></label><label>表示・読み上げ文<textarea name="text" maxlength="2000" required placeholder="この段階で読み上げる文"></textarea></label><span class="voice-timing" data-segment-duration data-state="ok">概算 1.5秒 / STEP目安 ${(slide.duration_seconds / (slide.reveal_steps + 1)).toFixed(1)}秒</span><div class="actions"><button type="button" class="ghost" data-segment-speech-preview aria-pressed="false" disabled>ブラウザで仮試聴</button><button type="submit">区間を追加</button><span class="version" data-version-label>v${options.project.version}</span></div><p class="feedback" data-form-feedback aria-live="polite"></p></form></details>`
    : `<p class="inherit-note">STEP 0〜${slide.reveal_steps}にはすべて読み上げ区間があります。</p>`;
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
  const compositionMode = slide.composition?.mode ?? "flow";
  const flowComposition = compositionMode === "flow";
  const contentSectionTitle = flowComposition ? "内容" : "基本情報と代替テキスト";
  const qualityItems = [...new Set([
    ...(missingAlt > 0 ? [`説明のない画像が${missingAlt}件あります。`] : []),
    ...(missingAudio > 0
      ? [`${missingAudio}区間はVOICEVOX音声が未生成です。編集画面ではブラウザ音声で仮試聴できます。`]
      : []),
    ...(slide.composition?.clip_content
      ? ["枠外を隠す設定です。実表示の見切れ診断を確認してください。"]
      : []),
    ...(mainContrast !== null && mainContrast < 4.5
      ? [`本文と背景のコントラストが${mainContrast.toFixed(1)}:1です。標準文字は4.5:1以上を目安にしてください。`]
      : []),
    ...(sidebarContrast !== null && sidebarContrast < 4.5
      ? [`補助文字と補足面のコントラストが${sidebarContrast.toFixed(1)}:1です。標準文字は4.5:1以上を目安にしてください。`]
      : []),
    ...(slide.composition === null || slide.composition === undefined
      ? needsReadingLayout && ["statement", "standard"].includes(typography.preset)
        ? ["文章量が多いため、「読み物」または「2段組み」の組版プリセットも確認してください。"]
        : typography.columns === 3 && (deck.aspect_ratio ?? "16:9") === "4:3"
          ? ["4:3で3段組みを使っています。1段あたりの行長と見切れ診断を確認してください。"]
          : typography.columns > 1 && headingCount === 0 && slide.content_markdown.length > 320
            ? ["段組みの文章に見出しがありません。段の切り替わりを追いやすいよう、小見出しの追加を検討してください。"]
          : []
      : []),
    ...staticSlideQuality(slide, deck.aspect_ratio ?? "16:9", deck.voicevox)
  ])];
  const workspaceTotalDurationSeconds = deck.slides.reduce(
    (total, item) => total + item.duration_seconds,
    0
  );
  const deckLayoutLabel = { cinematic: "シネマティック", biim: "BIIM", minimal: "余白重視" }[deck.layout];
  const effectiveSummary = `<div class="setting-summary" aria-label="現在有効な設定">
    <span class="setting-chip"><small>レイアウト</small>${deckLayoutLabel}</span>
    <span class="setting-chip" data-workspace-duration data-total-duration="${workspaceTotalDurationSeconds}" data-slide-duration="${slide.duration_seconds}" data-state="${workspaceTotalDurationSeconds > MAX_PRESENTATION_DURATION_SECONDS ? "warning" : "ok"}" role="status"><small>全体時間</small><span data-workspace-duration-label>${formatDuration(workspaceTotalDurationSeconds)}${workspaceTotalDurationSeconds > MAX_PRESENTATION_DURATION_SECONDS ? " · 20分超過" : ""}</span></span>
    <span class="setting-chip"><small>テンプレート</small><span data-setting-value="template">${escapeHtml(activeTemplate?.name ?? "組み込み")}</span></span>
    <span class="setting-chip"><small>配色</small>${VISUAL_LABELS[visualPreset]}</span>
    <span class="setting-chip"><small>フォント</small>${FONT_LABELS[bodyFont]} / ${FONT_LABELS[headingFont]}</span>
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
       <main class="workspace-main">
         <a class="back" href="/dashboard/projects/${escapeHtml(options.project.project_id)}">← 研究詳細へ戻る</a>
         <div class="workspace-head"><div><p class="eyebrow">スライド編集 · ${slideIndex + 1} / ${deck.slides.length}</p><h1 data-current-slide-title>${escapeHtml(slide.title)}</h1></div><div class="workspace-version"><span class="save-state" data-save-state data-state="saved" role="status" aria-live="polite">保存済み</span><span data-workspace-version>v${options.project.version}</span>${previousSlideLink}${nextSlideLink}<button class="ghost" type="button" data-preview-focus aria-pressed="false">プレビューを広げる</button><a class="button ghost" href="/dashboard/projects/${escapeHtml(options.project.project_id)}/slides/${escapeHtml(slide.id)}/frame?slide=${slideIndex + 1}&step=0" target="_blank" rel="noopener">別画面で開く</a><div class="slide-actions" role="group" aria-label="スライド構成の操作"><button class="ghost" type="button" data-slide-action="move" data-position="${Math.max(0, slideIndex - 1)}" data-action-url="${slideActionPath}" data-csrf="${escapeHtml(options.csrfToken)}"${slideIndex === 0 ? " disabled" : ""}>↑ 前へ</button><button class="ghost" type="button" data-slide-action="move" data-position="${slideIndex + 1}" data-action-url="${slideActionPath}" data-csrf="${escapeHtml(options.csrfToken)}"${slideIndex === deck.slides.length - 1 ? " disabled" : ""}>↓ 後へ</button><button class="ghost" type="button" data-slide-action="duplicate" data-action-url="${slideActionPath}" data-csrf="${escapeHtml(options.csrfToken)}">複製</button><button class="ghost danger" type="button" data-slide-action="delete" data-action-url="${slideActionPath}" data-csrf="${escapeHtml(options.csrfToken)}"${deck.slides.length === 1 ? " disabled" : ""}>削除</button></div><span class="feedback" data-slide-action-feedback aria-live="polite"></span></div></div>
         ${effectiveSummary}
         <nav class="mobile-workspace-tabs" role="tablist" aria-label="モバイル編集表示"><button class="ghost" id="mobile-tab-preview" type="button" role="tab" data-mobile-pane="preview" aria-selected="true" aria-controls="workspace-preview-pane">プレビュー<span class="tab-badge" data-mobile-preview-badge hidden>未確認</span></button><button class="ghost" id="mobile-tab-edit" type="button" role="tab" data-mobile-pane="edit" aria-selected="false" aria-controls="workspace-edit-pane" tabindex="-1">編集</button><button class="ghost" id="mobile-tab-slides" type="button" role="tab" data-mobile-pane="slides" aria-selected="false" aria-controls="workspace-slides-pane" tabindex="-1">スライド一覧</button></nav>
         <div class="slide-workspace">
           <nav class="filmstrip" id="workspace-slides-pane" role="tabpanel" aria-labelledby="mobile-tab-slides"><label class="filmstrip-search">${deck.slides.length}枚から検索<input type="search" data-filmstrip-search placeholder="タイトル・構成・音声状態" autocomplete="off"></label>${filmstrip}<p class="filmstrip-empty" data-filmstrip-empty hidden>一致するスライドはありません。</p></nav>
           <section class="panel workspace-preview" id="workspace-preview-pane" role="tabpanel" aria-labelledby="mobile-tab-preview">
             <div class="workspace-frame" style="--workspace-aspect:${(deck.aspect_ratio ?? "16:9") === "4:3" ? "4 / 3" : "16 / 9"}"><span class="frame-loading" data-frame-loading role="status">プレビューを読み込み中…</span><iframe title="${escapeHtml(slide.title)}の実表示" src="/dashboard/projects/${escapeHtml(options.project.project_id)}/slides/${escapeHtml(slide.id)}/frame?slide=${slideIndex + 1}&step=0" data-slide-frame data-aspect-ratio="${deck.aspect_ratio ?? "16:9"}"></iframe></div>
             <div class="step-control"><button class="ghost" type="button" data-step-direction="previous">← 段階</button><output data-step-output aria-live="polite">STEP 0 / ${slide.reveal_steps}</output><button class="ghost" type="button" data-step-direction="next">段階 →</button>${slide.composition?.mode === "scene" || slide.composition?.mode === "canvas" ? '<button class="ghost" type="button" data-grid-snap aria-pressed="false">5%グリッド OFF</button>' : ""}</div>
             ${slide.composition?.mode === "scene" || slide.composition?.mode === "canvas" ? '<p class="inherit-note">パーツをクリックすると編集欄を開きます。自由配置はドラッグで移動、右下でリサイズ、矢印キーで1%移動（Shiftで5%）、Alt＋矢印で大きさを調整し、Ctrl／⌘＋Sで選択中のパーツを保存できます。</p>' : ""}
             <p class="quality-status" data-layout-status role="status" aria-live="polite">実表示の文字収まりを確認しています…</p>
           </section>
           <aside class="inspector" id="workspace-edit-pane" role="tabpanel" aria-labelledby="mobile-tab-edit">${workspaceSlideCreator}
             <details class="inspector-section" data-inspector-section="content"${flowComposition ? " open" : ""}><summary>${contentSectionTitle}</summary><div class="inspector-body">
               <form class="editor" data-slide-editor data-versioned-form action="${slidePath}" data-version="${options.project.version}" data-slide-id="${escapeHtml(slide.id)}" data-composition-mode="${compositionMode}" data-max-step="${slide.reveal_steps}" data-step-count="${slide.reveal_steps + 1}" data-csrf="${escapeHtml(options.csrfToken)}">
                 ${flowComposition ? "" : '<p class="mode-note">このスライドで見える文章・画像・図形は「構造」の表示パーツです。ここでは一覧・検索・構成変換に使う代替テキストと基本情報だけを編集します。</p>'}
                 <label>タイトル<input name="title" maxlength="120" required value="${escapeHtml(slide.title)}"></label>
                 <label>想定秒数<input name="duration_seconds" type="number" min="1" max="1200" required value="${slide.duration_seconds}"><small class="inherit-note" data-duration-breakdown>読み上げを含むスライド全体の目安です。${slide.reveal_steps + 1}段階では1段階あたり約${(slide.duration_seconds / (slide.reveal_steps + 1)).toFixed(1)}秒です。</small></label>
                 <label>${flowComposition ? "スライド本文" : "代替テキスト"}（Markdown対応）<span class="markdown-toolbar" role="toolbar" aria-label="スライド本文の書式"><button class="ghost" type="button" data-markdown-action="heading" data-markdown-target="content_markdown">見出し</button><button class="ghost" type="button" data-markdown-action="bullet" data-markdown-target="content_markdown">箇条書き</button><button class="ghost" type="button" data-markdown-action="number" data-markdown-target="content_markdown">番号</button><button class="ghost" type="button" data-markdown-action="bold" data-markdown-target="content_markdown">強調</button><button class="ghost" type="button" data-markdown-action="table" data-markdown-target="content_markdown">比較表</button></span><textarea name="content_markdown" maxlength="20000" data-recommended-limit="${flowComposition ? recommendedFlowBodyLimit(slide, deck.aspect_ratio ?? "16:9") : 0}" required>${escapeHtml(slide.content_markdown)}</textarea><small class="inherit-note">${flowComposition ? "組版・比率・補足欄から文章量の目安を計算し、入力中も実表示へ反映します。" : "発表画面には直接表示されません。見える内容は「構造」の表示パーツで編集してください。"}</small></label><div class="content-structure" data-content-structure aria-live="polite"><span data-content-stat="headings">見出し 0</span><span data-content-stat="paragraphs">段落 0</span><span data-content-stat="lists">箇条書き 0</span><span data-content-stat="reading">音読 約0秒</span><button class="ghost" type="button" data-reading-layout hidden>「読み物」組版を試す</button></div>
                 <label>${flowComposition ? "補足欄（読み上げない情報）" : "代替の補足情報"}<span class="markdown-toolbar" role="toolbar" aria-label="補足欄の書式"><button class="ghost" type="button" data-markdown-action="heading" data-markdown-target="sidebar_markdown">見出し</button><button class="ghost" type="button" data-markdown-action="bullet" data-markdown-target="sidebar_markdown">箇条書き</button><button class="ghost" type="button" data-markdown-action="bold" data-markdown-target="sidebar_markdown">強調</button><button class="ghost" type="button" data-markdown-action="table" data-markdown-target="sidebar_markdown">比較表</button></span><textarea name="sidebar_markdown" maxlength="10000">${escapeHtml(slide.sidebar_markdown ?? "")}</textarea><small class="inherit-note">${flowComposition ? "作者コメント、出典、追加データなど、音声に含めない情報を置けます。" : "発表画面には直接表示されません。必要な補足は「構造」のパーツへ入れてください。"}</small></label>
                 <div class="actions"><button type="submit">${flowComposition ? "内容を保存" : "基本情報と代替テキストを保存"}</button>${nextSlidePath === null ? "" : `<button class="ghost" type="submit" data-save-next="${nextSlidePath}">保存して次へ</button>`}${slide.role === "content" && flowComposition && deck.slides.length < 100 ? `<button class="ghost" type="button" data-slide-split="${slidePath}/split" data-csrf="${escapeHtml(options.csrfToken)}">カーソル位置で2枚に分割</button>` : ""}<span class="version" data-version-label>v${options.project.version}</span></div>
                 ${slide.role === "content" && (slide.composition === null || slide.composition === undefined) && deck.slides.length < 100 ? '<p class="inherit-note">本文の分けたい位置へカーソルを置いて分割します。見た目は引き継ぎ、読み上げと補足欄は前のスライドに残ります。</p>' : ""}
                 <p class="feedback" data-form-feedback aria-live="polite"></p>
               </form>
             </div></details>
             <details class="inspector-section" data-inspector-section="design"><summary>デザイン</summary><div class="inspector-body">
               <form class="editor" data-appearance-editor data-versioned-form action="${slidePath}" data-version="${options.project.version}" data-slide-id="${escapeHtml(slide.id)}" data-preview-templates="${escapeHtml(JSON.stringify(appearancePreviewTemplates))}" data-csrf="${escapeHtml(options.csrfToken)}"><label>テンプレート<select name="template_id">${templateOptions}</select></label><div class="editor-grid"><label>用途<select name="role"><option value="content"${slide.role !== "cover" ? " selected" : ""}>通常スライド</option><option value="cover"${slide.role === "cover" ? " selected" : ""}>表紙</option></select></label><label>表紙レイアウト<select name="cover_layout">${[["center", "中央タイトル"], ["split", "左右分割"], ["poster", "ポスター"], ["minimal", "余白重視"], ["statement", "一言を強調"], ["band", "中央帯"], ["corner", "左下タイトル"], ["frame", "額縁"]].map(([value, label]) => `<option value="${value}"${(slide.cover_layout ?? "center") === value ? " selected" : ""}>${label}</option>`).join("")}</select></label></div>${coverLayoutPicker}<div class="editor-grid"><label>色調<select name="tone">${Object.entries(TONE_LABELS).map(([value, label]) => `<option value="${value}"${slide.tone === value ? " selected" : ""}>${label}</option>`).join("")}</select></label><label>表示アニメーション<select name="enter_animation"><option value=""${slide.enter_animation === null || slide.enter_animation === undefined ? " selected" : ""}>テンプレートを継承</option>${animationOptions}</select></label></div>${tonePicker}${animationPicker(slide.enter_animation ?? "", true)}<div class="actions"><button type="submit">スライド外観を保存</button><span class="version" data-version-label>v${options.project.version}</span></div><p class="feedback" data-form-feedback aria-live="polite"></p></form>
               ${typographyEditor}
               ${templateCreator}
               ${templateEditor}
             </div></details>
             <details class="inspector-section" data-inspector-section="narration"><summary>読み上げ</summary><div class="inspector-body">
               <form class="editor" data-narration-settings-editor data-versioned-form action="${slidePath}/narration/settings" data-version="${options.project.version}" data-slide-id="${escapeHtml(slide.id)}" data-csrf="${escapeHtml(options.csrfToken)}"><div class="editor-grid"><label>表示形式<select name="display">${Object.entries(NARRATION_DISPLAY_LABELS).map(([value, label]) => `<option value="${value}"${narrationDisplay === value ? " selected" : ""}>${label}</option>`).join("")}</select></label><label>スライド話者名<input name="speaker" maxlength="80" value="${escapeHtml(slide.narration?.speaker ?? "")}" placeholder="発表全体の既定: ${escapeHtml(deck.narration_defaults?.speaker ?? "なし")}"></label></div>${narrationDisplayPicker}<fieldset><legend>読み上げ枠</legend><div class="editor-grid"><label>配置<select name="placement">${[["bottom", "下部"], ["overlay-bottom", "下部に重ねる"], ["sidebar", "補足欄"]].map(([value, label]) => `<option value="${value}"${narrationAppearance.placement === value ? " selected" : ""}>${label}</option>`).join("")}</select></label><label>大きさ<select name="size">${[["compact", "小"], ["normal", "標準"], ["large", "大"]].map(([value, label]) => `<option value="${value}"${narrationAppearance.size === value ? " selected" : ""}>${label}</option>`).join("")}</select></label><label>文字揃え<select name="text_align"><option value="start"${narrationAppearance.text_align === "start" ? " selected" : ""}>左</option><option value="center"${narrationAppearance.text_align === "center" ? " selected" : ""}>中央</option></select></label><label>文字倍率<input name="text_scale" type="number" min="0.75" max="1.5" step="0.05" value="${narrationAppearance.text_scale}"></label><label>最大行数<input name="max_lines" type="number" min="2" max="8" value="${narrationAppearance.max_lines}"></label></div><label class="check-label"><input name="speaker_visible" type="checkbox"${narrationAppearance.speaker_visible ? " checked" : ""}>話者名を表示</label><label class="check-label"><input name="progress_visible" type="checkbox"${narrationAppearance.progress_visible ? " checked" : ""}>読み上げ進捗を表示</label></fieldset><fieldset><legend>読み上げ枠の色</legend>${narrationPalettePicker}<div class="editor-grid">${narrationColorControls}<label>角丸（px）<input name="appearance_corner_radius_px" type="number" min="0" max="64" value="${narrationAppearance.corner_radius_px ?? ""}" placeholder="空欄で表示形式の既定"></label></div><p class="inherit-note">空欄は選択した表示形式とテンプレートの色を使います。</p></fieldset><p class="inherit-note">話者の実効値: ${escapeHtml(effectiveSpeaker ?? "なし")}。この欄で保存するとスライド設定として上書きします。</p><div class="actions"><button type="submit">読み上げ枠を保存</button><span class="version" data-version-label>v${options.project.version}</span></div><p class="feedback" data-form-feedback aria-live="polite"></p></form>
               ${narrationSegmentCreator}${voiceSegments}
             </div></details>
             <details class="inspector-section" data-inspector-section="structure"${flowComposition ? "" : " open"}><summary>構造 · ${escapeHtml(slideCompositionLabel(slide))}</summary><div class="inspector-body"><p class="mode-note">${escapeHtml(modeNote)}</p>${compositionEditor}${canvasBlockCreator}${sceneComponentCreate}${canvasBlockEditors}${sceneComponentEditors}${componentOutline}</div></details>
             <details class="inspector-section" data-inspector-section="quality" open><summary>品質確認</summary><div class="inspector-body"><p class="quality-status" data-quality-summary data-base-count="${qualityItems.length}" data-level="${qualityItems.length ? "warning" : "ok"}">${qualityItems.length ? `${qualityItems.length}件の確認事項があります。` : "保存データ上の確認事項はありません。"}</p><ul class="quality-list" data-quality-list>${qualityItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div></details>
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
