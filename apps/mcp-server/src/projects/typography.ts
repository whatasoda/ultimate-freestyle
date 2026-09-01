import type { SlideTypography } from "./schema";
import type { ProjectRecord } from "./schema";

export type ResolvedSlideTypography = {
  preset: SlideTypography["preset"];
  columns: number;
  body_scale: number;
  heading_scale: number;
  line_height: number;
  paragraph_spacing_em: number;
  column_gap_em: number;
  text_align: "start" | "center";
  vertical_align: "start" | "center";
};

export const SLIDE_TYPOGRAPHY_PRESET_DEFAULTS: Record<
  SlideTypography["preset"],
  Omit<ResolvedSlideTypography, "preset">
> = {
  statement: {
    columns: 1,
    body_scale: 1.1,
    heading_scale: 1.15,
    line_height: 1.3,
    paragraph_spacing_em: 0.7,
    column_gap_em: 2.5,
    text_align: "start",
    vertical_align: "center"
  },
  standard: {
    columns: 1,
    body_scale: 1,
    heading_scale: 1,
    line_height: 1.5,
    paragraph_spacing_em: 0.65,
    column_gap_em: 2.5,
    text_align: "start",
    vertical_align: "start"
  },
  article: {
    columns: 1,
    body_scale: 0.7,
    heading_scale: 0.75,
    line_height: 1.6,
    paragraph_spacing_em: 0.75,
    column_gap_em: 2.8,
    text_align: "start",
    vertical_align: "start"
  },
  columns: {
    columns: 2,
    body_scale: 0.65,
    heading_scale: 0.72,
    line_height: 1.55,
    paragraph_spacing_em: 0.65,
    column_gap_em: 3,
    text_align: "start",
    vertical_align: "start"
  },
  dense: {
    columns: 2,
    body_scale: 0.55,
    heading_scale: 0.62,
    line_height: 1.45,
    paragraph_spacing_em: 0.45,
    column_gap_em: 2.5,
    text_align: "start",
    vertical_align: "start"
  }
};

export function resolveSlideTypography(
  value: SlideTypography | undefined,
  inheritedLineHeight = 1.5
): ResolvedSlideTypography {
  const preset = value?.preset ?? "standard";
  const defaults = SLIDE_TYPOGRAPHY_PRESET_DEFAULTS[preset];
  return {
    preset,
    ...defaults,
    ...(preset === "standard" ? { line_height: inheritedLineHeight } : {}),
    ...value
  };
}

type FlowSlide = NonNullable<ProjectRecord["document"]["deck"]>["slides"][number];

export function recommendedFlowBodyLimit(
  slide: FlowSlide,
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
