import {
  mergeVoicevoxTuning
} from "@ultimate-freestyle/research-schema/voice";

import type { ProjectRecord } from "./schema";
import { resolveSlideTypography } from "./typography";

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

export function recommendedFlowBodyLimit(
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

export function staticSlideQuality(
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
