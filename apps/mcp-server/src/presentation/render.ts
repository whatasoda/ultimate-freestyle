import type {
  ProjectRecord,
  SlideBlock,
  SlideSceneNode
} from "../projects/schema";
import { resolveSlideTypography } from "../projects/typography";

export const PRESENTATION_RENDERER_VERSION = "uf-renderer@114";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function readableForeground(background: string): "#10131a" | "#f8fafc" {
  const channels = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(background)?.slice(1).map((value) => Number.parseInt(value, 16));
  if (!channels || channels.length !== 3) return "#10131a";
  const luminance = channels
    .map((value) => value / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
  const darkContrast = (luminance + 0.05) / 0.056;
  const lightContrast = 1.05 / (luminance + 0.05);
  return darkContrast >= lightContrast ? "#10131a" : "#f8fafc";
}

function renderInlineText(value: string): string {
  return escapeHtml(value).replace(
    /\*\*([^*\n]+)\*\*/g,
    "<strong>$1</strong>"
  );
}

function renderTextBlocks(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const blocks: string[] = [];
  let list: string[] = [];
  let listTag: "ul" | "ol" = "ul";

  const flushList = () => {
    if (list.length === 0) return;
    blocks.push(`<${listTag}>${list.map((item) => `<li>${item}</li>`).join("")}</${listTag}>`);
    list = [];
  };

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? "";
    const trimmed = line.trim();
    const nextLine = lines[lineIndex + 1]?.trim() ?? "";
    const tableCells = (value: string) => {
      const withoutEdges = value.replace(/^\s*\|/, "").replace(/\|\s*$/, "");
      return withoutEdges.split("|").map((cell) => cell.trim());
    };
    const headerCells = tableCells(trimmed);
    const separatorCells = tableCells(nextLine);
    if (
      trimmed.includes("|") &&
      nextLine.includes("|") &&
      headerCells.length === separatorCells.length &&
      separatorCells.every((cell) => /^:?-{3,}:?$/.test(cell))
    ) {
      flushList();
      const alignments = separatorCells.map((cell) =>
        cell.startsWith(":") && cell.endsWith(":")
          ? "center"
          : cell.endsWith(":")
            ? "right"
            : "start"
      );
      const rows: string[][] = [];
      lineIndex += 2;
      while (lineIndex < lines.length) {
        const row = (lines[lineIndex] ?? "").trim();
        if (row.length === 0 || !row.includes("|")) break;
        const cells = tableCells(row);
        rows.push(headerCells.map((_, index) => cells[index] ?? ""));
        lineIndex += 1;
      }
      lineIndex -= 1;
      const cellClass = (index: number) => ` class="align-${alignments[index] ?? "start"}"`;
      blocks.push(`<table><thead><tr>${headerCells.map((cell, index) => `<th${cellClass(index)}>${renderInlineText(cell)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell, index) => `<td${cellClass(index)}>${renderInlineText(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
      continue;
    }
    if (trimmed.startsWith("- ")) {
      if (list.length > 0 && listTag !== "ul") flushList();
      listTag = "ul";
      list.push(renderInlineText(trimmed.slice(2)));
      continue;
    }
    const orderedItem = trimmed.match(/^\d+\.\s+(.+)$/);
    if (orderedItem?.[1] !== undefined) {
      if (list.length > 0 && listTag !== "ol") flushList();
      listTag = "ol";
      list.push(renderInlineText(orderedItem[1]));
      continue;
    }
    flushList();
    if (trimmed.length === 0) continue;
    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = Math.min(heading[1].length + 1, 4);
      blocks.push(`<h${level}>${renderInlineText(heading[2])}</h${level}>`);
    } else {
      blocks.push(`<p>${renderInlineText(trimmed)}</p>`);
    }
  }
  flushList();
  return blocks.join("\n");
}

function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

type VisualPreset =
  | "studio"
  | "paper"
  | "editorial"
  | "neon"
  | "retro-game"
  | "soft-pop"
  | "scientific"
  | "museum"
  | "terminal";
type FontPreset =
  | "system-sans"
  | "gothic"
  | "rounded"
  | "mincho"
  | "serif"
  | "monospace"
  | "display"
  | "textbook"
  | "handwritten"
  | "condensed";

const FONT_CANDIDATES: Record<FontPreset, string[]> = {
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
type DensityPreset = "spacious" | "comfortable" | "compact";
type MotionStyle = "calm" | "snappy" | "dramatic";

type TemplateAppearance = {
  visual_preset?: VisualPreset;
  body_font?: FontPreset;
  heading_font?: FontPreset;
  density?: DensityPreset;
  body_weight?: number;
  heading_weight?: number;
  line_height?: number;
  letter_spacing_em?: number;
  motion_style?: MotionStyle;
};

function templateAppearance(template: unknown): Required<TemplateAppearance> {
  const value = (template ?? {}) as TemplateAppearance;
  return {
    visual_preset: value.visual_preset ?? "studio",
    body_font: value.body_font ?? "system-sans",
    heading_font: value.heading_font ?? "system-sans",
    density: value.density ?? "comfortable",
    body_weight: value.body_weight ?? 400,
    heading_weight: value.heading_weight ?? 800,
    line_height: value.line_height ?? 1.5,
    letter_spacing_em: value.letter_spacing_em ?? 0,
    motion_style: value.motion_style ?? "calm"
  };
}

function narrationAppearance(
  display: "dialogue" | "commentary" | "inline" | "subtitle" | "minimal",
  deckValue: Record<string, unknown> | undefined,
  slideValue: Record<string, unknown> | undefined
): {
  placement: "bottom" | "overlay-bottom" | "sidebar";
  size: "compact" | "normal" | "large";
  text_align: "start" | "center";
  speaker_visible: boolean;
  progress_visible: boolean;
  text_scale: number;
  max_lines: number;
  background?: string;
  foreground?: string;
  border_color?: string;
  accent?: string;
  corner_radius_px?: number;
} {
  const defaults = {
    placement: "bottom" as const,
    size: "normal" as const,
    text_align: (["commentary", "subtitle", "minimal"] as string[]).includes(display)
      ? ("center" as const)
      : ("start" as const),
    speaker_visible: true,
    progress_visible: true,
    text_scale: 1,
    max_lines:
      display === "dialogue" ? 4 : display === "inline" ? 8 : display === "commentary" ? 3 : 2
  };
  return { ...defaults, ...deckValue, ...slideValue } as ReturnType<
    typeof narrationAppearance
  >;
}

function stageLength(px: number): string {
  return `${Number((px / 16).toFixed(4))}cqw`;
}

export type PresentationRenderOptions = {
  assetUrls?: Readonly<Record<string, string>>;
  frameAncestors?: "'none'" | "'self'";
  editorFrame?: boolean;
  editorPrelude?: boolean;
  revisionId?: string;
};

export function listPresentationAssetIds(project: ProjectRecord): string[] {
  return [
    ...new Set(
      (project.document.deck?.slides ?? []).flatMap(
        (slide) => {
          const composition = slide.composition;
          if (!composition) return [];
          return composition.mode === "canvas"
            ? composition.blocks.flatMap((block) =>
                block.kind === "image" ? [block.asset_id] : []
              )
            : composition.nodes.flatMap((node) =>
                node.kind === "image" ? [node.asset_id] : []
              );
        }
      )
    )
  ];
}

function styleCss(
  style: SlideBlock["style"] | SlideSceneNode["style"],
  applyVerticalAlignment = true
): string {
  const verticalAlign =
    style?.vertical_align === "center"
      ? "center"
      : style?.vertical_align === "end"
        ? "flex-end"
        : "flex-start";
  const textAlign =
    style?.text_align === "center"
      ? "center"
      : style?.text_align === "end"
        ? "end"
        : "start";
  const shadow =
    style?.shadow === "soft"
      ? "0 .375cqw 1.375cqw #0005"
      : style?.shadow === "strong"
        ? "0 .75cqw 2.25cqw #0009"
        : "none";
  return `
      background: ${style?.background ?? "transparent"};
      color: ${style?.foreground ?? "inherit"};
      border: ${style?.border_width_px ? `max(1px, ${stageLength(style.border_width_px)})` : "0"} solid ${style?.border_color ?? "transparent"};
      border-radius: ${stageLength(style?.corner_radius_px ?? 0)};
      padding: ${stageLength(style?.padding_px ?? 0)};
      --component-opacity: ${style?.opacity ?? 1};
      --component-font-scale: ${style?.font_scale ?? 1};
      text-align: ${textAlign};${applyVerticalAlignment ? ` justify-content: ${verticalAlign};` : ""}
      box-shadow: ${shadow};`;
}

function blockCss(slideId: string, block: SlideBlock): string {
  return `.slide[data-slide-id="${slideId}"] [data-block-id="${block.id}"] {
      left: ${block.frame.x}%; top: ${block.frame.y}%;
      width: ${block.frame.width}%; height: ${block.frame.height}%;
      z-index: ${block.z_index};
      ${styleCss(block.style)}
    }`;
}

function renderCanvasBlock(
  block: SlideBlock,
  assetUrls: Readonly<Record<string, string>>
): string {
  const fit = block.kind === "image" ? "" : ` data-fit-content data-fit-id="block:${escapeHtml(block.id)}" data-fit-region="${block.kind}"`;
  const attributes = `class="canvas-block reveal-block" data-block-id="${escapeHtml(block.id)}" data-block-kind="${block.kind}" data-reveal="${block.at}" data-reveal-at="${block.at}" data-animation="${block.animation}"${fit} aria-hidden="true"`;
  if (block.kind === "markdown") {
    return `<div ${attributes}>${renderTextBlocks(block.markdown)}</div>`;
  }
  if (block.kind === "image") {
    const src = assetUrls[block.asset_id] ?? `/media/${block.asset_id}`;
    return `<figure ${attributes}><img src="${escapeHtml(src)}" alt="${escapeHtml(block.alt_text)}" data-fit="${block.fit}"></figure>`;
  }
  return `<div ${attributes} data-shape="${block.shape}">${block.label === null ? "" : `<span>${escapeHtml(block.label)}</span>`}</div>`;
}

function sceneNodeCss(slideId: string, node: SlideSceneNode): string {
  const selector = `.slide[data-slide-id="${slideId}"] [data-node-id="${node.id}"]`;
  const frame = node.frame
    ? `position: absolute; left: ${node.frame.x}%; top: ${node.frame.y}%; width: ${node.frame.width}%; height: ${node.frame.height}%; z-index: ${node.order};`
    : "position: relative;";
  const layout =
    node.kind === "stack"
      ? `display: flex; flex-direction: ${node.direction}; gap: ${stageLength(node.gap_px)}; align-items: ${node.align === "start" ? "flex-start" : node.align === "end" ? "flex-end" : node.align}; justify-content: ${node.justify === "start" ? "flex-start" : node.justify === "end" ? "flex-end" : node.justify === "between" ? "space-between" : node.justify === "around" ? "space-around" : "center"}; flex-wrap: ${node.wrap ? "wrap" : "nowrap"};`
      : node.kind === "grid"
        ? `display: grid; grid-template-columns: repeat(${node.columns}, minmax(0, 1fr)); grid-auto-rows: minmax(0, 1fr); gap: ${stageLength(node.gap_px)}; align-items: ${node.align === "start" ? "start" : node.align === "end" ? "end" : node.align};`
        : node.kind === "layer"
          ? "display: block; min-height: 100%;"
          : "display: flex; flex-direction: column;";
  const itemCss =
    node.kind === "bar_chart"
      ? node.items
          .map((item) => {
            const width = Math.min(100, Math.max(0, (item.value / node.max_value) * 100));
            return `${selector} [data-item-id="${item.id}"] { --bar-width: ${width}%; --bar-color: ${item.color ?? "var(--accent)"}; }`;
          })
          .join("\n")
      : "";
  return `${selector} { ${frame} ${layout} ${styleCss(node.style, node.kind !== "stack")} }
${itemCss}`;
}

function sceneAttributes(node: SlideSceneNode): string {
  const fit = ["layer", "stack", "grid", "image", "shape"].includes(node.kind)
    ? ""
    : ` data-fit-content data-fit-id="node:${escapeHtml(node.id)}" data-fit-region="${node.kind}"`;
  return `class="scene-node reveal-block" data-node-id="${escapeHtml(node.id)}" data-component="uf-${node.kind.replaceAll("_", "-")}" data-reveal="${node.at}" data-reveal-at="${node.at}" data-animation="${node.animation}" data-positioned="${String(node.frame !== null && node.frame !== undefined)}"${fit} aria-hidden="true"`;
}

function renderSceneNode(
  node: SlideSceneNode,
  children: string,
  assetUrls: Readonly<Record<string, string>>
): string {
  const attributes = sceneAttributes(node);
  if (node.kind === "layer" || node.kind === "stack" || node.kind === "grid") {
    return `<uf-${node.kind} ${attributes}>${children}</uf-${node.kind}>`;
  }
  if (node.kind === "hero") {
    const compactHeading = [...node.heading].length <= 16;
    return `<uf-hero ${attributes} data-align="${node.align}" data-compact-heading="${String(compactHeading)}">${node.eyebrow === null ? "" : `<p class="component-eyebrow">${escapeHtml(node.eyebrow)}</p>`}<h2>${escapeHtml(node.heading)}</h2>${node.subtitle === null ? "" : `<p class="component-subtitle">${escapeHtml(node.subtitle)}</p>`}</uf-hero>`;
  }
  if (node.kind === "markdown") {
    return `<uf-markdown ${attributes}>${renderTextBlocks(node.markdown)}</uf-markdown>`;
  }
  if (node.kind === "image") {
    const src = assetUrls[node.asset_id] ?? `/media/${node.asset_id}`;
    return `<uf-image ${attributes}><img src="${escapeHtml(src)}" alt="${escapeHtml(node.alt_text)}" data-fit="${node.fit}">${node.caption === null ? "" : `<small data-fit-content data-fit-id="node:${escapeHtml(node.id)}" data-fit-region="画像キャプション">${escapeHtml(node.caption)}</small>`}</uf-image>`;
  }
  if (node.kind === "shape") {
    return `<uf-shape ${attributes} data-shape="${node.shape}">${node.label === null ? "" : `<span data-fit-content data-fit-id="node:${escapeHtml(node.id)}" data-fit-region="図形ラベル">${escapeHtml(node.label)}</span>`}</uf-shape>`;
  }
  if (node.kind === "card") {
    return `<uf-card ${attributes} data-variant="${node.variant}">${node.label === null ? "" : `<p class="component-label">${escapeHtml(node.label)}</p>`}<div>${renderTextBlocks(node.markdown)}</div></uf-card>`;
  }
  if (node.kind === "metric") {
    return `<uf-metric ${attributes} data-emphasis="${node.emphasis}"><p><strong>${escapeHtml(node.value)}</strong>${node.unit === null ? "" : `<span>${escapeHtml(node.unit)}</span>`}</p><small>${escapeHtml(node.caption)}</small></uf-metric>`;
  }
  if (node.kind === "quote") {
    return `<uf-quote ${attributes}><blockquote>${escapeHtml(node.quote)}</blockquote>${node.attribution === null ? "" : `<cite>${escapeHtml(node.attribution)}</cite>`}</uf-quote>`;
  }
  if (node.kind === "callout") {
    return `<uf-callout ${attributes} data-variant="${node.variant}">${node.label === null ? "" : `<p class="component-label">${escapeHtml(node.label)}</p>`}<h3>${escapeHtml(node.heading)}</h3>${node.markdown === null ? "" : `<div>${renderTextBlocks(node.markdown)}</div>`}</uf-callout>`;
  }
  if (node.kind === "bar_chart") {
    return `<uf-bar-chart ${attributes}>${node.items
      .map(
        (item) => `<uf-bar-row class="reveal-block" data-item-id="${escapeHtml(item.id)}" data-reveal="${item.at}" data-reveal-at="${item.at}" data-animation="rise" aria-hidden="true"><span>${escapeHtml(item.label)}</span><i></i><strong>${item.value}</strong></uf-bar-row>`
      )
      .join("")}</uf-bar-chart>`;
  }
  return `<uf-timeline ${attributes}>${node.items
    .map(
      (item) => `<uf-timeline-item class="reveal-block" data-item-id="${escapeHtml(item.id)}" data-reveal="${item.at}" data-reveal-at="${item.at}" data-animation="rise" aria-hidden="true">${item.kicker === null ? "" : `<small>${escapeHtml(item.kicker)}</small>`}<strong>${escapeHtml(item.heading)}</strong>${item.detail === null ? "" : `<p>${escapeHtml(item.detail)}</p>`}</uf-timeline-item>`
    )
    .join("")}</uf-timeline>`;
}

function renderScene(
  nodes: SlideSceneNode[],
  assetUrls: Readonly<Record<string, string>>
): string {
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
  const renderChildren = (parentId: string | null): string =>
    (children.get(parentId) ?? [])
      .map((node) =>
        renderSceneNode(node, renderChildren(node.id), assetUrls)
      )
      .join("\n");
  return renderChildren(null);
}

export function renderPresentationHtml(
  project: ProjectRecord,
  options: PresentationRenderOptions = {}
): string {
  const deck = project.document.deck;
  if (deck === null || deck.slides.length === 0) {
    throw new Error("A non-empty deck is required to render a presentation.");
  }

  const profiles = new Map(
    (deck.voicevox?.profiles ?? []).map((profile) => [profile.id, profile])
  );
  const defaultProfile = deck.voicevox
    ? profiles.get(deck.voicevox.default_profile_id)
    : undefined;
  const aspectRatio = deck.aspect_ratio ?? "16:9";
  const totalDurationSeconds = deck.slides.reduce(
    (total, slide) => total + slide.duration_seconds,
    0
  );
  const formattedTotalDuration = `${String(Math.floor(totalDurationSeconds / 60)).padStart(2, "0")}:${String(totalDurationSeconds % 60).padStart(2, "0")}`;
  const loadingScreen = {
    enabled: true,
    style: "pulse" as const,
    message: "発表の準備をしています",
    show_progress: true,
    minimum_duration_ms: 500,
    ...(deck.loading_screen ?? {})
  };
  const preloadSlides = deck.slides.map((slide) => {
    const assetIds = slide.composition?.mode === "canvas"
      ? slide.composition.blocks.flatMap((block) => block.kind === "image" ? [block.asset_id] : [])
      : slide.composition?.mode === "scene"
        ? slide.composition.nodes.flatMap((node) => node.kind === "image" ? [node.asset_id] : [])
        : [];
    return {
      images: [...new Set(assetIds.map((assetId) => options.assetUrls?.[assetId] ?? `/media/${encodeURIComponent(assetId)}`))],
      audio: [...new Map(slide.narration?.segments.flatMap((segment) => segment.audio_src === null ? [] : [[segment.audio_src, { url: segment.audio_src, at: segment.at }] as const]) ?? []).values()]
    };
  });
  const voiceCredits = [
    ...new Set(
      deck.slides.flatMap(
        (slide) =>
          slide.narration?.segments.flatMap((segment) => {
            if (segment.audio_src === null) return [];
            const segmentProfile =
              (segment.voice_profile_id ? profiles.get(segment.voice_profile_id) : undefined) ?? defaultProfile;
            const usedProfiles = segment.voice_cues?.map((cue) =>
              (cue.voice_profile_id ? profiles.get(cue.voice_profile_id) : undefined) ?? segmentProfile
            ) ?? [segmentProfile];
            return usedProfiles.flatMap((profile) => profile ? [`VOICEVOX:${profile.speaker_name}`] : []);
          }) ?? []
      )
    )
  ];

  const runtimeDeck = {
    projectId: project.project_id,
    version: project.version,
    rendererVersion: PRESENTATION_RENDERER_VERSION,
    previewRevisionId: options.revisionId ?? null,
    title: project.document.title,
    shortTitle: deck.short_title,
    layout: deck.layout,
    aspectRatio,
    accent: deck.accent,
    loadingScreen,
    preload: { slides: preloadSlides },
    voiceCredits,
    slides: deck.slides.map((slide) => {
      const segments = slide.narration?.segments.map((segment) => {
        const profile =
          (segment.voice_profile_id
            ? profiles.get(segment.voice_profile_id)
            : undefined) ?? defaultProfile;
        return {
          ...segment,
          pauseBeforeMs: segment.pause_before_ms ?? 0,
          pauseAfterMs: segment.pause_after_ms ?? 350,
          voiceProfileLabel: profile?.label ?? null,
          voiceSpeakerName: profile?.speaker_name ?? null,
          voiceStyleName: profile?.style_name ?? null,
          effectiveTuning: {
            speedScale: 1,
            pitchScale: 0,
            intonationScale: 1,
            volumeScale: 1,
            pauseLengthScale: 1,
            prePhonemeLength: 0.1,
            postPhonemeLength: 0.1,
            ...(profile?.tuning ?? {}),
            ...(segment.voice_tuning ?? {})
          },
          voiceCues: segment.voice_cues?.map((cue) => {
            const cueProfile =
              (cue.voice_profile_id ? profiles.get(cue.voice_profile_id) : undefined) ?? profile;
            return {
              ...cue,
              pauseAfterMs: cue.pause_after_ms ?? 0,
              voiceProfileLabel: cueProfile?.label ?? null,
              voiceSpeakerName: cueProfile?.speaker_name ?? null,
              voiceStyleName: cueProfile?.style_name ?? null,
              effectiveTuning: {
                speedScale: 1,
                pitchScale: 0,
                intonationScale: 1,
                volumeScale: 1,
                pauseLengthScale: 1,
                prePhonemeLength: 0.1,
                postPhonemeLength: 0.1,
                ...(cueProfile?.tuning ?? profile?.tuning ?? {}),
                ...(segment.voice_tuning ?? {}),
                ...(cue.voice_tuning ?? {})
              }
            };
          }) ?? null
        };
      });
      return {
        id: slide.id,
        title: slide.title,
        durationSeconds: slide.duration_seconds,
        revealSteps: slide.reveal_steps,
        narration:
          slide.narration === null
            ? null
            : {
                ...slide.narration,
                speaker:
                  slide.narration.speaker ??
                  deck.narration_defaults?.speaker ??
                  null,
                segments
              }
      };
    })
  };
  const templates = new Map(
    (deck.templates ?? []).map((template) => [template.id, template])
  );
  const firstSlide = deck.slides[0];
  const firstTemplateId = firstSlide.template_id ?? deck.default_template_id ?? null;
  const preludeHeadingFont = templateAppearance(
    firstTemplateId === null ? null : templates.get(firstTemplateId)
  ).heading_font;
  const preludeAccentForeground = readableForeground(deck.accent);
  const templateCss = [...templates.values()]
    .map(
      (template) => {
        const appearance = templateAppearance(template);
        return `.slide[data-template-id="${template.id}"] {
      --template-background: ${template.background};
      --template-surface: ${template.surface};
      --template-foreground: ${template.foreground};
      --template-muted: ${template.muted};
      --template-accent: ${template.accent};
      --template-accent-secondary: ${template.accent_secondary ?? template.accent};
      --template-border: ${template.border ?? template.muted};
      --template-radius: ${stageLength(template.corner_radius_px)};
      --template-spacing: ${template.spacing_scale};
      --template-font-scale: ${template.font_scale};
      --template-sidebar-width: ${template.sidebar_width_percent}%;
      --body-weight: ${appearance.body_weight};
      --heading-weight: ${appearance.heading_weight};
      --body-line-height: ${appearance.line_height};
      --body-letter-spacing: ${appearance.letter_spacing_em}em;
    }`;
      }
    )
    .join("\n");
  const compositionCss = deck.slides
    .flatMap((slide) => {
      if (slide.composition === null || slide.composition === undefined) {
        return [];
      }
      const composition = slide.composition;
      return [
        `.slide[data-slide-id="${slide.id}"] { --canvas-background: ${composition.background}; --canvas-overflow: ${composition.clip_content ? "hidden" : "visible"}; }`,
        ...(composition.mode === "canvas"
          ? composition.blocks.map((block) => blockCss(slide.id, block))
          : composition.nodes.map((node) => sceneNodeCss(slide.id, node)))
      ];
    })
    .join("\n");
  const slideHtml = deck.slides
    .map((slide, index) => {
      const templateId = slide.template_id ?? deck.default_template_id ?? null;
      const template = templateId === null ? null : templates.get(templateId);
      const appearance = templateAppearance(template);
      if (template === null && deck.layout === "minimal") {
        appearance.visual_preset = "paper";
      }
      const typography = resolveSlideTypography(
        slide.typography,
        appearance.line_height
      );
      const regionLayout = template?.region_layout ?? "sidebar-right";
      const enterAnimation =
        slide.enter_animation ?? template?.enter_animation ?? "fade";
      const revealAnimation = template?.reveal_animation ?? "rise";
      const composition = slide.composition;
      const narrationDisplay = slide.narration?.display ?? "commentary";
      const narrationStyle = narrationAppearance(
        narrationDisplay,
        deck.narration_defaults?.appearance,
        slide.narration?.appearance
      );
      const narrationVariables = [
        narrationStyle.background ? `--narration-custom-background:${narrationStyle.background}` : "",
        narrationStyle.foreground ? `--narration-custom-foreground:${narrationStyle.foreground}` : "",
        narrationStyle.border_color ? `--narration-custom-border:${narrationStyle.border_color}` : "",
        narrationStyle.accent ? `--narration-custom-accent:${narrationStyle.accent}` : "",
        narrationStyle.corner_radius_px !== undefined ? `--narration-custom-radius:${stageLength(narrationStyle.corner_radius_px)}` : ""
      ].filter(Boolean).join(";");
      const initialNarrationSegment = slide.narration?.segments.find(
        (segment) => segment.at === 0
      );
      const narrationSpeaker =
        initialNarrationSegment?.speaker ??
        slide.narration?.speaker ??
        deck.narration_defaults?.speaker ??
        "";
      const inlineNarration =
        narrationDisplay === "inline"
          ? slide.narration?.segments
              .map(
                (segment) => `<span class="narration-segment" data-narration-at="${segment.at}">${escapeHtml(segment.text)}</span>`
              )
              .join("") ?? ""
          : "";
      const content = composition?.mode === "canvas"
        ? `<div class="slide-canvas" data-region="canvas">${composition.blocks.map((block) => renderCanvasBlock(block, options.assetUrls ?? {})).join("\n")}</div>`
        : composition?.mode === "scene"
          ? `<div class="slide-scene" data-region="scene" data-runtime-version="${composition.runtime_version}">${renderScene(composition.nodes, options.assetUrls ?? {})}</div>`
        : `<div class="slide-main" data-region="main" data-fit-content data-fit-id="flow:main" data-fit-region="main">
    <p class="eyebrow" data-flow-title>${String(index + 1).padStart(2, "0")} · ${escapeHtml(slide.title)}</p>
    <div class="slide-content" data-flow-content data-columns="${typography.columns}">${renderTextBlocks(slide.content_markdown)}</div>
    ${slide.reveal_blocks.map((block) => `<div class="reveal-block" data-reveal="${block.at}" data-reveal-at="${block.at}" data-animation="${revealAnimation}" aria-hidden="true">${renderTextBlocks(block.markdown)}</div>`).join("\n")}
  </div>
  <aside class="slide-sidebar" data-flow-sidebar data-region="sidebar" data-fit-content data-fit-id="flow:sidebar" data-fit-region="sidebar"${slide.sidebar_markdown === null ? " hidden" : ""}>
    ${slide.sidebar_markdown === null ? "" : renderTextBlocks(slide.sidebar_markdown)}
  </aside>`;
      return `<article class="slide tone-${slide.tone}" role="group" aria-roledescription="スライド" aria-label="${index + 1} / ${deck.slides.length}：${escapeHtml(slide.title)}" data-slide="${index}" data-slide-id="${escapeHtml(slide.id)}" data-slide-role="${slide.role ?? "content"}" data-cover-layout="${slide.cover_layout ?? "center"}" data-template-id="${escapeHtml(templateId ?? `builtin-${deck.layout}`)}" data-user-template="${String(template !== undefined && template !== null)}" data-region-layout="${regionLayout}" data-composition="${composition?.mode ?? "flow"}" data-tone="${slide.tone}" data-visual-preset="${appearance.visual_preset}" data-body-font="${appearance.body_font}" data-heading-font="${appearance.heading_font}" data-density="${appearance.density}" data-motion-style="${appearance.motion_style}" data-text-preset="${typography.preset}" data-text-align="${typography.text_align}" data-vertical-align="${typography.vertical_align}" data-animation="${enterAnimation}" data-state="inactive" style="--body-weight:${appearance.body_weight};--heading-weight:${appearance.heading_weight};--body-line-height:${typography.line_height};--body-letter-spacing:${appearance.letter_spacing_em}em;--slide-body-scale:${typography.body_scale};--slide-heading-scale:${typography.heading_scale};--slide-paragraph-spacing:${typography.paragraph_spacing_em}em;--slide-column-gap:${typography.column_gap_em}em" hidden>
  ${content}
  <section class="narration" data-region="narration" data-display="${narrationDisplay}" data-placement="${narrationStyle.placement}" data-size="${narrationStyle.size}" data-text-align="${narrationStyle.text_align}" data-speaker-visible="${String(narrationStyle.speaker_visible)}" data-progress-visible="${String(narrationStyle.progress_visible)}" data-fit-content data-fit-id="narration" data-fit-region="narration"${narrationDisplay === "inline" ? " data-fit-scroll=\"true\"" : ""} data-active="${String(initialNarrationSegment !== undefined || narrationDisplay === "inline")}" style="--narration-text-scale:${narrationStyle.text_scale};--narration-max-lines:${narrationStyle.max_lines};${narrationVariables}" aria-live="off">
    <span class="narration-speaker"${narrationSpeaker === "" ? " hidden" : ""}>${escapeHtml(narrationSpeaker)}</span>
    <div class="narration-track">${narrationDisplay === "inline" ? inlineNarration : `<p class="narration-text">${escapeHtml(initialNarrationSegment?.text ?? "")}</p>`}</div>
    <span class="narration-inline-progress" aria-hidden="true"></span>
  </section>
</article>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="no-referrer">
  <meta name="description" content="${escapeHtml(project.document.summary || `${project.document.title}の最自由研究発表`)}">
  <meta name="theme-color" content="${escapeHtml(deck.accent)}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="最自由研究">
  <meta property="og:title" content="${escapeHtml(project.document.title)}">
  <meta property="og:description" content="${escapeHtml(project.document.summary || `${project.document.title}の最自由研究発表`)}">
  <meta name="twitter:card" content="summary">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-saijiyu-static'; script-src 'nonce-saijiyu-static'; media-src 'self' blob:; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors ${options.frameAncestors ?? "'none'"}">
  <title>${escapeHtml(project.document.title)}</title>
  <style nonce="saijiyu-static">
    :root { color-scheme: dark; --accent: ${escapeHtml(deck.accent)}; --stage-ratio: 16 / 9; --stage-width: 16; --stage-height: 9; --aspect-font-scale: 1; font-family: Inter, "Noto Sans JP", system-ui, sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; min-height: 100dvh; overflow: hidden; background: #090d14; color: #f8fafc; }
    button, input { font: inherit; }
    .sr-only { position: absolute !important; width: 1px !important; height: 1px !important; padding: 0 !important; margin: -1px !important; overflow: hidden !important; clip: rect(0, 0, 0, 0) !important; white-space: nowrap !important; border: 0 !important; }
    .app { width: 100%; min-width: 0; height: 100vh; height: 100dvh; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; gap: 10px; overflow: hidden; padding: calc(12px + env(safe-area-inset-top)) calc(12px + env(safe-area-inset-right)) calc(12px + env(safe-area-inset-bottom)) calc(12px + env(safe-area-inset-left)); }
    body[data-editor-frame="true"] .app { grid-template-rows: minmax(0, 1fr); gap: 0; padding: 0; }
    body[data-editor-frame="true"] header, body[data-editor-frame="true"] footer { display: none; }
    body[data-editor-frame="true"] .stage-wrap { grid-row: 1; }
    body[data-editor-frame="true"] .stage { width: 100%; height: 100%; border: 0; box-shadow: none; }
    header, footer { display: flex; min-width: 0; align-items: center; gap: 12px; min-height: 36px; color: #a9b5c7; }
    header strong { min-width: 0; overflow: hidden; color: #fff; text-overflow: ellipsis; white-space: nowrap; }
    header .time { display: flex; gap: .45em; margin-left: auto; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .timer-toggle { min-height: 28px; padding: .3em .65em; border-radius: 999px; color: #dce5f2; font-size: 11px; white-space: nowrap; }
    .pace { padding: .16em .48em; border: 1px solid #3a485d; border-radius: 999px; color: #b7c4d4; font-size: 11px; }
    .pace[data-state="over"] { border-color: #b55d38; background: #6b291d66; color: #ffd1b8; }
    .time-part { display: inline-flex; gap: .2em; }
    .time-label { color: #718096; font-size: .78em; }
    .stage-wrap { min-width: 0; min-height: 0; width: 100%; height: 100%; display: grid; place-items: center; container: presentation-space / size; }
    body[data-aspect-ratio="4:3"] { --stage-ratio: 4 / 3; --stage-width: 4; --stage-height: 3; --aspect-font-scale: 1.3333; }
    .stage { position: relative; width: min(100cqw, calc(100cqh * var(--stage-width) / var(--stage-height))); max-width: 100%; max-height: 100%; aspect-ratio: var(--stage-ratio); overflow: hidden; container: presentation-stage / size; border: 1px solid #334155; background: #111827; box-shadow: 0 18px 60px #0009; cursor: pointer; touch-action: pan-y; }
    .stage:focus-visible { outline: .2rem solid var(--accent); outline-offset: .18rem; }
    body[data-editor-frame="true"] .stage { cursor: default; }
    body[data-editor-frame="true"] :is(.canvas-block, .scene-node[data-positioned="true"]) { cursor: move; touch-action: none; user-select: none; }
    body[data-editor-frame="true"] :is(.canvas-block, .scene-node):hover { outline: max(2px, .18cqw) dashed color-mix(in srgb, var(--accent) 78%, white); outline-offset: max(1px, .1cqw); }
    body[data-editor-frame="true"] :is(.canvas-block, .scene-node)[data-editor-selected="true"] { outline: max(3px, .24cqw) solid var(--accent); outline-offset: max(1px, .12cqw); }
    body[data-editor-frame="true"] :is(.canvas-block, .scene-node)[data-editor-selected="true"]::after { content: ""; position: absolute; right: max(-7px, -.45cqw); bottom: max(-7px, -.45cqw); width: max(12px, .9cqw); height: max(12px, .9cqw); z-index: 1000; border: max(2px, .12cqw) solid white; border-radius: 2px; background: var(--accent); box-shadow: 0 0 0 1px #111827; cursor: nwse-resize; }
    body[data-editor-frame="true"][data-editor-grid="true"] .stage::after { content: ""; position: absolute; inset: 0; z-index: 10000; pointer-events: none; background-image: linear-gradient(to right, #8ecbff30 max(1px, .05cqw), transparent max(1px, .05cqw)), linear-gradient(to bottom, #8ecbff30 max(1px, .05cqw), transparent max(1px, .05cqw)); background-size: 5% 5%; }
    .slide { --template-font-scale: 1; --template-spacing: 1; --component-font-scale: 1; --fit-scale: 1; --body-weight: 400; --heading-weight: 800; --body-line-height: 1.5; --body-letter-spacing: 0; --slide-body-scale: 1; --slide-heading-scale: 1; --slide-paragraph-spacing: .65em; --slide-column-gap: 2.5em; --theme-background: #111827; --theme-surface: #05080dcc; --theme-foreground: #f8fafc; --theme-muted: #a9b5c7; --theme-border: #ffffff25; --density-scale: 1; --motion-duration: .4s; --motion-ease: cubic-bezier(.2,.8,.2,1); --slide-base: var(--theme-background); position: absolute; inset: 0; display: grid; grid-template: minmax(0, 1fr) auto / minmax(0, 1fr) minmax(0, 28%); overflow: hidden; background: var(--slide-base); color: var(--theme-foreground); font-family: var(--font-body, system-ui, sans-serif); font-weight: var(--body-weight); line-height: var(--body-line-height); letter-spacing: var(--body-letter-spacing); }
    .slide::before, .slide::after { content: ""; position: absolute; z-index: 0; pointer-events: none; }
    .slide > * { position: relative; z-index: 1; }
    .slide[data-user-template="true"] { --accent: var(--template-accent); --accent-secondary: var(--template-accent-secondary); --theme-background: var(--template-background); --theme-surface: var(--template-surface); --theme-foreground: var(--template-foreground); --theme-muted: var(--template-muted); --theme-border: var(--template-border); --slide-base: var(--theme-background); grid-template-columns: minmax(0, 1fr) var(--template-sidebar-width); border-radius: var(--template-radius); }
    .slide[data-user-template="true"] .slide-main { padding: calc(7% * var(--template-spacing)) calc(7% * var(--template-spacing)) calc(4% * var(--template-spacing)); }
    .slide[data-user-template="true"] .slide-sidebar { background: var(--theme-surface); color: var(--theme-muted); }
    .slide[data-density="spacious"] { --density-scale: 1.18; }
    .slide[data-density="compact"] { --density-scale: .82; }
    .slide[data-motion-style="calm"] { --motion-duration: .48s; --motion-ease: cubic-bezier(.22,.75,.2,1); }
    .slide[data-motion-style="snappy"] { --motion-duration: .24s; --motion-ease: cubic-bezier(.2,.9,.25,1); }
    .slide[data-motion-style="dramatic"] { --motion-duration: .62s; --motion-ease: cubic-bezier(.16,1,.3,1); }
    .slide[data-body-font="system-sans"] { --font-body: Inter, "Noto Sans JP", system-ui, sans-serif; }
    .slide[data-body-font="gothic"] { --font-body: "BIZ UDPGothic", "Yu Gothic", "Hiragino Kaku Gothic ProN", sans-serif; }
    .slide[data-body-font="rounded"] { --font-body: "M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", ui-rounded, sans-serif; }
    .slide[data-body-font="mincho"] { --font-body: "Noto Serif JP", "Yu Mincho", "Hiragino Mincho ProN", serif; }
    .slide[data-body-font="serif"] { --font-body: Georgia, "Noto Serif JP", "Yu Mincho", serif; }
    .slide[data-body-font="monospace"] { --font-body: "BIZ UDGothic", "SFMono-Regular", Consolas, monospace; }
    .slide[data-body-font="display"] { --font-body: "Arial Black", "Hiragino Kaku Gothic StdN", "Yu Gothic", sans-serif; }
    .slide[data-body-font="textbook"] { --font-body: "UD Digi Kyokasho N-R", "YuKyokasho", "Hiragino Mincho ProN", serif; }
    .slide[data-body-font="handwritten"] { --font-body: Klee, "Hannotate SC", "YuKyokasho", cursive; }
    .slide[data-body-font="condensed"] { --font-body: "Avenir Next Condensed", "Arial Narrow", "Hiragino Kaku Gothic ProN", sans-serif; }
    :is(.slide,.prelude)[data-heading-font="system-sans"] { --font-heading: Inter, "Noto Sans JP", system-ui, sans-serif; }
    :is(.slide,.prelude)[data-heading-font="gothic"] { --font-heading: "BIZ UDPGothic", "Yu Gothic", "Hiragino Kaku Gothic ProN", sans-serif; }
    :is(.slide,.prelude)[data-heading-font="rounded"] { --font-heading: "M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", ui-rounded, sans-serif; }
    :is(.slide,.prelude)[data-heading-font="mincho"] { --font-heading: "Noto Serif JP", "Yu Mincho", "Hiragino Mincho ProN", serif; }
    :is(.slide,.prelude)[data-heading-font="serif"] { --font-heading: Georgia, "Noto Serif JP", "Yu Mincho", serif; }
    :is(.slide,.prelude)[data-heading-font="monospace"] { --font-heading: "BIZ UDGothic", "SFMono-Regular", Consolas, monospace; }
    :is(.slide,.prelude)[data-heading-font="display"] { --font-heading: "Arial Black", "Hiragino Kaku Gothic StdN", "Yu Gothic", sans-serif; }
    :is(.slide,.prelude)[data-heading-font="textbook"] { --font-heading: "UD Digi Kyokasho N-R", "YuKyokasho", "Hiragino Mincho ProN", serif; }
    :is(.slide,.prelude)[data-heading-font="handwritten"] { --font-heading: Klee, "Hannotate SC", "YuKyokasho", cursive; }
    :is(.slide,.prelude)[data-heading-font="condensed"] { --font-heading: "Avenir Next Condensed", "Arial Narrow", "Hiragino Kaku Gothic ProN", sans-serif; }
    .slide[data-user-template="false"][data-visual-preset="paper"] { --theme-background: #f7f3ea; --theme-surface: #ebe5d8; --theme-foreground: #1d2735; --theme-muted: #596474; --theme-border: #23304433; --slide-base: var(--theme-background); }
    .slide[data-user-template="false"][data-visual-preset="editorial"] { --theme-background: #f2eadb; --theme-surface: #e5d8c3; --theme-foreground: #201b18; --theme-muted: #665b52; --theme-border: #4d332d40; --slide-base: var(--theme-background); }
    .slide[data-user-template="false"][data-visual-preset="neon"] { --theme-background: #09071b; --theme-surface: #161130dd; --theme-foreground: #f4f2ff; --theme-muted: #b7afd6; --theme-border: color-mix(in srgb, var(--accent) 52%, transparent); --slide-base: var(--theme-background); }
    .slide[data-user-template="false"][data-visual-preset="retro-game"] { --theme-background: #171a20; --theme-surface: #262b35; --theme-foreground: #fff7d6; --theme-muted: #cac2a0; --theme-border: #fff7d666; --slide-base: var(--theme-background); }
    .slide[data-user-template="false"][data-visual-preset="soft-pop"] { --theme-background: #f7edf5; --theme-surface: #fff8fdde; --theme-foreground: #34243a; --theme-muted: #745f7b; --theme-border: #704b7d33; --slide-base: var(--theme-background); }
    .slide[data-user-template="false"][data-visual-preset="scientific"] { --theme-background: #edf4f5; --theme-surface: #f8fcfcdd; --theme-foreground: #152c35; --theme-muted: #536e76; --theme-border: #1b596a33; --slide-base: var(--theme-background); }
    .slide[data-user-template="false"][data-visual-preset="museum"] { --theme-background: #f4efe2; --theme-surface: #18283d; --theme-foreground: #1b293c; --theme-muted: #f2e6ca; --theme-border: #a57b3455; --slide-base: var(--theme-background); }
    .slide[data-user-template="false"][data-visual-preset="terminal"] { --theme-background: #07110b; --theme-surface: #0c1e13; --theme-foreground: #d8ffe5; --theme-muted: #8bc99d; --theme-border: #54f58a55; --slide-base: var(--theme-background); }
    .slide[data-visual-preset="studio"] { background: radial-gradient(circle at 85% 12%, color-mix(in srgb, var(--accent) 22%, transparent), transparent 38%), var(--slide-base); }
    .slide[data-visual-preset="paper"] { background: linear-gradient(100deg, #00000008 1px, transparent 1px), var(--slide-base); background-size: 3.5cqw 100%; }
    .slide[data-visual-preset="editorial"]::before { inset: 7% auto 7% 4%; width: .35cqw; background: var(--accent); }
    .slide[data-visual-preset="editorial"]::after { right: 4%; top: 5%; width: 15cqw; height: 15cqw; border: .12cqw solid var(--theme-border); border-radius: 50%; }
    .slide[data-visual-preset="neon"] { background: radial-gradient(circle at 12% 88%, color-mix(in srgb, var(--accent) 25%, transparent), transparent 34%), linear-gradient(145deg, transparent 55%, #6f4cff12), var(--slide-base); }
    .slide[data-visual-preset="neon"]::after { inset: 2.4%; border: .1cqw solid var(--theme-border); box-shadow: inset 0 0 3cqw color-mix(in srgb, var(--accent) 10%, transparent); }
    .slide[data-visual-preset="retro-game"] { image-rendering: pixelated; }
    .slide[data-visual-preset="retro-game"]::after { inset: 1.8%; border: .35cqw double var(--theme-border); box-shadow: .35cqw .35cqw 0 #0008; }
    .slide[data-visual-preset="retro-game"] :is(h1,h2,h3,h4,strong) { letter-spacing: .025em; text-shadow: .12cqw .12cqw 0 #0008; }
    .slide[data-visual-preset="soft-pop"] { background: radial-gradient(circle at 8% 10%, color-mix(in srgb, var(--accent) 22%, white), transparent 24%), radial-gradient(circle at 92% 88%, #91ddff55, transparent 25%), var(--slide-base); }
    .slide[data-visual-preset="soft-pop"] :is(uf-card,uf-callout,.narration,.slide-sidebar) { border-radius: 2.3cqw; }
    .slide[data-visual-preset="scientific"] { background: linear-gradient(var(--theme-border) .08cqw, transparent .08cqw), linear-gradient(90deg, var(--theme-border) .08cqw, transparent .08cqw), var(--slide-base); background-size: 3.2cqw 3.2cqw; }
    .slide[data-visual-preset="scientific"]::after { inset: 3%; border: .1cqw solid var(--theme-border); }
    .slide[data-visual-preset="museum"]::before { inset: 5% 4% auto; height: .12cqw; background: linear-gradient(90deg, var(--accent), transparent 72%); }
    .slide[data-visual-preset="museum"]::after { right: 4%; bottom: 4%; width: 9cqw; height: 9cqw; border: .12cqw solid var(--theme-border); transform: rotate(45deg); }
    .slide[data-visual-preset="terminal"] { background: repeating-linear-gradient(0deg, transparent 0 .34cqw, #54f58a08 .34cqw .42cqw), radial-gradient(circle at 90% 8%, #54f58a18, transparent 32%), var(--slide-base); }
    .slide[data-visual-preset="terminal"]::after { inset: 2%; border: .12cqw solid var(--theme-border); border-radius: .3cqw; box-shadow: inset 0 0 2.4cqw #54f58a0d; }
    .slide[data-region-layout="single"] { grid-template-columns: 1fr; }
    .slide[data-region-layout="single"] .slide-sidebar { display: none; }
    .slide[data-region-layout="sidebar-left"] { grid-template-columns: var(--template-sidebar-width, 28%) minmax(0, 1fr); }
    .slide[data-region-layout="sidebar-left"] .slide-main { grid-column: 2; grid-row: 1; }
    .slide[data-region-layout="sidebar-left"] .slide-sidebar { grid-column: 1; grid-row: 1; border-left: 0; border-right: 1px solid #ffffff25; }
    .slide[data-region-layout="lower-third"] { grid-template: minmax(0, 1fr) auto auto / 1fr; }
    .slide[data-region-layout="lower-third"] .slide-sidebar { grid-row: 2; padding: 2% 6%; border-top: 1px solid #ffffff25; border-left: 0; }
    .slide[data-region-layout="split"] { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
    .slide[data-region-layout="split"] .slide-sidebar { padding: calc(7% * var(--density-scale)); }
    .slide[data-region-layout="top-band"] { grid-template: auto minmax(0, 1fr) auto / 1fr; }
    .slide[data-region-layout="top-band"] .slide-sidebar { grid-row: 1; padding: 2.5% 6%; border: 0; border-bottom: max(1px, .07cqw) solid var(--theme-border); }
    .slide[data-region-layout="top-band"] .slide-main { grid-row: 2; }
    .slide[data-region-layout="focus"] { grid-template-columns: 1fr; }
    .slide[data-region-layout="focus"] .slide-sidebar { display: none; }
    .slide[data-region-layout="focus"] .slide-main { width: min(82%, 72rem); place-self: center; }
    .slide[data-slide-role="cover"][data-composition="flow"] .eyebrow { color: var(--accent); }
    .slide[data-slide-role="cover"][data-composition="flow"] .slide-content > :is(h2,h3,h4):first-child { font-size: calc(7.4cqw * var(--aspect-font-scale) * var(--template-font-scale) * var(--fit-scale)); line-height: .96; letter-spacing: -.055em; text-wrap: balance; }
    .slide[data-slide-role="cover"][data-cover-layout="center"] .slide-main { display: grid; align-content: center; justify-items: center; text-align: center; }
    .slide[data-slide-role="cover"][data-cover-layout="center"] .slide-content { max-width: 82%; }
    .slide[data-slide-role="cover"][data-cover-layout="split"] .slide-main { width: 62%; display: grid; align-content: end; padding-bottom: 8%; }
    .slide[data-slide-role="cover"][data-cover-layout="split"]::after { right: 0; top: 0; width: 34%; height: 100%; background: linear-gradient(155deg, var(--accent), var(--accent-secondary, var(--accent))); }
    .slide[data-slide-role="cover"][data-cover-layout="poster"] .slide-main { display: grid; align-content: end; padding: 7%; background: linear-gradient(0deg, #000c, transparent 62%); }
    .slide[data-slide-role="cover"][data-cover-layout="poster"] .slide-content > :is(h2,h3,h4):first-child { max-width: 12ch; font-size: calc(9cqw * var(--aspect-font-scale) * var(--template-font-scale) * var(--fit-scale)); text-transform: uppercase; }
    .slide[data-slide-role="cover"][data-cover-layout="minimal"] .slide-main { display: grid; align-content: center; padding-inline: 14%; }
    .slide[data-slide-role="cover"][data-cover-layout="minimal"] .slide-content > :is(h2,h3,h4):first-child { font-size: calc(5.7cqw * var(--aspect-font-scale) * var(--template-font-scale) * var(--fit-scale)); font-weight: 600; letter-spacing: -.035em; }
    .slide[data-slide-role="cover"][data-cover-layout="statement"] .slide-main { display: grid; align-content: center; padding: 6%; }
    .slide[data-slide-role="cover"][data-cover-layout="statement"] .slide-content > :is(h2,h3,h4):first-child { max-width: 18ch; font-size: calc(8.2cqw * var(--aspect-font-scale) * var(--template-font-scale) * var(--fit-scale)); color: var(--accent); }
    .slide[data-slide-role="cover"][data-cover-layout="band"] .slide-main { display: grid; align-content: center; padding: 0; }
    .slide[data-slide-role="cover"][data-cover-layout="band"] .slide-content { width: 100%; padding: 4.5% 7%; border-block: max(1px, .1cqw) solid var(--theme-border); background: color-mix(in srgb, var(--theme-surface) 92%, transparent); text-align: center; backdrop-filter: blur(18px); }
    .slide[data-slide-role="cover"][data-cover-layout="corner"] .slide-main { display: grid; align-content: end; padding: 7%; }
    .slide[data-slide-role="cover"][data-cover-layout="corner"] .slide-content { max-width: 72%; padding-left: 3.2%; border-left: .7cqw solid var(--accent); }
    .slide[data-slide-role="cover"][data-cover-layout="corner"] .slide-content > :is(h2,h3,h4):first-child { max-width: 13ch; font-size: calc(8cqw * var(--aspect-font-scale) * var(--template-font-scale) * var(--fit-scale)); }
    .slide[data-slide-role="cover"][data-cover-layout="frame"] .slide-main { display: grid; align-content: center; justify-items: center; margin: 5%; padding: 6%; border: max(2px, .18cqw) solid var(--accent); text-align: center; }
    .slide[data-slide-role="cover"][data-cover-layout="frame"] .slide-content { max-width: 82%; }
    :is(.slide-content,.slide-sidebar,uf-markdown,uf-card) table { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: calc(1.35cqw * var(--aspect-font-scale) * var(--template-font-scale) * var(--component-font-scale) * var(--fit-scale)); line-height: 1.4; }
    :is(.slide-content,.slide-sidebar,uf-markdown,uf-card) :is(th,td) { padding: .55em .7em; border: max(1px, .06cqw) solid var(--theme-border); overflow-wrap: anywhere; vertical-align: top; }
    :is(.slide-content,.slide-sidebar,uf-markdown,uf-card) th { background: color-mix(in srgb, var(--accent) 18%, var(--theme-surface)); color: var(--theme-foreground); font-weight: 850; }
    :is(.slide-content,.slide-sidebar,uf-markdown,uf-card) .align-center { text-align: center; }
    :is(.slide-content,.slide-sidebar,uf-markdown,uf-card) .align-right { text-align: right; }
    .slide[data-composition="canvas"], .slide[data-composition="scene"] { --slide-base: var(--canvas-background); grid-template: minmax(0, 1fr) auto / 1fr; overflow: var(--canvas-overflow); }
    .slide-canvas { position: relative; min-width: 0; min-height: 0; grid-row: 1; grid-column: 1; overflow: var(--canvas-overflow); }
    .slide-scene { position: relative; min-width: 0; min-height: 0; grid-row: 1; grid-column: 1; padding: calc(6% * var(--density-scale)); overflow: var(--canvas-overflow); }
    .slide-scene > .scene-node:not([data-positioned="true"]) { width: 100%; height: 100%; }
    .scene-node { min-width: 0; min-height: 0; max-width: 100%; overflow: visible; }
    .reveal-block.scene-node.is-visible { opacity: var(--component-opacity); }
    uf-layer, uf-stack, uf-grid, uf-hero, uf-markdown, uf-image, uf-shape, uf-card, uf-metric, uf-quote, uf-callout, uf-bar-chart, uf-timeline, uf-bar-row, uf-timeline-item { box-sizing: border-box; }
    uf-stack > .scene-node, uf-grid > .scene-node { min-height: 0; }
    uf-hero { gap: .45cqh; justify-content: center; }
    uf-hero[data-align="center"] { align-items: center; text-align: center; }
    uf-hero[data-align="end"] { align-items: flex-end; text-align: end; }
    :is(uf-hero,uf-markdown,uf-card,uf-metric,uf-quote,uf-callout,uf-bar-chart,uf-timeline)[data-fit-content], uf-image small[data-fit-content], uf-shape span[data-fit-content] { --fit-scale: 1; }
    uf-hero h2 { max-width: 16ch; margin: 0; font-family: var(--font-heading); font-size: calc(7.1cqw * var(--aspect-font-scale) * var(--template-font-scale) * var(--component-font-scale) * var(--fit-scale)); font-weight: var(--heading-weight); line-height: .96; letter-spacing: -.055em; text-wrap: balance; overflow-wrap: anywhere; }
    uf-hero[data-compact-heading="true"] h2 { max-width: none; white-space: nowrap; text-wrap: nowrap; }
    .component-eyebrow, .component-label { margin: 0; color: var(--accent); font: 850 calc(1.05cqw * var(--aspect-font-scale) * var(--template-font-scale) * var(--component-font-scale) * var(--fit-scale))/1.2 ui-monospace, monospace; letter-spacing: .14em; text-transform: uppercase; }
    .component-subtitle { max-width: 48rem; margin: 0; color: color-mix(in srgb, currentColor 68%, transparent); font-size: calc(1.8cqw * var(--aspect-font-scale) * var(--template-font-scale) * var(--component-font-scale) * var(--fit-scale)); line-height: var(--body-line-height); overflow-wrap: anywhere; }
    uf-markdown h2, uf-markdown h3, uf-markdown h4, uf-card h2, uf-card h3, uf-card h4 { margin: 0 0 .45em; font-family: var(--font-heading); font-size: calc(3.7cqw * var(--aspect-font-scale) * var(--template-font-scale) * var(--component-font-scale) * var(--fit-scale)); font-weight: var(--heading-weight); line-height: 1.05; overflow-wrap: anywhere; }
    uf-markdown p, uf-markdown li, uf-card p, uf-card li, uf-callout p { margin: 0; font-size: calc(1.55cqw * var(--aspect-font-scale) * var(--template-font-scale) * var(--component-font-scale) * var(--fit-scale)); line-height: var(--body-line-height); overflow-wrap: anywhere; }
    uf-card, uf-callout { gap: calc(.55em * var(--fit-scale)); padding: calc(2.1cqw * var(--density-scale) * var(--fit-scale)); border: max(1px, .07cqw) solid var(--theme-border); border-radius: 1.8cqw; background: var(--theme-surface); backdrop-filter: blur(18px); }
    uf-card[data-variant="accent"] { border-color: color-mix(in srgb, var(--accent) 70%, transparent); background: color-mix(in srgb, var(--accent) 18%, transparent); }
    uf-card[data-variant="glass"] { background: #ffffff14; box-shadow: 0 18px 55px #0005; }
    uf-metric { justify-content: center; gap: .5em; padding: calc(1.8cqw * var(--density-scale)); }
    uf-metric p { display: flex; align-items: baseline; gap: .3em; margin: 0; }
    uf-metric strong { font: 900 calc(6.4cqw * var(--aspect-font-scale) * var(--template-font-scale) * var(--component-font-scale) * var(--fit-scale))/.9 ui-monospace, monospace; letter-spacing: -.07em; }
    uf-metric span { color: var(--accent); font-size: calc(1.8cqw * var(--aspect-font-scale) * var(--template-font-scale) * var(--component-font-scale) * var(--fit-scale)); font-weight: 850; }
    uf-metric small { color: color-mix(in srgb, currentColor 62%, transparent); font-size: calc(1.3cqw * var(--aspect-font-scale) * var(--template-font-scale) * var(--component-font-scale) * var(--fit-scale)); }
    uf-metric[data-emphasis="signal"] { color: #17120a; background: var(--accent); }
    uf-quote { justify-content: center; gap: 1em; padding-left: 6%; border-left: .65cqw solid var(--accent); }
    uf-quote blockquote { margin: 0; font-family: var(--font-heading); font-size: calc(3.8cqw * var(--aspect-font-scale) * var(--template-font-scale) * var(--component-font-scale) * var(--fit-scale)); font-weight: var(--heading-weight); line-height: 1.2; text-wrap: balance; overflow-wrap: anywhere; }
    uf-quote cite { color: color-mix(in srgb, currentColor 60%, transparent); font-style: normal; }
    uf-callout[data-variant="success"] { --callout-color: #62e6ad; }
    uf-callout[data-variant="warning"] { --callout-color: #ffd166; }
    uf-callout[data-variant="danger"] { --callout-color: #ff786f; }
    uf-callout { border-left: .35cqw solid var(--callout-color, #65ccff); }
    uf-callout h3 { margin: 0; font-family: var(--font-heading); font-size: calc(2.5cqw * var(--aspect-font-scale) * var(--template-font-scale) * var(--component-font-scale) * var(--fit-scale)); font-weight: var(--heading-weight); overflow-wrap: anywhere; }
    uf-image { gap: .5em; margin: 0; }
    uf-image { overflow: hidden; }
    uf-image img { display: block; width: 100%; height: 100%; min-height: 0; flex: 1; border-radius: inherit; }
    uf-image img[data-fit="contain"] { object-fit: contain; }
    uf-image img[data-fit="cover"] { object-fit: cover; }
    uf-image img[data-fit="fill"] { object-fit: fill; }
    uf-image small { color: color-mix(in srgb, currentColor 62%, transparent); font-size: calc(1cqw * var(--aspect-font-scale) * var(--template-font-scale) * var(--component-font-scale) * var(--fit-scale)); overflow-wrap: anywhere; }
    uf-shape[data-shape="ellipse"] { border-radius: 50%; }
    uf-shape[data-shape="line"] { height: 0 !important; min-height: 0; border-width: 0 0 2px !important; overflow: visible; }
    uf-shape span { margin: auto; font-size: calc(1.65cqw * var(--aspect-font-scale) * var(--template-font-scale) * var(--component-font-scale) * var(--fit-scale)); overflow-wrap: anywhere; }
    uf-bar-chart { justify-content: center; gap: 1.35cqh; }
    uf-bar-row { display: grid; grid-template-columns: minmax(5em, 22%) 1fr auto; align-items: center; gap: 1em; }
    uf-bar-row span, uf-bar-row strong { font: 750 calc(1.35cqw * var(--aspect-font-scale) * var(--template-font-scale) * var(--component-font-scale) * var(--fit-scale))/1.2 ui-monospace, monospace; overflow-wrap: anywhere; }
    uf-bar-row i { height: 1.65cqh; border-radius: 99px; background: linear-gradient(90deg, var(--bar-color) var(--bar-width), #ffffff15 var(--bar-width)); box-shadow: 0 0 1.8cqw color-mix(in srgb, var(--bar-color) 28%, transparent); }
    uf-timeline { justify-content: center; gap: 1.35cqh; }
    uf-timeline-item { display: grid; grid-template-columns: minmax(4em, 16%) minmax(0, 1fr); gap: .2em 1.3em; padding-left: 1em; border-left: 3px solid var(--accent); }
    uf-timeline-item small { grid-row: 1 / 3; color: var(--accent); font: 800 calc(1cqw * var(--aspect-font-scale) * var(--template-font-scale) * var(--component-font-scale) * var(--fit-scale))/1.4 ui-monospace, monospace; }
    uf-timeline-item strong { font-family: var(--font-heading); font-size: calc(1.65cqw * var(--aspect-font-scale) * var(--template-font-scale) * var(--component-font-scale) * var(--fit-scale)); font-weight: var(--heading-weight); overflow-wrap: anywhere; }
    uf-timeline-item p { margin: 0; color: color-mix(in srgb, currentColor 64%, transparent); font-size: calc(1.1cqw * var(--aspect-font-scale) * var(--template-font-scale) * var(--component-font-scale) * var(--fit-scale)); overflow-wrap: anywhere; }
    .canvas-block { --fit-scale: 1; position: absolute; display: flex; flex-direction: column; justify-content: flex-start; min-width: 0; min-height: 0; margin: 0; overflow: var(--canvas-overflow); }
    .canvas-block > * { width: 100%; }
    .reveal-block.canvas-block.is-visible { opacity: var(--component-opacity); }
    .canvas-block h2, .canvas-block h3, .canvas-block h4 { margin: 0 0 .35em; font-family: var(--font-heading); line-height: 1.08; font-size: calc(3.55cqw * var(--aspect-font-scale) * var(--template-font-scale) * var(--component-font-scale) * var(--fit-scale)); font-weight: var(--heading-weight); overflow-wrap: anywhere; }
    .canvas-block p, .canvas-block li { margin: 0; font-size: calc(1.7cqw * var(--aspect-font-scale) * var(--template-font-scale) * var(--component-font-scale) * var(--fit-scale)); line-height: var(--body-line-height); overflow-wrap: anywhere; }
    .canvas-block p + p { margin-top: .55em; }
    .canvas-block ul { margin: 0; padding-left: 1.25em; }
    figure.canvas-block img { display: block; width: 100%; height: 100%; }
    figure.canvas-block img[data-fit="contain"] { object-fit: contain; }
    figure.canvas-block img[data-fit="cover"] { object-fit: cover; }
    figure.canvas-block img[data-fit="fill"] { object-fit: fill; }
    .canvas-block[data-shape="ellipse"] { border-radius: 50%; }
    .canvas-block[data-shape="line"] { height: 0 !important; min-height: 0; border-width: 0 0 2px !important; border-radius: 0; overflow: visible; }
    .canvas-block[data-shape] span { margin: auto; font-size: calc(1.5cqw * var(--aspect-font-scale) * var(--template-font-scale) * var(--component-font-scale) * var(--fit-scale)); line-height: 1.3; overflow-wrap: anywhere; }
    .slide[hidden] { display: none; }
    .slide-main { --fit-scale: 1; min-width: 0; min-height: 0; padding: calc(7% * var(--density-scale)) calc(7% * var(--density-scale)) calc(4% * var(--density-scale)); overflow: hidden; }
    .slide[data-composition="flow"][data-vertical-align="center"] .slide-main { display: flex; flex-direction: column; justify-content: center; }
    .slide[data-composition="flow"][data-text-align="center"] .slide-main { text-align: center; }
    .slide[data-composition="flow"][data-text-preset="article"] .slide-main,
    .slide[data-composition="flow"][data-text-preset="columns"] .slide-main,
    .slide[data-composition="flow"][data-text-preset="dense"] .slide-main { padding: calc(4.5% * var(--density-scale)) calc(5.5% * var(--density-scale)) calc(3.5% * var(--density-scale)); }
    .slide-sidebar { --fit-scale: 1; min-width: 0; min-height: 0; padding: calc(9% * var(--density-scale)) calc(8% * var(--density-scale)); border-left: max(1px, .07cqw) solid var(--theme-border); background: var(--theme-surface); color: var(--theme-muted); overflow: hidden; }
    .slide-sidebar[hidden] { display: none; }
    .slide:has(.slide-sidebar[hidden]) { grid-template-columns: 1fr; }
    .narration { --fit-scale: 1; grid-column: 1 / -1; display: grid; grid-template: auto 1fr auto / minmax(0, 1fr); gap: .55cqh; min-width: 0; min-height: 0; max-height: 29cqh; padding: calc(1.8cqh * var(--density-scale)) 5%; border-top: max(1px, .07cqw) solid var(--narration-custom-border, var(--theme-border)); border-radius: var(--narration-custom-radius, 0); background: var(--narration-custom-background, color-mix(in srgb, var(--theme-surface) 94%, transparent)); color: var(--narration-custom-foreground, var(--theme-foreground)); font-size: calc(1.75cqw * var(--aspect-font-scale) * var(--template-font-scale) * var(--narration-text-scale) * var(--fit-scale)); line-height: 1.45; text-align: start; overflow: hidden; }
    .narration[data-active="false"]:not([data-display="inline"]) { display: none; }
    .narration[data-size="compact"] { max-height: 15cqh; padding-block: 1.05cqh; font-size: calc(1.35cqw * var(--aspect-font-scale) * var(--template-font-scale) * var(--narration-text-scale) * var(--fit-scale)); }
    .narration[data-size="large"] { max-height: 34cqh; padding-block: 2.2cqh; font-size: calc(2.15cqw * var(--aspect-font-scale) * var(--template-font-scale) * var(--narration-text-scale) * var(--fit-scale)); }
    .narration[data-text-align="center"] { text-align: center; }
    .narration[data-placement="overlay-bottom"] { position: absolute; z-index: 30; right: 4%; bottom: 3%; left: 4%; width: auto; max-height: 30%; border: max(1px, .07cqw) solid var(--theme-border); border-radius: 1.2cqw; box-shadow: 0 1.1cqw 3cqw #0008; }
    .narration[data-placement="sidebar"] { position: absolute; z-index: 30; top: 5%; right: 3%; bottom: 5%; width: min(36%, 34cqw); max-height: none; border: max(1px, .07cqw) solid var(--theme-border); border-radius: 1.1cqw; }
    .narration-speaker { justify-self: start; max-width: 80%; padding: .35cqh .8cqw; border-radius: .4cqw; background: var(--narration-custom-accent, var(--accent)); color: #10131a; font-size: .68em; font-weight: 850; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .narration[data-speaker-visible="false"] .narration-speaker, .narration-speaker[hidden] { display: none; }
    .narration-track { min-width: 0; min-height: 0; overflow: hidden; }
    .narration-text { display: -webkit-box; margin: 0; overflow: hidden; overflow-wrap: anywhere; -webkit-box-orient: vertical; -webkit-line-clamp: var(--narration-max-lines); }
    .narration-inline-progress { align-self: end; display: block; width: 0; height: .32cqh; border-radius: 99px; background: var(--narration-custom-accent, var(--accent)); transition: width .15s linear; }
    .narration[data-progress-visible="false"] .narration-inline-progress { display: none; }
    .narration[data-display="dialogue"] { margin: 0 4% 3%; border: max(1px, .07cqw) solid var(--narration-custom-border, var(--theme-border)); border-radius: var(--narration-custom-radius, 1.1cqw); background: var(--narration-custom-background, linear-gradient(135deg, color-mix(in srgb, var(--theme-surface) 96%, #08111f), var(--theme-surface))); box-shadow: 0 .8cqw 2.3cqw #0007, inset 0 1px #ffffff16; }
    .narration[data-display="commentary"] { max-height: 19cqh; padding-block: 1.35cqh; border-top-color: color-mix(in srgb, var(--accent) 45%, transparent); text-align: center; font-weight: 800; text-shadow: 0 .15cqw .7cqw #000; }
    .narration[data-display="subtitle"] { max-height: 16cqh; margin: 0 9% 2.5%; border: 0; border-radius: var(--narration-custom-radius, .6cqw); background: var(--narration-custom-background, #000c); text-align: center; font-weight: 750; text-shadow: 0 .12cqw .45cqw #000; }
    .narration[data-display="minimal"] { justify-self: center; width: fit-content; max-width: 82%; max-height: 13cqh; margin-bottom: 2.5%; padding: .8cqh 1.4cqw; border: 0; border-radius: var(--narration-custom-radius, 99px); background: var(--narration-custom-background, #000a); text-align: center; }
    .narration[data-display="inline"] { max-height: 25cqh; padding-block: 1.1cqh; border-top-color: var(--narration-custom-border, #cbd5e1); background: var(--narration-custom-background, #f8fafcee); color: var(--narration-custom-foreground, #172033); font-size: calc(1.1cqw * var(--aspect-font-scale) * var(--template-font-scale) * var(--narration-text-scale) * var(--fit-scale)); }
    .narration[data-display="inline"] .narration-track { display: grid; gap: .32em; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; }
    .narration-segment { opacity: .34; transition: opacity var(--motion-duration) var(--motion-ease), translate var(--motion-duration) var(--motion-ease); overflow-wrap: anywhere; }
    .narration-segment.is-current { opacity: 1; padding-inline-start: .6em; box-shadow: inset .24em 0 var(--narration-custom-accent, var(--accent)); font-weight: 800; }
    .eyebrow { margin: 0 0 4%; color: var(--accent); font-size: calc(1cqw * var(--aspect-font-scale) * var(--template-font-scale) * var(--slide-heading-scale) * var(--fit-scale)); font-weight: 800; letter-spacing: .16em; text-transform: uppercase; }
    .slide-content { min-width: 0; column-gap: var(--slide-column-gap); column-fill: balance; }
    .slide-content[data-columns="2"] { column-count: 2; }
    .slide-content[data-columns="3"] { column-count: 3; }
    .slide-content > :is(h2,h3,h4,table,figure) { break-inside: avoid; }
    .slide-content :is(p,li) { orphans: 2; widows: 2; }
    .slide-content h2, .slide-content h3, .slide-content h4 { margin: 0 0 .5em; break-after: avoid; font-family: var(--font-heading); line-height: 1.12; font-size: calc(4.4cqw * var(--aspect-font-scale) * var(--template-font-scale) * var(--slide-heading-scale) * var(--fit-scale)); font-weight: var(--heading-weight); overflow-wrap: anywhere; }
    .slide-content h3 { font-size: calc(3.1cqw * var(--aspect-font-scale) * var(--template-font-scale) * var(--slide-heading-scale) * var(--fit-scale)); }
    .slide-content h4 { font-size: calc(2.35cqw * var(--aspect-font-scale) * var(--template-font-scale) * var(--slide-heading-scale) * var(--fit-scale)); }
    .slide-content p, .slide-content li { font-size: calc(2.05cqw * var(--aspect-font-scale) * var(--template-font-scale) * var(--slide-body-scale) * var(--fit-scale)); line-height: var(--body-line-height); overflow-wrap: anywhere; }
    .slide-content p { margin: 0 0 var(--slide-paragraph-spacing); }
    .slide-content ul { margin: 0 0 var(--slide-paragraph-spacing); padding-left: 1.3em; }
    .slide-content li + li { margin-top: calc(var(--slide-paragraph-spacing) * .45); }
    .reveal-block { opacity: 0; transition: opacity var(--motion-duration) var(--motion-ease), translate var(--motion-duration) var(--motion-ease), scale var(--motion-duration) var(--motion-ease), filter var(--motion-duration) var(--motion-ease), clip-path var(--motion-duration) var(--motion-ease); }
    .reveal-block.is-visible { opacity: 1; translate: 0 0; }
    .reveal-block[data-animation="none"] { transition: none; translate: none; }
    .reveal-block[data-animation="rise"] { translate: 0 1.8cqh; }
    .reveal-block[data-animation="rise"].is-visible { translate: 0 0; }
    .reveal-block[data-animation="zoom"] { scale: .92; translate: none; }
    .reveal-block[data-animation="zoom"].is-visible { scale: 1; }
    .reveal-block[data-animation="pop"] { scale: .78; translate: none; }
    .reveal-block[data-animation="pop"].is-visible { scale: 1; }
    .reveal-block[data-animation="slide-left"] { translate: 3cqw 0; }
    .reveal-block[data-animation="slide-right"] { translate: -3cqw 0; }
    .reveal-block[data-animation="slide-left"].is-visible, .reveal-block[data-animation="slide-right"].is-visible { translate: 0; }
    .reveal-block[data-animation="blur"] { filter: blur(1.1cqw); translate: none; }
    .reveal-block[data-animation="blur"].is-visible { filter: blur(0); }
    .reveal-block[data-animation="wipe"] { clip-path: inset(0 100% 0 0); translate: none; }
    .reveal-block[data-animation="wipe"].is-visible { clip-path: inset(0); }
    .stage[data-measuring="true"] .reveal-block { transition: none !important; translate: 0 0 !important; scale: 1 !important; filter: none !important; clip-path: inset(0) !important; }
    .stage[data-measuring="true"] .reveal-block.is-visible { opacity: var(--component-opacity, 1) !important; }
    .stage[data-measuring="true"] .reveal-block:not(.is-visible) { opacity: 0 !important; }
    .reveal-block p, .reveal-block li { font-size: calc(1.65cqw * var(--aspect-font-scale) * var(--template-font-scale) * var(--slide-body-scale) * var(--fit-scale)); line-height: var(--body-line-height); overflow-wrap: anywhere; }
    .slide-sidebar h2, .slide-sidebar h3, .slide-sidebar h4 { color: var(--accent); }
    .slide-sidebar p, .slide-sidebar li { font-size: calc(1.1cqw * var(--aspect-font-scale) * var(--template-font-scale) * var(--fit-scale)); line-height: var(--body-line-height); overflow-wrap: anywhere; }
    .slide[data-composition="flow"].tone-light { background: #f6f1e8; color: #162033; }
    .slide[data-composition="flow"].tone-quiet { background: #e9eef5; color: #162033; }
    .slide[data-composition="flow"].tone-signal { background: var(--accent); color: #10131a; }
    [data-layout="minimal"] .stage { background: white; }
    [data-layout="minimal"] .slide[data-user-template="false"][data-composition="flow"] { background: var(--theme-background); color: var(--theme-foreground); }
    [data-layout="minimal"] .slide[data-user-template="false"] .slide-sidebar { background: var(--theme-surface); color: var(--theme-foreground); border-color: var(--theme-border); }
    [data-layout="cinematic"] .slide-sidebar { display: none; }
    [data-layout="cinematic"] .slide { grid-template-columns: 1fr; }
    .prelude { position: absolute; inset: 0; z-index: 20; display: grid; place-items: center; overflow: hidden; background: #080d15; color: #f8fafc; }
    .prelude[hidden] { display: none; }
    .prelude-inner { --prelude-fit-scale: 1; position: relative; z-index: 1; display: grid; width: min(78%, 48rem); max-height: 88%; justify-items: center; gap: calc(1.4cqh * var(--prelude-fit-scale)); text-align: center; }
    .prelude-kicker { margin: 0; color: color-mix(in srgb, var(--accent) 62%, white); font: 850 calc(1.1cqw * var(--aspect-font-scale) * var(--prelude-fit-scale))/1.2 ui-monospace, monospace; letter-spacing: .18em; text-transform: uppercase; }
    .prelude h1 { max-width: 16ch; margin: 0; font-family: var(--font-heading, system-ui, sans-serif); font-size: calc(5.8cqw * var(--aspect-font-scale) * var(--prelude-fit-scale)); line-height: .98; letter-spacing: -.05em; text-wrap: balance; overflow-wrap: anywhere; }
    .prelude-message { margin: 0; color: #b9c6d6; font-size: calc(1.35cqw * var(--aspect-font-scale) * var(--prelude-fit-scale)); }
    .prelude-meter { width: min(100%, 32rem); height: .55cqh; overflow: hidden; border-radius: 99px; background: #ffffff18; }
    .prelude-meter i { display: block; width: 0; height: 100%; background: linear-gradient(90deg, var(--accent), #65ccff); transition: width .2s ease; }
    .prelude-status { min-height: 1.5em; margin: 0; color: #8fa0b5; font: 700 calc(1cqw * var(--aspect-font-scale) * var(--prelude-fit-scale))/1.4 ui-monospace, monospace; }
    .prelude-help { margin: .35cqh 0 0; color: #a8b6c8; font-size: calc(1cqw * var(--aspect-font-scale) * var(--prelude-fit-scale)); }
    .prelude-start { min-width: 10em; padding: .8em 1.4em; border-color: color-mix(in srgb, var(--accent) 70%, white); background: var(--accent); color: var(--prelude-accent-foreground); font-weight: 850; }
    .prelude-start:disabled { cursor: wait; opacity: .45; }
    .voice-unlock, .presentation-resume { position: absolute; z-index: 45; left: 50%; bottom: 4%; translate: -50% 0; min-width: 12em; padding: .75em 1.1em; border-color: color-mix(in srgb, var(--accent) 70%, white); background: #101827ee; box-shadow: 0 1em 3em #0009; font-weight: 850; }
    .voice-unlock[hidden], .presentation-resume[hidden] { display: none; }
    body[data-resume-pending="true"] .stage::after { content: ""; position: absolute; z-index: 44; inset: 0; background: #02061799; backdrop-filter: blur(2px); }
    .completion { position: absolute; z-index: 50; inset: 0; display: grid; place-items: center; padding: 8%; background: #05080dcc; backdrop-filter: blur(.45cqw); }
    .completion[hidden] { display: none; }
    .completion-card { width: min(34em, 78%); max-height: 90%; overflow: auto; padding: 2.4em; border: 1px solid color-mix(in srgb, var(--accent) 55%, #ffffff33); border-radius: 1.2em; background: #101827f2; box-shadow: 0 1.5em 5em #000b; text-align: center; }
    .completion-card h2 { margin: 0 0 .35em; color: #fff; font-size: clamp(1.4rem, 3.2cqw, 2.7rem); }
    .completion-card p { margin: 0 0 1.4em; color: #b7c2d2; }
    .completion-time { display: grid; gap: .25em; margin: 1em 0 1.4em; color: #dbe5f1; font-variant-numeric: tabular-nums; }
    .completion-time strong { color: #fff; font-size: 1.25em; }
    .completion-time small { color: #9fb0c3; }
    .completion-time[data-state="over"] small { color: #ffc6a8; }
    .completion-credit { margin: 0 0 1.2em; color: #9fb0c3; font-size: .82em; }
    .completion-credit summary { cursor: pointer; font-weight: 800; }
    .completion-credit p { margin: .45em 0 0; overflow-wrap: anywhere; }
    .completion-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: .7em; }
    .completion-actions button { padding: .65em 1em; }
    .completion-actions .primary { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 32%, #172131); }
    .shortcuts { position: absolute; z-index: 55; inset: 0; display: grid; place-items: center; padding: 6%; background: #05080ddd; backdrop-filter: blur(.45cqw); }
    .shortcuts[hidden] { display: none; }
    .shortcuts-card { width: min(42em, 90%); max-height: 88%; overflow: auto; padding: 2em; border: 1px solid color-mix(in srgb, var(--accent) 55%, #ffffff33); border-radius: 1.2em; background: #101827f5; box-shadow: 0 1.5em 5em #000b; }
    .shortcuts-card h2 { margin: 0; color: #fff; font-size: clamp(1.35rem, 2.8cqw, 2.4rem); }
    .shortcut-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .55em 1.4em; margin: 1.2em 0; }
    .shortcut-grid div { display: flex; align-items: center; justify-content: space-between; gap: 1em; padding: .55em 0; border-bottom: 1px solid #ffffff16; }
    .shortcut-grid dt { color: #dbe5f1; }
    .shortcut-grid dd { display: flex; gap: .3em; margin: 0; }
    kbd { min-width: 2em; padding: .2em .45em; border: 1px solid #52647c; border-bottom-width: 3px; border-radius: .35em; background: #192536; color: #fff; font: 750 .82em/1.4 ui-monospace, monospace; text-align: center; }
    .prelude[data-style="pulse"]::before { content: ""; position: absolute; width: 28cqw; aspect-ratio: 1; border-radius: 50%; background: radial-gradient(circle, color-mix(in srgb, var(--accent) 36%, transparent), transparent 68%); animation: prelude-pulse 1.7s ease-in-out infinite alternate; }
    .prelude[data-style="orbit"]::before, .prelude[data-style="orbit"]::after { content: ""; position: absolute; width: 32cqw; aspect-ratio: 1; border: .12cqw solid #ffffff22; border-radius: 50%; animation: prelude-orbit 7s linear infinite; }
    .prelude[data-style="orbit"]::after { width: 21cqw; border-color: color-mix(in srgb, var(--accent) 55%, transparent); animation-direction: reverse; animation-duration: 4s; }
    .prelude[data-style="research-log"] { place-items: end start; background: linear-gradient(90deg, #ffffff09 1px, transparent 1px), #f3efe6; background-size: 4cqw 100%; color: #172033; }
    .prelude[data-style="research-log"] .prelude-inner { margin: 8%; justify-items: start; text-align: start; }
    .prelude[data-style="research-log"] .prelude-kicker { color: color-mix(in srgb, var(--accent) 58%, black); }
    .prelude[data-style="research-log"] .prelude-message, .prelude[data-style="research-log"] .prelude-status, .prelude[data-style="research-log"] .prelude-help { color: #536071; }
    @keyframes prelude-pulse { from { opacity: .55; scale: .82; } to { opacity: 1; scale: 1.12; } }
    @keyframes prelude-orbit { to { rotate: 1turn; } }
    ${templateCss}
    ${compositionCss}
    @keyframes slide-fade { from { opacity: 0; } }
    @keyframes slide-rise { from { opacity: 0; translate: 0 3%; } }
    @keyframes slide-zoom { from { opacity: 0; scale: .96; } }
    @keyframes slide-pop { from { opacity: 0; scale: .82; } }
    @keyframes slide-left { from { opacity: 0; translate: 5% 0; } }
    @keyframes slide-right { from { opacity: 0; translate: -5% 0; } }
    @keyframes slide-blur { from { opacity: 0; filter: blur(1.2cqw); } }
    @keyframes slide-wipe { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0); } }
    .slide:not([hidden])[data-animation="fade"] { animation: slide-fade var(--motion-duration) var(--motion-ease) both; }
    .slide:not([hidden])[data-animation="rise"] { animation: slide-rise var(--motion-duration) var(--motion-ease) both; }
    .slide:not([hidden])[data-animation="zoom"] { animation: slide-zoom var(--motion-duration) var(--motion-ease) both; }
    .slide:not([hidden])[data-animation="pop"] { animation: slide-pop var(--motion-duration) var(--motion-ease) both; }
    .slide:not([hidden])[data-animation="slide-left"] { animation: slide-left var(--motion-duration) var(--motion-ease) both; }
    .slide:not([hidden])[data-animation="slide-right"] { animation: slide-right var(--motion-duration) var(--motion-ease) both; }
    .slide:not([hidden])[data-animation="blur"] { animation: slide-blur var(--motion-duration) var(--motion-ease) both; }
    .slide:not([hidden])[data-animation="wipe"] { animation: slide-wipe var(--motion-duration) var(--motion-ease) both; }
    footer { justify-content: center; }
    .voice-credit { max-width: 22ch; overflow: hidden; color: #9caabd; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
    .voice-mode { max-width: 24ch; overflow: hidden; color: #aebed0; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
    .voice-mode[data-state="voicevox"] { color: #8ee6bc; }
    .voice-mode[data-state="fallback"], .voice-mode[data-state="blocked"], .voice-mode[data-state="failed"] { color: #ffd18e; }
    .progress { flex: 1; max-width: 520px; height: 7px; overflow: hidden; border-radius: 99px; background: #263244; }
    .progress i, .voice-progress i { display: block; width: 0; height: 100%; background: var(--accent); transition: width .25s ease; }
    .voice-progress { width: 120px; height: 5px; overflow: hidden; border-radius: 99px; background: #263244; }
    .controls { display: flex; align-items: center; gap: 6px; }
    button { min-width: 40px; min-height: 34px; border: 1px solid #3a485d; border-radius: 8px; background: #172131; color: #fff; cursor: pointer; }
    button:hover { border-color: var(--accent); }
    button:disabled { cursor: not-allowed; opacity: .45; }
    button[aria-pressed="true"] { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 28%, #172131); }
    button:focus-visible, input:focus-visible { outline: .18rem solid color-mix(in srgb, var(--accent) 70%, white); outline-offset: .15rem; }
    label { display: flex; align-items: center; gap: 5px; font-size: 12px; }
    input[type="range"] { width: 80px; accent-color: var(--accent); }
    .volume-value { min-width: 3.2em; color: #dce5f2; font-variant-numeric: tabular-nums; text-align: end; }
    @media (max-width: 680px) {
      .app { gap: 6px; padding: calc(6px + env(safe-area-inset-top)) calc(6px + env(safe-area-inset-right)) calc(6px + env(safe-area-inset-bottom)) calc(6px + env(safe-area-inset-left)); }
      header { gap: 7px; min-height: 30px; font-size: 12px; }
      .time-label { display: none; }
      .time-total { display: none; }
      header strong { max-width: 35%; }
      .time-part:nth-child(3), .time > span[aria-hidden] { display: none; }
      .pace { display: none; }
      header .meta, .voice-credit { display: none; }
      .voice-mode { max-width: 12ch; }
      footer { display: grid; grid-template-columns: auto minmax(3rem, 1fr) auto; gap: 6px 8px; min-height: 76px; }
      footer .progress { width: 100%; }
      .voice-progress { grid-column: 1 / -1; width: 100%; }
      .controls { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(3, minmax(44px, auto)); width: 100%; }
      .controls button { min-height: 42px; }
      .controls label { grid-column: 1 / -1; justify-content: center; }
      .controls input[type="range"] { width: min(100%, 110px); }
    }
    @media (max-width: 430px) {
      header .time { min-width: 0; overflow: hidden; }
      .controls { min-width: 0; max-width: 100%; grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .controls button { width: 100%; min-width: 0; padding-inline: 4px; font-size: 12px; }
      .controls label { grid-column: 1 / -1; justify-content: center; min-height: 32px; }
      .controls input[type="range"] { width: min(100%, 220px); }
      .completion { padding: 4%; }
      .completion-card { width: 100%; padding: 1.25em; }
      .completion-actions { display: grid; }
      .shortcut-grid { grid-template-columns: 1fr; }
    }
    @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; scroll-behavior: auto !important; transition: none !important; } }
  </style>
</head>
<body data-layout="${escapeHtml(deck.layout)}" data-aspect-ratio="${aspectRatio}" data-editor-frame="${String(options.editorFrame ?? false)}" data-editor-prelude="${String(options.editorPrelude ?? false)}" data-renderer-version="${PRESENTATION_RENDERER_VERSION}">
  <main class="app">
    <header><strong>${escapeHtml(deck.short_title)}</strong><span class="meta">v${project.version}</span><span class="time" title="実経過時間 / 現在の区切り目安 / 想定合計時間"><span class="time-part"><span class="time-label">実</span><span id="elapsed">00:00</span></span><span aria-hidden="true">/</span><span class="time-part"><span class="time-label">目安</span><span id="expected">00:00</span></span><span class="time-total"> / 全${formattedTotalDuration}</span></span><span class="pace" id="pace" data-state="remaining">あと --:--</span><button class="timer-toggle" id="timer-toggle" type="button" aria-pressed="true" aria-keyshortcuts="T" title="実経過時間を一時停止・再開（T）">時間計測 ON</button></header>
    <div class="stage-wrap"><div class="stage" role="region" tabindex="0" aria-label="${escapeHtml(project.document.title)}"><p class="sr-only" data-editor-announcer aria-live="polite"></p><p class="sr-only" data-slide-announcer aria-live="polite" aria-atomic="true"></p><p class="sr-only" data-voice-announcer aria-live="polite" aria-atomic="true"></p>
      <section class="prelude" data-prelude data-style="${loadingScreen.style}" data-heading-font="${preludeHeadingFont}" aria-labelledby="prelude-title" style="--prelude-accent-foreground:${preludeAccentForeground}"${loadingScreen.enabled && (!options.editorFrame || options.editorPrelude) ? "" : " hidden"}>
        <div class="prelude-inner">
          <p class="prelude-kicker">PAGE 0 · PREPARING</p>
          <h1 id="prelude-title">${escapeHtml(project.document.title)}</h1>
          <p class="prelude-message">${escapeHtml(loadingScreen.message)}</p>
          <div class="prelude-meter"${loadingScreen.show_progress ? "" : " hidden"} role="progressbar" aria-label="素材の準備" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i data-prelude-progress></i></div>
          <p class="prelude-status" data-prelude-status aria-live="polite">コンテンツを確認しています…</p>
          <button class="prelude-start" type="button" data-prelude-start disabled>発表を始める</button>
          <p class="prelude-help">スライドをクリック、または → / Space で進みます</p>
        </div>
      </section>
      ${slideHtml}
      <button class="voice-unlock" type="button" data-voice-unlock hidden>音声を開始</button>
      <button class="presentation-resume" type="button" data-presentation-resume hidden>発表を再開</button>
      <section class="completion" data-completion role="dialog" aria-modal="true" aria-labelledby="completion-title" aria-live="polite" hidden>
        <div class="completion-card">
          <h2 id="completion-title">発表はここまでです</h2>
          <p>${deck.slides.length}枚の発表を最後まで確認しました。</p>
          <p class="completion-time" data-completion-time><strong>実 00:00 / 想定 ${formattedTotalDuration}</strong><small>結果を集計しています…</small></p>
          <details class="completion-credit"><summary>音声クレジット</summary><p>${escapeHtml(voiceCredits.length > 0 ? voiceCredits.join(" / ") : "生成音声なし · ブラウザ音声を使う場合があります")}</p></details>
          <div class="completion-actions"><button class="primary" type="button" data-restart>最初から見る</button><button type="button" data-dismiss-completion>最後のスライドに戻る</button></div>
        </div>
      </section>
      <section class="shortcuts" data-shortcuts role="dialog" aria-modal="true" aria-labelledby="shortcuts-title" hidden>
        <div class="shortcuts-card">
          <h2 id="shortcuts-title">発表の操作</h2>
          <dl class="shortcut-grid">
            <div><dt>次へ</dt><dd><kbd>→</kbd><kbd>Space</kbd></dd></div>
            <div><dt>前へ</dt><dd><kbd>←</kbd><kbd>PageUp</kbd></dd></div>
            <div><dt>最初／最後</dt><dd><kbd>Home</kbd><kbd>End</kbd></dd></div>
            <div><dt>音声</dt><dd><kbd>M</kbd></dd></div>
            <div><dt>自動送り</dt><dd><kbd>A</kbd></dd></div>
            <div><dt>時間計測</dt><dd><kbd>T</kbd></dd></div>
            <div><dt>全画面</dt><dd><kbd>F</kbd></dd></div>
            <div><dt>タッチ操作</dt><dd>左右へスワイプ</dd></div>
          </dl>
          <button type="button" data-dismiss-shortcuts>ガイドを閉じる</button>
        </div>
      </section>
    </div></div>
    <footer>
      <span id="counter">1 / ${deck.slides.length}</span><div class="progress" role="progressbar" aria-label="発表の進捗" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-valuetext="スライド 1 / ${deck.slides.length}"><i id="progress"></i></div><span class="voice-credit" title="${escapeHtml(voiceCredits.join(" / "))}">${escapeHtml(voiceCredits.join(" / "))}</span><span class="voice-mode" data-voice-status data-state="idle">音声待機</span>
      <div class="voice-progress" title="読み上げ進捗" role="progressbar" aria-label="読み上げ進捗" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i id="voice-progress"></i></div>
      <div class="controls">
        <button id="prev" aria-label="前へ" aria-keyshortcuts="ArrowLeft ArrowUp PageUp Backspace" title="前へ（← / PageUp）">←</button><button id="next" aria-label="次へ" aria-keyshortcuts="ArrowRight ArrowDown PageDown Space Enter" title="次へ（→ / Space / PageDown）">→</button>
        <button id="speech" aria-pressed="true" aria-keyshortcuts="M" title="ページ移動時の自動読み上げ（M）">音声 ON</button>
        <button id="auto" aria-pressed="false" aria-keyshortcuts="A" title="読み上げ後、または想定時間後に自動で進む（A）">自動 OFF</button>
        <button id="fullscreen" aria-pressed="false" aria-keyshortcuts="F" title="全画面表示を切り替える（F）">全画面</button>
        <button id="help" aria-haspopup="dialog" aria-keyshortcuts="?" title="操作ガイドを開く（?）">操作</button>
        <label>音量 <input id="volume" type="range" min="0" max="1" step="0.05" value="1" aria-describedby="volume-value"><output class="volume-value" id="volume-value" for="volume">100%</output></label>
      </div>
    </footer>
  </main>
  <script nonce="saijiyu-static">const DECK=${safeJson(runtimeDeck)};
  const FONT_CANDIDATES=${safeJson(FONT_CANDIDATES)};
  for (const name of ['uf-layer','uf-stack','uf-grid','uf-hero','uf-markdown','uf-image','uf-shape','uf-card','uf-metric','uf-quote','uf-callout','uf-bar-chart','uf-timeline','uf-bar-row','uf-timeline-item']) {
    if (!customElements.get(name)) customElements.define(name, class extends HTMLElement { connectedCallback() { this.dataset.upgraded = 'true'; } });
  }
  (() => {
    const slides = [...document.querySelectorAll('.slide')];
    const progress = document.querySelector('#progress');
    const voiceProgress = document.querySelector('#voice-progress');
    const counter = document.querySelector('#counter');
    const elapsed = document.querySelector('#elapsed');
    const expected = document.querySelector('#expected');
    const pace = document.querySelector('#pace');
    const volume = document.querySelector('#volume');
    const volumeValue = document.querySelector('#volume-value');
    const speechButton = document.querySelector('#speech');
    const autoButton = document.querySelector('#auto');
    const timerButton = document.querySelector('#timer-toggle');
    const helpButton = document.querySelector('#help');
    const fullscreenButton = document.querySelector('#fullscreen');
    const previousButton = document.querySelector('#prev');
    const nextButton = document.querySelector('#next');
    const prelude = document.querySelector('[data-prelude]');
    const preludeInner = prelude?.querySelector('.prelude-inner');
    const preludeStart = document.querySelector('[data-prelude-start]');
    const preludeProgress = document.querySelector('[data-prelude-progress]');
    const preludeMeter = preludeProgress?.parentElement;
    const preludeStatus = document.querySelector('[data-prelude-status]');
    const stage = document.querySelector('.stage');
    const voiceUnlock = document.querySelector('[data-voice-unlock]');
    const voiceStatus = document.querySelector('[data-voice-status]');
    const voiceAnnouncer = document.querySelector('[data-voice-announcer]');
    const presentationResume = document.querySelector('[data-presentation-resume]');
    const presenterFooter = document.querySelector('footer');
    const completion = document.querySelector('[data-completion]');
    const restartButton = document.querySelector('[data-restart]');
    const dismissCompletionButton = document.querySelector('[data-dismiss-completion]');
    const completionTime = document.querySelector('[data-completion-time]');
    const shortcuts = document.querySelector('[data-shortcuts]');
    const dismissShortcutsButton = document.querySelector('[data-dismiss-shortcuts]');
    const editorAnnouncer = document.querySelector('[data-editor-announcer]');
    const slideAnnouncer = document.querySelector('[data-slide-announcer]');
    const volumeKey = 'ultimate-freestyle:narration-volume';
    const editorFrame = document.body.dataset.editorFrame === 'true';
    const editorPrelude = document.body.dataset.editorPrelude === 'true';
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let swipeStart = null, suppressStageClick = false, editorGridSnap = false;
    let slide = 0, step = 0, speech = true, auto = false, started = editorFrame || !DECK.loadingScreen.enabled, startedAt = Date.now(), elapsedAccumulated = 0, timerRunning = started, unitStartedAt = performance.now(), voiceTimer, voiceDelayTimer, autoTimer, activeAudio, fitFrame, voiceRun = 0, visibilityPause = null, progressClock = null, autoDeadline = null, voiceDelayDeadline = null, voiceDelayCallback = null;
    const units = DECK.slides.reduce((sum, item) => sum + item.revealSteps + 1, 0);
    const format = (seconds) => String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(Math.floor(seconds % 60)).padStart(2, '0');
    const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum);
    const announceEditor = (message) => {
      if (editorAnnouncer instanceof HTMLElement) editorAnnouncer.textContent = message;
    };
    const isEditorTargetVisible = (item) => item instanceof HTMLElement
      && item.closest('.slide') === slides[slide]
      && item.closest('.reveal-block[aria-hidden="true"]') === null
      && item.offsetParent !== null;
    const syncEditorTabStops = () => {
      if (!editorFrame) return;
      const targets = [...document.querySelectorAll('[data-block-id], [data-node-id]')].filter((item) => item instanceof HTMLElement);
      const visible = targets.filter(isEditorTargetVisible);
      const active = visible.find((item) => item.dataset.editorSelected === 'true') || visible[0] || null;
      for (const item of targets) item.tabIndex = item === active ? 0 : -1;
    };
    const setEditorSelection = (componentId) => {
      document.querySelectorAll('[data-editor-selected="true"]').forEach((item) => { item.dataset.editorSelected = 'false'; });
      const target = [...document.querySelectorAll('[data-block-id], [data-node-id]')].find((item) =>
        item instanceof HTMLElement && (item.getAttribute('data-node-id') || item.getAttribute('data-block-id')) === componentId
      );
      if (!(target instanceof HTMLElement)) return null;
      target.dataset.editorSelected = 'true';
      syncEditorTabStops();
      return target;
    };
    const selectEditorTarget = (target) => {
      if (!editorFrame || !isEditorTargetVisible(target)) return;
      const id = target.getAttribute('data-node-id') || target.getAttribute('data-block-id') || '';
      setEditorSelection(id);
      target.focus({ preventScroll: true });
      announceEditor('表示パーツ「' + id + '」を選択しました。');
      parent.postMessage({
        type: 'ultimate-freestyle:select-component',
        component_type: target.hasAttribute('data-node-id') ? 'scene' : 'canvas',
        component_id: id
      }, location.origin);
    };
    if (editorFrame) {
      document.querySelectorAll('[data-block-id], [data-node-id]').forEach((target) => {
        if (!(target instanceof HTMLElement)) return;
        const id = target.getAttribute('data-node-id') || target.getAttribute('data-block-id') || '';
        const positioned = target.hasAttribute('data-block-id') || target.dataset.positioned === 'true';
        target.tabIndex = -1;
        target.setAttribute('aria-label', '表示パーツ ' + id + '（' + (positioned ? '自由配置' : '自動配置') + '）');
        target.setAttribute('aria-keyshortcuts', 'Control+S Meta+S');
      });
    }
    const normalizeVolume = (value) => Number.isFinite(Number(value)) ? clamp(Number(value), 0, 1) : 1;
    const showVolume = () => {
      const value = normalizeVolume(volume.value);
      volume.value = String(value);
      if (volumeValue instanceof HTMLOutputElement) volumeValue.value = Math.round(value * 100) + '%';
      if (activeAudio) activeAudio.volume = value;
    };
    const currentUnit = () => DECK.slides.slice(0, slide).reduce((sum, item) => sum + item.revealSteps + 1, 0) + step + 1;
    const expectedElapsed = () => {
      const previous = DECK.slides.slice(0, slide).reduce((sum, item) => sum + item.durationSeconds, 0);
      const current = DECK.slides[slide];
      const fraction = (step + 1) / (current.revealSteps + 1);
      return previous + current.durationSeconds * fraction;
    };
    const narration = () => DECK.slides[slide].narration?.segments.find((item) => item.at === step) ?? null;
    const updateElapsed = () => {
      const milliseconds = elapsedAccumulated + (timerRunning ? Date.now() - startedAt : 0);
      const elapsedSeconds = milliseconds / 1000;
      elapsed.textContent = format(elapsedSeconds);
      if (pace instanceof HTMLElement) {
        const remaining = expectedElapsed() - elapsedSeconds;
        const over = remaining < 0;
        pace.dataset.state = over ? 'over' : 'remaining';
        pace.textContent = over ? '目安超過 ' + format(-remaining) : 'あと ' + format(remaining);
        pace.title = over ? '現在の区切り目安を超えています' : '現在の区切り目安まで';
      }
    };
    const setTimerRunning = (running) => {
      if (running === timerRunning) return;
      if (!running && timerRunning && started) elapsedAccumulated += Date.now() - startedAt;
      if (running) startedAt = Date.now();
      timerRunning = running;
      if (timerButton instanceof HTMLButtonElement) {
        timerButton.setAttribute('aria-pressed', String(timerRunning));
        timerButton.textContent = '時間計測 ' + (timerRunning ? 'ON' : '停止中');
      }
      updateElapsed();
    };
    let modalReturnFocus = null;
    const modalBackground = [...document.querySelectorAll('header, footer, .stage > :not([data-completion]):not([data-shortcuts])')];
    const openModal = (modal, initialFocus) => {
      if (!(modal instanceof HTMLElement)) return;
      modalReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      modal.hidden = false;
      for (const item of modalBackground) if (item instanceof HTMLElement) item.inert = true;
      if (initialFocus instanceof HTMLElement) initialFocus.focus();
    };
    const closeModal = (modal, restoreFocus = true) => {
      if (!(modal instanceof HTMLElement) || modal.hidden) return false;
      modal.hidden = true;
      for (const item of modalBackground) if (item instanceof HTMLElement) item.inert = false;
      if (restoreFocus) (modalReturnFocus?.isConnected ? modalReturnFocus : stage)?.focus();
      modalReturnFocus = null;
      return true;
    };
    const trapModalFocus = (event, modal) => {
      const focusable = [...modal.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])')]
        .filter((item) => item instanceof HTMLElement && !item.hidden);
      if (focusable.length === 0) { event.preventDefault(); return; }
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    const updateControls = () => {
      if (previousButton instanceof HTMLButtonElement) previousButton.disabled = !started || (slide === 0 && step === 0);
      if (nextButton instanceof HTMLButtonElement) nextButton.disabled = !started;
      if (speechButton instanceof HTMLButtonElement) speechButton.disabled = !started;
      if (autoButton instanceof HTMLButtonElement) autoButton.disabled = !started;
      if (timerButton instanceof HTMLButtonElement) timerButton.disabled = !started;
    };
    const syncUrl = () => history.pushState(null, '', '?slide=' + (slide + 1) + '&step=' + step);
    const setVoiceProgress = (percent) => {
      const numericValue = clamp(percent, 0, 100);
      const value = numericValue + '%';
      voiceProgress.style.width = value;
      voiceProgress.parentElement?.setAttribute('aria-valuenow', String(Math.round(numericValue)));
      const localProgress = slides[slide]?.querySelector('.narration-inline-progress');
      if (localProgress instanceof HTMLElement) localProgress.style.width = value;
    };
    const setSecondaryProgressLabel = (label) => {
      const meter = voiceProgress.parentElement;
      meter?.setAttribute('aria-label', label);
      if (meter instanceof HTMLElement) meter.title = label;
    };
    const setVoiceStatus = (state, label) => {
      if (!(voiceStatus instanceof HTMLElement)) return;
      voiceStatus.dataset.state = state;
      voiceStatus.textContent = label;
      voiceStatus.title = label;
      if (voiceAnnouncer instanceof HTMLElement && ['blocked', 'failed', 'fallback'].includes(state) && voiceAnnouncer.textContent !== label) voiceAnnouncer.textContent = label;
    };
    const showVoiceUnlock = () => {
      if (voiceUnlock instanceof HTMLButtonElement) {
        voiceUnlock.hidden = false;
        voiceUnlock.focus({ preventScroll: true });
      }
      stage?.setAttribute('data-voice-blocked', 'true');
      setVoiceStatus('blocked', '音声開始待ち · 「音声を開始」を押す');
    };
    const hideVoiceUnlock = () => {
      const restoreStageFocus = voiceUnlock instanceof HTMLButtonElement && document.activeElement === voiceUnlock;
      if (voiceUnlock instanceof HTMLButtonElement) voiceUnlock.hidden = true;
      stage?.removeAttribute('data-voice-blocked');
      if (restoreStageFocus) stage?.focus({ preventScroll: true });
    };
    const stopProgressClock = () => {
      clearInterval(voiceTimer);
      voiceTimer = undefined;
      progressClock = null;
    };
    const startProgressClock = (durationMilliseconds, elapsedMilliseconds = 0, kind = 'voice') => {
      stopProgressClock();
      const duration = Math.max(1, durationMilliseconds);
      progressClock = { kind, duration, elapsed: clamp(elapsedMilliseconds, 0, duration), startedAt: performance.now() };
      const tick = () => {
        if (!progressClock) return;
        setVoiceProgress((progressClock.elapsed + performance.now() - progressClock.startedAt) / progressClock.duration * 100);
      };
      tick();
      voiceTimer = setInterval(tick, 100);
    };
    const pauseProgressClock = () => {
      if (!progressClock) { clearInterval(voiceTimer); voiceTimer = undefined; return null; }
      const paused = {
        kind: progressClock.kind,
        duration: progressClock.duration,
        elapsed: clamp(progressClock.elapsed + performance.now() - progressClock.startedAt, 0, progressClock.duration)
      };
      stopProgressClock();
      return paused;
    };
    const startVoiceDelay = (delay, callback) => {
      clearTimeout(voiceDelayTimer);
      const remaining = Math.max(0, delay);
      voiceDelayDeadline = performance.now() + remaining;
      voiceDelayCallback = callback;
      voiceDelayTimer = setTimeout(() => {
        voiceDelayDeadline = null;
        voiceDelayCallback = null;
        callback();
      }, remaining);
    };
    const startAdvanceTimer = (delay) => {
      clearTimeout(autoTimer);
      const remaining = Math.max(0, delay);
      autoDeadline = performance.now() + remaining;
      autoTimer = setTimeout(() => {
        autoDeadline = null;
        stopProgressClock();
        setVoiceProgress(100);
        advance();
      }, remaining);
    };
    const stopVoice = () => {
      voiceRun += 1;
      if ('speechSynthesis' in window) speechSynthesis.cancel();
      stopProgressClock();
      clearTimeout(voiceDelayTimer);
      voiceDelayDeadline = null;
      voiceDelayCallback = null;
      clearTimeout(autoTimer);
      autoDeadline = null;
      if (activeAudio) { activeAudio.pause(); activeAudio.removeAttribute('src'); activeAudio.load(); activeAudio = null; }
      setVoiceProgress(0);
      setVoiceStatus('idle', '音声待機');
    };
    const finishVoice = (segment) => {
      stopProgressClock();
      setVoiceProgress(100);
      if (!auto) { setVoiceStatus('complete', '読み上げ完了'); return; }
      const delay = Math.max(0, Number(segment?.pauseAfterMs ?? 350));
      setSecondaryProgressLabel(delay > 0 ? '読み上げ後の余白' : '自動送りまで');
      setVoiceStatus('pause', delay > 0 ? '余白 · ' + (delay / 1000).toFixed(1) + '秒' : '次へ進みます');
      setVoiceProgress(0);
      startProgressClock(Math.max(1, delay), 0, 'auto');
      startAdvanceTimer(delay);
    };
    const reportPreviewCompletion = () => {
      if (typeof DECK.previewRevisionId !== 'string') return;
      const detail = {
        project_id: DECK.projectId,
        project_version: DECK.version,
        renderer_version: DECK.rendererVersion,
        revision_id: DECK.previewRevisionId,
        completed_at: new Date().toISOString()
      };
      try {
        localStorage.setItem('ultimate-freestyle:preview-completed:' + DECK.previewRevisionId, JSON.stringify(detail));
      } catch {}
      if ('BroadcastChannel' in window) {
        const channel = new BroadcastChannel('ultimate-freestyle:preview-review');
        channel.postMessage(detail);
        channel.close();
      }
    };
    const showCompletion = () => {
      if (editorFrame || !(completion instanceof HTMLElement)) return;
      stopVoice();
      hideVoiceUnlock();
      auto = false;
      autoButton.setAttribute('aria-pressed', 'false');
      autoButton.textContent = '自動 OFF';
      if (nextButton instanceof HTMLButtonElement) nextButton.disabled = true;
      setTimerRunning(false);
      if (completionTime instanceof HTMLElement) {
        const actualSeconds = elapsedAccumulated / 1000;
        const expectedSeconds = DECK.slides.reduce((sum, item) => sum + item.durationSeconds, 0);
        const difference = actualSeconds - expectedSeconds;
        const summary = completionTime.querySelector('strong');
        const comparison = completionTime.querySelector('small');
        if (summary instanceof HTMLElement) summary.textContent = '実 ' + format(actualSeconds) + ' / 想定 ' + format(expectedSeconds);
        if (comparison instanceof HTMLElement) comparison.textContent = Math.abs(difference) < 1
          ? '想定時間どおりです。'
          : '想定より' + format(Math.abs(difference)) + (difference > 0 ? '長い結果です。' : '短い結果です。');
        completionTime.dataset.state = difference > 0 ? 'over' : 'within';
      }
      reportPreviewCompletion();
      openModal(completion, restartButton);
    };
    const hideCompletion = () => {
      if (!(completion instanceof HTMLElement) || completion.hidden) return false;
      closeModal(completion);
      updateControls();
      return true;
    };
    const showShortcuts = () => {
      if (!(shortcuts instanceof HTMLElement) || editorFrame) return;
      openModal(shortcuts, dismissShortcutsButton);
    };
    const hideShortcuts = () => {
      if (!(shortcuts instanceof HTMLElement) || shortcuts.hidden) return false;
      closeModal(shortcuts);
      return true;
    };
    const advance = () => {
      if (!started) return false;
      const current = DECK.slides[slide];
      if (step < current.revealSteps) step += 1;
      else if (slide < slides.length - 1) { slide += 1; step = 0; }
      else { showCompletion(); return false; }
      syncUrl(); render(); return true;
    };
    const scheduleAutoAdvance = () => {
      clearTimeout(autoTimer);
      autoDeadline = null;
      if (!auto || !started) return;
      const current = DECK.slides[slide];
      const targetDuration = Math.max(1500, current.durationSeconds * 1000 / (current.revealSteps + 1));
      const delay = Math.max(500, targetDuration - (performance.now() - unitStartedAt));
      setSecondaryProgressLabel('自動送りまで');
      setVoiceProgress(0);
      startProgressClock(delay, 0, 'auto');
      startAdvanceTimer(delay);
    };
    const speakWithBrowser = (segment, fallback = false) => {
      if (!('speechSynthesis' in window)) { setVoiceStatus('failed', '音声を利用できません'); scheduleAutoAdvance(); return; }
      setSecondaryProgressLabel('読み上げ進捗');
      const browserSpeaker = segment.speaker || '読み上げ';
      const cues = Array.isArray(segment.voiceCues) && segment.voiceCues.length > 0
        ? segment.voiceCues
        : [{ text: segment.text, effectiveTuning: segment.effectiveTuning, pauseAfterMs: 0 }];
      setVoiceStatus(fallback ? 'fallback' : 'browser', (fallback ? 'VOICEVOX失敗 → ' : '') + 'ブラウザ音声 · ' + browserSpeaker + (cues.length > 1 ? ' · ' + cues.length + '区間' : ''));
      const run = voiceRun;
      const estimated = cues.reduce((total, cue) => {
        const rate = clamp(Number(cue.effectiveTuning?.speedScale || 1), .5, 2);
        return total + Math.max(1.2, cue.text.length / (7 * rate)) * 1000 + Number(cue.pauseAfterMs || 0);
      }, 0);
      startProgressClock(estimated, 0, 'voice');
      const playCue = (index) => {
        if (run !== voiceRun) return;
        const cue = cues[index];
        if (!cue) { finishVoice(segment); return; }
        const tuning = cue.effectiveTuning || segment.effectiveTuning || {};
        const utterance = new SpeechSynthesisUtterance(cue.text);
        utterance.lang = 'ja-JP';
        utterance.rate = clamp(Number(tuning.speedScale || 1), .5, 2);
        utterance.pitch = clamp(1 + Number(tuning.pitchScale || 0) * 4, .5, 1.5);
        utterance.volume = clamp(Number(volume.value) * Number(tuning.volumeScale || 1), 0, 1);
        utterance.onstart = () => { if (run === voiceRun) hideVoiceUnlock(); };
        utterance.onend = () => {
          if (run !== voiceRun) return;
          const pause = Math.max(0, Number(cue.pauseAfterMs || 0));
          if (pause === 0) { playCue(index + 1); return; }
          setVoiceStatus('pause', '休符 · ' + (pause / 1000).toFixed(1) + '秒');
          startVoiceDelay(pause, () => playCue(index + 1));
        };
        utterance.onerror = (event) => {
          if (run !== voiceRun) return;
          stopProgressClock();
          setVoiceProgress(0);
          if (event.error === 'not-allowed') showVoiceUnlock();
          else { setVoiceStatus('failed', 'ブラウザ音声の読み上げ失敗'); scheduleAutoAdvance(); }
        };
        speechSynthesis.speak(utterance);
      };
      playCue(0);
    };
    const playSegmentVoice = (segment) => {
      if (!segment.audio_src) { speakWithBrowser(segment); return; }
      const player = new Audio(segment.audio_src);
      const run = voiceRun;
      setSecondaryProgressLabel('読み上げ進捗');
      setVoiceStatus('voicevox', 'VOICEVOX · ' + (segment.voiceProfileLabel || segment.voiceSpeakerName || '生成音声') + (segment.voiceStyleName ? ' / ' + segment.voiceStyleName : ''));
      activeAudio = player;
      player.preload = 'auto';
      player.volume = clamp(Number(volume.value), 0, 1);
      player.addEventListener('timeupdate', () => {
        if (Number.isFinite(player.duration) && player.duration > 0) setVoiceProgress(player.currentTime / player.duration * 100);
      });
      player.addEventListener('ended', () => {
        if (run !== voiceRun || activeAudio !== player) return;
        activeAudio = null;
        finishVoice(segment);
      }, { once: true });
      const fallback = () => {
        if (activeAudio !== player) return;
        player.pause(); activeAudio = null; setVoiceProgress(0); speakWithBrowser(segment, true);
      };
      player.addEventListener('error', fallback, { once: true });
      player.play().then(hideVoiceUnlock).catch((error) => {
        if (error instanceof DOMException && error.name === 'NotAllowedError') {
          player.pause(); activeAudio = null; showVoiceUnlock(); return;
        }
        fallback();
      });
    };
    const speak = () => {
      stopVoice();
      if (editorFrame) { hideVoiceUnlock(); setVoiceProgress(0); return; }
      const segment = narration();
      if (!started) return;
      if (!speech || !segment) { hideVoiceUnlock(); setVoiceStatus('idle', segment ? '音声 OFF' : '読み上げなし'); scheduleAutoAdvance(); return; }
      const pauseBefore = Math.max(0, Number(segment.pauseBeforeMs || 0));
      if (pauseBefore === 0) { playSegmentVoice(segment); return; }
      const run = voiceRun;
      setSecondaryProgressLabel('読み上げ前の間');
      setVoiceStatus('pause', '読み上げまで · ' + (pauseBefore / 1000).toFixed(1) + '秒');
      startProgressClock(pauseBefore, 0, 'voice');
      startVoiceDelay(pauseBefore, () => {
        if (run !== voiceRun) return;
        stopProgressClock();
        playSegmentVoice(segment);
      });
    };
    const createClippedOverflowProbe = (target) => {
      const boundary = target.matches('uf-image small[data-fit-content], uf-shape span[data-fit-content]')
        ? target.parentElement || target
        : target;
      const elements = [...target.querySelectorAll('*')];
      const textNodes = [];
      const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (!node.textContent?.trim()) continue;
        textNodes.push(node);
      }
      return () => {
        const boundaryRect = boundary.getBoundingClientRect();
        const contentRects = elements
          .map((item) => item.getBoundingClientRect())
          .filter((rect) => rect.width > 0 && rect.height > 0);
        for (const node of textNodes) {
          const range = document.createRange();
          range.selectNodeContents(node);
          contentRects.push(...[...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0));
          range.detach();
        }
        if (contentRects.length === 0) contentRects.push(target.getBoundingClientRect());
        const left = Math.min(...contentRects.map((rect) => rect.left));
        const right = Math.max(...contentRects.map((rect) => rect.right));
        const top = Math.min(...contentRects.map((rect) => rect.top));
        const bottom = Math.max(...contentRects.map((rect) => rect.bottom));
        return {
          x: Math.max(0, boundaryRect.left - left, right - boundaryRect.right),
          y: target.dataset.fitScroll === 'true' ? 0 : Math.max(0, boundaryRect.top - top, bottom - boundaryRect.bottom)
        };
      };
    };
    const parseRenderedColor = (value) => {
      const match = String(value).match(/^rgba?[(][ ]*([0-9.]+)[, ]+([0-9.]+)[, ]+([0-9.]+)(?:[ ]*[,/][ ]*([0-9.]+))?[ ]*[)]$/i);
      if (!match) return null;
      return { red: Number(match[1]), green: Number(match[2]), blue: Number(match[3]), alpha: match[4] === undefined ? 1 : Number(match[4]) };
    };
    const compositeColor = (foreground, background) => {
      const alpha = foreground.alpha + background.alpha * (1 - foreground.alpha);
      if (alpha <= 0) return { red: 255, green: 255, blue: 255, alpha: 0 };
      return {
        red: (foreground.red * foreground.alpha + background.red * background.alpha * (1 - foreground.alpha)) / alpha,
        green: (foreground.green * foreground.alpha + background.green * background.alpha * (1 - foreground.alpha)) / alpha,
        blue: (foreground.blue * foreground.alpha + background.blue * background.alpha * (1 - foreground.alpha)) / alpha,
        alpha
      };
    };
    const renderedBackground = (target, slideElement) => {
      let background = { red: 255, green: 255, blue: 255, alpha: 0 };
      let current = target;
      let estimated = false;
      let manualReason = null;
      while (current instanceof HTMLElement) {
        const style = getComputedStyle(current);
        if (style.backgroundImage && style.backgroundImage !== 'none') {
          estimated = true;
          if (style.backgroundImage.includes('url(')) manualReason = 'image';
        }
        const opacity = Math.min(1, Math.max(0, Number.parseFloat(style.opacity) || 0));
        if (opacity < .99) estimated = true;
        const color = parseRenderedColor(style.backgroundColor);
        if (color) background = compositeColor(background, { ...color, alpha: color.alpha * opacity });
        if (background.alpha >= .99 || current === slideElement) break;
        current = current.parentElement;
      }
      if (background.alpha < .99) background = compositeColor(background, { red: 255, green: 255, blue: 255, alpha: 1 });
      return { color: background, estimated, manualReason };
    };
    const imageBehindText = (candidate, slideElement) => {
      if (!['canvas', 'scene'].includes(slideElement.dataset.composition || '')) return false;
      const textRects = [];
      for (const node of candidate.childNodes) {
        if (node.nodeType !== Node.TEXT_NODE || !node.textContent?.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        textRects.push(...[...range.getClientRects()].filter((rect) => rect.width > 1 && rect.height > 1));
        range.detach();
      }
      const selectedRects = textRects.length <= 3
        ? textRects
        : [textRects[0], textRects[Math.floor((textRects.length - 1) / 2)], textRects[textRects.length - 1]];
      for (const rect of selectedRects) for (const offset of [.2, .5, .8]) {
        const stack = document.elementsFromPoint(rect.left + rect.width * offset, rect.top + rect.height / 2);
        let reachedText = false;
        for (const element of stack) {
          if (element === candidate || candidate.contains(element)) {
            reachedText = true;
            continue;
          }
          if (!reachedText && element instanceof HTMLElement && element.contains(candidate)) reachedText = true;
          if (!reachedText) continue;
          const media = element.closest('img,video,canvas,[data-block-kind="image"],[data-component="uf-image"]');
          if (media instanceof HTMLElement && !media.contains(candidate)) return true;
          if (element instanceof HTMLElement) {
            const style = getComputedStyle(element);
            const color = parseRenderedColor(style.backgroundColor);
            if ((color?.alpha ?? 0) >= .99 && Number.parseFloat(style.opacity) >= .99) break;
          }
          if (element === slideElement) break;
        }
      }
      return false;
    };
    const relativeLuminance = (color) => {
      const channel = (value) => {
        const normalized = value / 255;
        return normalized <= .04045 ? normalized / 12.92 : Math.pow((normalized + .055) / 1.055, 2.4);
      };
      return .2126 * channel(color.red) + .7152 * channel(color.green) + .0722 * channel(color.blue);
    };
    const contrastRatio = (foreground, background) => {
      const foregroundLuminance = relativeLuminance(foreground);
      const backgroundLuminance = relativeLuminance(background);
      return (Math.max(foregroundLuminance, backgroundLuminance) + .05) / (Math.min(foregroundLuminance, backgroundLuminance) + .05);
    };
    const colorHex = (color) => '#' + [color.red, color.green, color.blue].map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('');
    const collectContrast = (target, slideElement) => {
      const candidates = [target, ...target.querySelectorAll('*')].filter((item) => {
        if (!(item instanceof HTMLElement) || item.hidden || item.offsetParent === null) return false;
        return [...item.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim());
      });
      let lowest = null;
      let manualReview = null;
      for (const candidate of candidates) {
        const style = getComputedStyle(candidate);
        const foreground = parseRenderedColor(style.color);
        if (!foreground) continue;
        const background = renderedBackground(candidate, slideElement);
        let effectiveOpacity = foreground.alpha;
        let current = candidate;
        while (current instanceof HTMLElement) {
          effectiveOpacity *= Math.min(1, Math.max(0, Number.parseFloat(getComputedStyle(current).opacity) || 0));
          if (current === slideElement) break;
          current = current.parentElement;
        }
        const displayedForeground = compositeColor(
          { ...foreground, alpha: effectiveOpacity },
          background.color
        );
        const fontSize = Number.parseFloat(style.fontSize);
        const fontWeight = Number.parseInt(style.fontWeight, 10) || 400;
        const required = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700) ? 3 : 4.5;
        const ratio = contrastRatio(displayedForeground, background.color);
        const manualReason = background.manualReason ?? (imageBehindText(candidate, slideElement) ? 'image' : null);
        const dark = { red: 17, green: 24, blue: 39, alpha: 1 };
        const light = { red: 248, green: 250, blue: 252, alpha: 1 };
        const suggested = contrastRatio(dark, background.color) >= contrastRatio(light, background.color) ? dark : light;
        const estimated = background.estimated || effectiveOpacity < .99 || manualReason !== null;
        if (ratio + .05 < required) {
          if (!lowest || lowest.ratio > ratio) lowest = { ratio, required, estimated, manual_review: false, suggested_foreground: estimated ? null : colorHex(suggested) };
          continue;
        }
        if (manualReason !== null && (!manualReview || manualReview.ratio > ratio)) {
          manualReview = { ratio, required, estimated: true, manual_review: true, reason: manualReason, suggested_foreground: null };
        }
      }
      return lowest ?? manualReview;
    };
    const collectSmallText = (target, slideElement) => {
      const slideHeight = slideElement.clientHeight;
      if (slideHeight <= 0) return null;
      const candidates = [target, ...target.querySelectorAll('*')].filter((item) => {
        if (!(item instanceof HTMLElement) || item.hidden || item.offsetParent === null) return false;
        return [...item.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim());
      });
      let smallest = null;
      for (const candidate of candidates) {
        const rendered = Number.parseFloat(getComputedStyle(candidate).fontSize);
        if (!Number.isFinite(rendered) || rendered <= 0) continue;
        const normalized = rendered * 1080 / slideHeight;
        if (normalized >= 18 || (smallest && smallest.font_size_px <= normalized)) continue;
        smallest = { font_size_px: normalized, recommended_px: 18 };
      }
      return smallest;
    };
    const fontProbeContext = editorFrame ? document.createElement('canvas').getContext('2d') : null;
    const fontProbeText = 'mmmmmmmmmmlli最自由研究Aa';
    const genericFontFamilies = ['monospace', 'sans-serif', 'serif'];
    const genericFontWidths = fontProbeContext ? genericFontFamilies.map((family) => {
      fontProbeContext.font = '72px ' + family;
      return fontProbeContext.measureText(fontProbeText).width;
    }) : [];
    const fontAvailability = new Map();
    const localFontAvailable = (family) => {
      if (!fontProbeContext) return true;
      if (fontAvailability.has(family)) return fontAvailability.get(family);
      const safeFamily = String(family).replaceAll('"', '');
      const available = genericFontFamilies.some((generic, index) => {
        fontProbeContext.font = '72px "' + safeFamily + '", ' + generic;
        return Math.abs(fontProbeContext.measureText(fontProbeText).width - genericFontWidths[index]) > .1;
      });
      fontAvailability.set(family, available);
      return available;
    };
    const collectFontFallbacks = (slideElement) => {
      if (!editorFrame || !(slideElement instanceof HTMLElement)) return [];
      return [
        { role: '本文', field: 'body_font', preset: slideElement.dataset.bodyFont },
        { role: '見出し', field: 'heading_font', preset: slideElement.dataset.headingFont }
      ].flatMap((selection) => {
        const candidates = FONT_CANDIDATES[selection.preset] || [];
        if (candidates.length === 0 || candidates.some(localFontAvailable)) return [];
        return [{ id: 'flow:main', region: selection.role + 'フォント', role: selection.role, field: selection.field, preset: selection.preset, candidates }];
      });
    };
    const collectOcclusions = (slideElement) => {
      const candidates = [...slideElement.querySelectorAll('.slide-main[data-fit-content], .slide-sidebar[data-fit-content], .canvas-block[data-fit-content], .scene-node[data-positioned="true"][data-fit-content], .narration[data-active="true"][data-fit-content]:is([data-placement="overlay-bottom"],[data-placement="sidebar"])')]
        .filter((item) => item instanceof HTMLElement && item.offsetParent !== null && item.textContent?.trim() && Number(getComputedStyle(item).opacity) > .1);
      const textRects = (candidate) => {
        const boundary = candidate.getBoundingClientRect();
        const walker = document.createTreeWalker(candidate, NodeFilter.SHOW_TEXT);
        const rects = [];
        while (walker.nextNode()) {
          const node = walker.currentNode;
          if (!node.textContent?.trim() || !(node.parentElement instanceof HTMLElement) || node.parentElement.offsetParent === null) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          for (const rect of range.getClientRects()) {
            const left = Math.max(rect.left, boundary.left);
            const top = Math.max(rect.top, boundary.top);
            const right = Math.min(rect.right, boundary.right);
            const bottom = Math.min(rect.bottom, boundary.bottom);
            if (right - left > 1 && bottom - top > 1) rects.push({ left, top, right, bottom, width: right - left, height: bottom - top });
          }
          range.detach();
        }
        return rects;
      };
      const candidateRects = candidates.map((candidate) => ({ candidate, rects: textRects(candidate) }));
      const occlusions = [];
      for (let leftIndex = 0; leftIndex < candidateRects.length; leftIndex += 1) {
        const { candidate: left, rects: leftRects } = candidateRects[leftIndex];
        for (let rightIndex = leftIndex + 1; rightIndex < candidateRects.length; rightIndex += 1) {
          const { candidate: right, rects: rightRects } = candidateRects[rightIndex];
          if (left.contains(right) || right.contains(left)) continue;
          let overlap = 0;
          let sample = null;
          for (const leftRect of leftRects) for (const rightRect of rightRects) {
            const width = Math.min(leftRect.right, rightRect.right) - Math.max(leftRect.left, rightRect.left);
            const height = Math.min(leftRect.bottom, rightRect.bottom) - Math.max(leftRect.top, rightRect.top);
            if (width <= 1 || height <= 1) continue;
            overlap += width * height;
            sample ??= { x: Math.max(leftRect.left, rightRect.left) + width / 2, y: Math.max(leftRect.top, rightRect.top) + height / 2 };
          }
          if (!sample) continue;
          const smaller = Math.min(
            leftRects.reduce((sum, rect) => sum + rect.width * rect.height, 0),
            rightRects.reduce((sum, rect) => sum + rect.width * rect.height, 0)
          );
          const ratio = smaller > 0 ? overlap / smaller : 0;
          if (ratio < .2) continue;
          const top = document.elementsFromPoint(sample.x, sample.y).map((element) => element.closest('[data-fit-content]')).find((element) => element === left || element === right);
          if (top !== left && top !== right) continue;
          const hidden = top === left ? right : left;
          const covering = top === left ? left : right;
          occlusions.push({
            id: hidden.dataset.fitId || '',
            region: hidden.dataset.fitRegion || '',
            other_id: covering.dataset.fitId || '',
            other_region: covering.dataset.fitRegion || '',
            overlap_ratio: Number(ratio.toFixed(2))
          });
        }
      }
      const blockerSelector = '.canvas-block[data-block-kind="image"], .canvas-block[data-shape], .scene-node[data-positioned="true"]:is([data-component="uf-image"],[data-component="uf-shape"])';
      const blockers = [...slideElement.querySelectorAll(blockerSelector)].filter((item) => {
        if (!(item instanceof HTMLElement) || item.offsetParent === null || Number(getComputedStyle(item).opacity) <= .1) return false;
        if (item.matches('[data-block-kind="image"],[data-component="uf-image"]')) return true;
        const style = getComputedStyle(item);
        const background = parseRenderedColor(style.backgroundColor);
        return (background?.alpha ?? 0) > .1 || style.backgroundImage !== 'none' || Number.parseFloat(style.borderWidth) > 0;
      });
      for (const blocker of blockers) {
        const blockerRect = blocker.getBoundingClientRect();
        for (const { candidate, rects } of candidateRects) {
          if (candidate === blocker || candidate.contains(blocker) || blocker.contains(candidate)) continue;
          let overlap = 0;
          let sample = null;
          for (const rect of rects) {
            const width = Math.min(rect.right, blockerRect.right) - Math.max(rect.left, blockerRect.left);
            const height = Math.min(rect.bottom, blockerRect.bottom) - Math.max(rect.top, blockerRect.top);
            if (width <= 1 || height <= 1) continue;
            overlap += width * height;
            sample ??= { x: Math.max(rect.left, blockerRect.left) + width / 2, y: Math.max(rect.top, blockerRect.top) + height / 2 };
          }
          if (!sample) continue;
          const textArea = rects.reduce((sum, rect) => sum + rect.width * rect.height, 0);
          const ratio = textArea > 0 ? overlap / textArea : 0;
          if (ratio < .2) continue;
          const top = document.elementsFromPoint(sample.x, sample.y)
            .map((element) => element.closest(blockerSelector) || element.closest('[data-fit-content]'))
            .find((element) => element === blocker || element === candidate);
          if (top !== blocker) continue;
          const blockerId = blocker.getAttribute('data-block-id') || blocker.getAttribute('data-node-id') || '';
          const blockerRegion = blocker.matches('[data-block-kind="image"],[data-component="uf-image"]') ? '画像' : '図形';
          occlusions.push({
            id: candidate.dataset.fitId || '',
            region: candidate.dataset.fitRegion || '',
            other_id: blockerId ? (blocker.hasAttribute('data-block-id') ? 'block:' : 'node:') + blockerId : '',
            other_region: blockerRegion,
            overlap_ratio: Number(ratio.toFixed(2))
          });
        }
      }
      return occlusions;
    };
    const collectNarrationClamp = (slideElement) => {
      const region = slideElement.querySelector('.narration[data-active="true"]:not([data-display="inline"])');
      const text = region?.querySelector('.narration-text');
      const track = region?.querySelector('.narration-track');
      if (!(text instanceof HTMLElement) || !(track instanceof HTMLElement) || !text.textContent?.trim()) return null;
      const range = document.createRange();
      range.selectNodeContents(text);
      const boundary = track.getBoundingClientRect();
      const rects = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0);
      range.detach();
      const hidden = rects.filter((rect) => rect.bottom > boundary.bottom + 1 || rect.top < boundary.top - 1);
      if (hidden.length === 0) return null;
      return {
        id: 'narration',
        region: '読み上げ枠',
        hidden_lines: hidden.length,
        overflow_y: Math.max(...hidden.map((rect) => rect.bottom - boundary.bottom), 0)
      };
    };
    const fitPrelude = () => {
      if (!(prelude instanceof HTMLElement) || !(preludeInner instanceof HTMLElement) || prelude.hidden) return;
      preludeInner.style.setProperty('--prelude-fit-scale', '1');
      const boundary = prelude.getBoundingClientRect();
      let scale = 1;
      let content = preludeInner.getBoundingClientRect();
      while ((content.width > boundary.width * .92 || content.height > boundary.height * .9) && scale > .55) {
        scale = Math.max(.55, Number((scale - .05).toFixed(2)));
        preludeInner.style.setProperty('--prelude-fit-scale', String(scale));
        content = preludeInner.getBoundingClientRect();
      }
      prelude.dataset.fitScale = String(scale);
      const overflowing = content.width > boundary.width * .94 || content.height > boundary.height * .94;
      prelude.dataset.overflow = String(overflowing);
      const contrast = collectContrast(preludeInner, prelude);
      const smallText = collectSmallText(preludeInner, prelude);
      if (editorPrelude && parent !== window) parent.postMessage({
        type: 'ultimate-freestyle:render-diagnostics',
        slide_id: '__prelude__',
        step: 0,
        ready: preludeStart instanceof HTMLButtonElement && !preludeStart.disabled,
        preload: {
          completed: Number(prelude.dataset.preloadCompleted || 0),
          total: Number(prelude.dataset.preloadTotal || 0),
          failed: Number(prelude.dataset.preloadFailed || 0)
        },
        overflows: overflowing ? [{ id: 'prelude', region: '0ページ目', overflow_x: Math.max(0, content.width - boundary.width * .94), overflow_y: Math.max(0, content.height - boundary.height * .94), fit_scale: scale }] : [],
        fits: [{ id: 'prelude', region: '0ページ目', fit_scale: scale }],
        contrasts: contrast ? [{ id: 'prelude', region: '0ページ目', ratio: Number(contrast.ratio.toFixed(2)), required: contrast.required, estimated: contrast.estimated, manual_review: contrast.manual_review, reason: contrast.reason, suggested_foreground: contrast.suggested_foreground }] : [],
        clamps: [],
        readability: smallText ? [{ id: 'prelude', region: '0ページ目', font_size_px: Number(smallText.font_size_px.toFixed(1)), recommended_px: smallText.recommended_px }] : [],
        occlusions: [],
        fonts: collectFontFallbacks(prelude)
      }, location.origin);
    };
    const schedulePreludeFit = () => requestAnimationFrame(() => requestAnimationFrame(fitPrelude));
    const fitAndReport = () => {
      const currentSlide = slides[slide];
      const diagnostics = [];
      const fits = [];
      const contrasts = [];
      const clamps = [];
      const readability = [];
      if (stage instanceof HTMLElement) stage.dataset.measuring = 'true';
      currentSlide.querySelectorAll('[data-fit-content]').forEach((target) => {
        if (!(target instanceof HTMLElement) || target.hidden || target.offsetParent === null) return;
        const probeOverflow = createClippedOverflowProbe(target);
        const scales = [1, .95, .9, .85, .8, .75, .7, .65, .6, .55, .5, .45];
        const measured = new Map();
        const measureScale = (scale) => {
          target.style.setProperty('--fit-scale', String(scale));
          const overflow = probeOverflow();
          measured.set(scale, overflow);
          return overflow;
        };
        let scale = 1;
        const initialOverflow = measureScale(scale);
        if ((initialOverflow.x > 1 || initialOverflow.y > 1) && target.dataset.fitScroll !== 'true') {
          let lower = 1;
          let upper = scales.length - 1;
          let best = upper;
          while (lower <= upper) {
            const middle = Math.floor((lower + upper) / 2);
            const candidate = scales[middle];
            const overflow = measureScale(candidate);
            if (overflow.x <= 1 && overflow.y <= 1) {
              best = middle;
              upper = middle - 1;
            } else lower = middle + 1;
          }
          scale = scales[best];
          target.style.setProperty('--fit-scale', String(scale));
        }
        const clippedOverflow = measured.get(scale) ?? measureScale(scale);
        const overflowing = clippedOverflow.x > 1 || clippedOverflow.y > 1;
        target.dataset.overflow = String(overflowing);
        target.dataset.fitScale = String(scale);
        fits.push({ id: target.dataset.fitId || '', region: target.dataset.fitRegion || '', fit_scale: scale });
        if (overflowing) diagnostics.push({ id: target.dataset.fitId || '', region: target.dataset.fitRegion || '', overflow_x: clippedOverflow.x, overflow_y: clippedOverflow.y, fit_scale: scale });
        if (editorFrame) {
          const contrast = collectContrast(target, currentSlide);
          if (contrast) contrasts.push({ id: target.dataset.fitId || '', region: target.dataset.fitRegion || '', ratio: Number(contrast.ratio.toFixed(2)), required: contrast.required, estimated: contrast.estimated, manual_review: contrast.manual_review, reason: contrast.reason, suggested_foreground: contrast.suggested_foreground });
          const smallText = collectSmallText(target, currentSlide);
          if (smallText) readability.push({ id: target.dataset.fitId || '', region: target.dataset.fitRegion || '', font_size_px: Number(smallText.font_size_px.toFixed(1)), recommended_px: smallText.recommended_px });
        }
      });
      const narrationClamp = editorFrame ? collectNarrationClamp(currentSlide) : null;
      if (narrationClamp) clamps.push(narrationClamp);
      const occlusions = editorFrame ? collectOcclusions(currentSlide) : [];
      const fonts = editorFrame ? collectFontFallbacks(currentSlide) : [];
      if (stage instanceof HTMLElement) delete stage.dataset.measuring;
      if (editorFrame && parent !== window) parent.postMessage({ type: 'ultimate-freestyle:render-diagnostics', slide_id: DECK.slides[slide].id, step, overflows: diagnostics, fits, contrasts, clamps, readability, occlusions, fonts }, location.origin);
    };
    const scheduleFit = () => { cancelAnimationFrame(fitFrame); fitFrame = requestAnimationFrame(() => requestAnimationFrame(fitAndReport)); };
    const appendDraftInline = (target, text) => {
      let cursor = 0;
      while (cursor < text.length) {
        const opening = text.indexOf('**', cursor);
        if (opening === -1) { target.append(document.createTextNode(text.slice(cursor))); break; }
        const closing = text.indexOf('**', opening + 2);
        if (closing === -1) { target.append(document.createTextNode(text.slice(cursor))); break; }
        if (opening > cursor) target.append(document.createTextNode(text.slice(cursor, opening)));
        const strong = document.createElement('strong');
        strong.textContent = text.slice(opening + 2, closing);
        target.append(strong);
        cursor = closing + 2;
      }
    };
    const renderDraftMarkdown = (target, markdown) => {
      target.replaceChildren();
      let list = null;
      let listTag = '';
      const flushList = () => { if (list) { target.append(list); list = null; } };
      const lines = String(markdown).split(String.fromCharCode(10));
      const tableCells = (value) => {
        const trimmed = value.trim();
        const withoutStart = trimmed.startsWith('|') ? trimmed.slice(1) : trimmed;
        const withoutEdges = withoutStart.endsWith('|') ? withoutStart.slice(0, -1) : withoutStart;
        return withoutEdges.split('|').map((cell) => cell.trim());
      };
      for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
        const source = lines[lineIndex] || '';
        const line = source.trim();
        const nextLine = String(lines[lineIndex + 1] || '').trim();
        const headerCells = tableCells(line);
        const separatorCells = tableCells(nextLine);
        if (line.includes('|') && nextLine.includes('|') && headerCells.length === separatorCells.length && separatorCells.every((cell) => /^:?-{3,}:?$/.test(cell))) {
          flushList();
          const alignments = separatorCells.map((cell) => cell.startsWith(':') && cell.endsWith(':') ? 'center' : cell.endsWith(':') ? 'right' : 'start');
          const table = document.createElement('table');
          const head = document.createElement('thead');
          const headRow = document.createElement('tr');
          headerCells.forEach((cell, index) => {
            const header = document.createElement('th');
            header.className = 'align-' + (alignments[index] || 'start');
            appendDraftInline(header, cell);
            headRow.append(header);
          });
          head.append(headRow);
          table.append(head);
          const body = document.createElement('tbody');
          lineIndex += 2;
          while (lineIndex < lines.length) {
            const rowLine = String(lines[lineIndex] || '').trim();
            if (!rowLine || !rowLine.includes('|')) break;
            const values = tableCells(rowLine);
            const row = document.createElement('tr');
            headerCells.forEach((_, index) => {
              const cell = document.createElement('td');
              cell.className = 'align-' + (alignments[index] || 'start');
              appendDraftInline(cell, values[index] || '');
              row.append(cell);
            });
            body.append(row);
            lineIndex += 1;
          }
          lineIndex -= 1;
          table.append(body);
          target.append(table);
          continue;
        }
        if (line.startsWith('- ')) {
          if (list && listTag !== 'ul') flushList();
          if (!list) { list = document.createElement('ul'); listTag = 'ul'; }
          const item = document.createElement('li');
          appendDraftInline(item, line.slice(2));
          list.append(item);
          continue;
        }
        const markerEnd = line.indexOf('. ');
        const ordered = markerEnd > 0 && Number.isInteger(Number(line.slice(0, markerEnd)));
        if (ordered) {
          if (list && listTag !== 'ol') flushList();
          if (!list) { list = document.createElement('ol'); listTag = 'ol'; }
          const item = document.createElement('li');
          appendDraftInline(item, line.slice(markerEnd + 2));
          list.append(item);
          continue;
        }
        flushList();
        if (!line) continue;
        let headingLevel = 0;
        while (headingLevel < line.length && line[headingLevel] === '#') headingLevel += 1;
        const heading = headingLevel >= 1 && headingLevel <= 3 && line[headingLevel] === ' ';
        const block = document.createElement(heading ? 'h' + Math.min(headingLevel + 1, 4) : 'p');
        appendDraftInline(block, heading ? line.slice(headingLevel + 1) : line);
        target.append(block);
      }
      flushList();
    };
    const previewDraft = (data) => {
      const currentSlide = slides[slide];
      if (!(currentSlide instanceof HTMLElement) || currentSlide.dataset.composition !== 'flow' || data.slide_id !== DECK.slides[slide].id) return;
      const title = currentSlide.querySelector('[data-flow-title]');
      const content = currentSlide.querySelector('[data-flow-content]');
      const sidebar = currentSlide.querySelector('[data-flow-sidebar]');
      if (title instanceof HTMLElement) title.textContent = String(slide + 1).padStart(2, '0') + ' · ' + String(data.title || '');
      if (content instanceof HTMLElement) renderDraftMarkdown(content, data.content_markdown || '');
      if (sidebar instanceof HTMLElement) {
        const markdown = String(data.sidebar_markdown || '');
        sidebar.hidden = markdown.trim() === '';
        renderDraftMarkdown(sidebar, markdown);
      }
      scheduleFit();
    };
    const previewCanvasBlock = (data) => {
      const currentSlide = slides[slide];
      const block = data.block;
      if (!(currentSlide instanceof HTMLElement) || currentSlide.dataset.composition !== 'canvas' || data.slide_id !== DECK.slides[slide].id || !block || typeof block !== 'object') return;
      const target = currentSlide.querySelector('[data-block-id="' + CSS.escape(String(block.id || '')) + '"]');
      if (!(target instanceof HTMLElement) || target.dataset.blockKind !== block.kind || !block.frame) return;
      target.style.left = Number(block.frame.x) + '%';
      target.style.top = Number(block.frame.y) + '%';
      target.style.width = Number(block.frame.width) + '%';
      target.style.height = Number(block.frame.height) + '%';
      target.style.zIndex = String(block.z_index);
      target.dataset.reveal = String(block.at);
      target.dataset.revealAt = String(block.at);
      target.dataset.animation = String(block.animation || 'fade');
      const visible = Number(block.at) <= step;
      target.classList.toggle('is-visible', visible);
      target.setAttribute('aria-hidden', String(!visible));
      const style = block.style || {};
      target.style.background = style.background || 'transparent';
      target.style.color = style.foreground || 'inherit';
      target.style.border = Number(style.border_width_px || 0) > 0 ? 'max(1px, ' + previewLength(style.border_width_px) + ') solid ' + (style.border_color || 'transparent') : '0 solid transparent';
      target.style.borderRadius = previewLength(style.corner_radius_px);
      target.style.padding = previewLength(style.padding_px);
      target.style.setProperty('--component-opacity', String(style.opacity ?? 1));
      target.style.setProperty('--component-font-scale', String(style.font_scale ?? 1));
      target.style.textAlign = style.text_align === 'center' ? 'center' : style.text_align === 'end' ? 'end' : 'start';
      target.style.justifyContent = style.vertical_align === 'center' ? 'center' : style.vertical_align === 'end' ? 'flex-end' : 'flex-start';
      target.style.boxShadow = style.shadow === 'strong' ? '0 .75cqw 2.25cqw #0009' : style.shadow === 'soft' ? '0 .375cqw 1.375cqw #0005' : 'none';
      if (block.kind === 'markdown') renderDraftMarkdown(target, String(block.markdown || ''));
      else if (block.kind === 'image') {
        const image = target.querySelector('img');
        if (image instanceof HTMLImageElement) {
          image.alt = String(block.alt_text || '');
          image.dataset.fit = String(block.fit || 'contain');
          if (data.asset_urls && typeof data.asset_urls === 'object' && data.asset_urls[block.asset_id]) image.src = String(data.asset_urls[block.asset_id]);
        }
      } else if (block.kind === 'shape') {
        target.dataset.shape = String(block.shape || 'rectangle');
        target.replaceChildren();
        if (block.label !== null && block.label !== undefined) {
          const label = document.createElement('span');
          label.textContent = String(block.label);
          target.append(label);
        }
      }
      scheduleFit();
    };
    const previewSceneComponent = (data) => {
      const currentSlide = slides[slide];
      const component = data.component;
      if (!(currentSlide instanceof HTMLElement) || currentSlide.dataset.composition !== 'scene' || data.slide_id !== DECK.slides[slide].id || !component || typeof component !== 'object') return;
      const target = currentSlide.querySelector('[data-node-id="' + String(component.id) + '"]');
      if (!(target instanceof HTMLElement) || target.dataset.component !== 'uf-' + String(component.kind).replaceAll('_', '-')) return;
      const componentStyle = component.style && typeof component.style === 'object' ? component.style : {};
      const previewLength = (value) => Number(value || 0) / 16 + 'cqw';
      const verticalAlign = componentStyle.vertical_align === 'center' ? 'center' : componentStyle.vertical_align === 'end' ? 'flex-end' : 'flex-start';
      const shadow = componentStyle.shadow === 'soft' ? '0 .375cqw 1.375cqw #0005' : componentStyle.shadow === 'strong' ? '0 .75cqw 2.25cqw #0009' : 'none';
      target.dataset.reveal = String(component.at || 0);
      target.dataset.revealAt = String(component.at || 0);
      target.dataset.animation = String(component.animation || 'none');
      target.classList.toggle('is-visible', Number(component.at || 0) <= step);
      target.setAttribute('aria-hidden', String(Number(component.at || 0) > step));
      target.style.background = componentStyle.background || 'transparent';
      target.style.color = componentStyle.foreground || 'inherit';
      target.style.border = Number(componentStyle.border_width_px || 0) > 0 ? 'max(1px, ' + previewLength(componentStyle.border_width_px) + ') solid ' + (componentStyle.border_color || 'transparent') : '0 solid transparent';
      target.style.borderRadius = previewLength(componentStyle.corner_radius_px);
      target.style.padding = previewLength(componentStyle.padding_px);
      target.style.setProperty('--component-opacity', String(componentStyle.opacity ?? 1));
      target.style.setProperty('--component-font-scale', String(componentStyle.font_scale ?? 1));
      target.style.textAlign = componentStyle.text_align === 'center' ? 'center' : componentStyle.text_align === 'end' ? 'end' : 'start';
      if (component.kind !== 'stack') target.style.justifyContent = verticalAlign;
      target.style.boxShadow = shadow;
      if (component.kind === 'stack') {
        const justify = { start: 'flex-start', center: 'center', end: 'flex-end', between: 'space-between', around: 'space-around' };
        target.style.flexDirection = component.direction === 'row' ? 'row' : 'column';
        target.style.gap = previewLength(component.gap_px);
        target.style.alignItems = component.align === 'start' ? 'flex-start' : component.align === 'end' ? 'flex-end' : String(component.align || 'stretch');
        target.style.justifyContent = justify[component.justify] || 'center';
        target.style.flexWrap = component.wrap ? 'wrap' : 'nowrap';
      } else if (component.kind === 'grid') {
        target.style.gridTemplateColumns = 'repeat(' + clamp(Number(component.columns), 1, 6) + ', minmax(0, 1fr))';
        target.style.gap = previewLength(component.gap_px);
        target.style.alignItems = component.align === 'end' ? 'end' : String(component.align || 'stretch');
      } else if (component.kind === 'hero') target.dataset.align = String(component.align || 'start');
      else if (component.kind === 'shape') target.dataset.shape = String(component.shape || 'rectangle');
      else if (component.kind === 'card' || component.kind === 'callout') target.dataset.variant = String(component.variant || 'plain');
      else if (component.kind === 'metric') target.dataset.emphasis = String(component.emphasis || 'normal');
      const addText = (parent, tag, className, value) => {
        if (value === null || value === undefined) return null;
        const item = document.createElement(tag);
        if (className) item.className = className;
        item.textContent = String(value);
        parent.append(item);
        return item;
      };
      if (component.kind === 'hero') {
        target.dataset.compactHeading = String([...String(component.heading || '')].length <= 16);
        target.replaceChildren();
        addText(target, 'p', 'component-eyebrow', component.eyebrow);
        addText(target, 'h2', '', component.heading);
        addText(target, 'p', 'component-subtitle', component.subtitle);
      } else if (component.kind === 'markdown') {
        renderDraftMarkdown(target, component.markdown || '');
      } else if (component.kind === 'image') {
        const media = target.querySelector('img');
        if (media instanceof HTMLImageElement) {
          media.alt = String(component.alt_text || '');
          media.dataset.fit = String(component.fit || 'contain');
          if (data.asset_urls && typeof data.asset_urls === 'object' && data.asset_urls[component.asset_id]) media.src = String(data.asset_urls[component.asset_id]);
        }
        target.querySelector('small')?.remove();
        addText(target, 'small', '', component.caption);
      } else if (component.kind === 'shape') {
        target.replaceChildren();
        addText(target, 'span', '', component.label);
      } else if (component.kind === 'card') {
        target.replaceChildren();
        addText(target, 'p', 'component-label', component.label);
        const body = document.createElement('div');
        target.append(body);
        renderDraftMarkdown(body, component.markdown || '');
      } else if (component.kind === 'metric') {
        target.replaceChildren();
        const line = document.createElement('p');
        addText(line, 'strong', '', component.value);
        addText(line, 'span', '', component.unit);
        target.append(line);
        addText(target, 'small', '', component.caption);
      } else if (component.kind === 'quote') {
        target.replaceChildren();
        addText(target, 'blockquote', '', component.quote);
        addText(target, 'cite', '', component.attribution);
      } else if (component.kind === 'callout') {
        target.replaceChildren();
        addText(target, 'p', 'component-label', component.label);
        addText(target, 'h3', '', component.heading);
        if (component.markdown !== null && component.markdown !== undefined) {
          const body = document.createElement('div');
          target.append(body);
          renderDraftMarkdown(body, component.markdown);
        }
      } else if (component.kind === 'bar_chart') {
        target.replaceChildren();
        const maximum = Math.max(Number(component.max_value) || 1, 0.000001);
        for (const item of Array.isArray(component.items) ? component.items : []) {
          const row = document.createElement('uf-bar-row');
          row.className = 'reveal-block';
          row.dataset.itemId = String(item.id || '');
          row.dataset.reveal = String(item.at || 0);
          row.dataset.revealAt = String(item.at || 0);
          row.dataset.animation = 'rise';
          const visible = Number(item.at || 0) <= step;
          row.classList.toggle('is-visible', visible);
          row.setAttribute('aria-hidden', String(!visible));
          row.style.setProperty('--bar-width', clamp(Number(item.value) / maximum * 100, 0, 100) + '%');
          row.style.setProperty('--bar-color', item.color || 'var(--accent)');
          addText(row, 'span', '', item.label);
          row.append(document.createElement('i'));
          addText(row, 'strong', '', item.value);
          target.append(row);
        }
      } else if (component.kind === 'timeline') {
        target.replaceChildren();
        for (const item of Array.isArray(component.items) ? component.items : []) {
          const row = document.createElement('uf-timeline-item');
          row.className = 'reveal-block';
          row.dataset.itemId = String(item.id || '');
          row.dataset.reveal = String(item.at || 0);
          row.dataset.revealAt = String(item.at || 0);
          row.dataset.animation = 'rise';
          const visible = Number(item.at || 0) <= step;
          row.classList.toggle('is-visible', visible);
          row.setAttribute('aria-hidden', String(!visible));
          addText(row, 'small', '', item.kicker);
          addText(row, 'strong', '', item.heading);
          addText(row, 'p', '', item.detail);
          target.append(row);
        }
      }
      scheduleFit();
    };
    const previewTypography = (data) => {
      const currentSlide = slides[slide];
      if (!(currentSlide instanceof HTMLElement) || currentSlide.dataset.composition !== 'flow' || data.slide_id !== DECK.slides[slide].id) return;
      const typography = data.typography;
      if (!typography || typeof typography !== 'object') return;
      currentSlide.dataset.textPreset = String(typography.preset || 'standard');
      currentSlide.dataset.textAlign = String(typography.text_align || 'start');
      currentSlide.dataset.verticalAlign = String(typography.vertical_align || 'start');
      currentSlide.style.setProperty('--slide-body-scale', String(typography.body_scale));
      currentSlide.style.setProperty('--slide-heading-scale', String(typography.heading_scale));
      currentSlide.style.setProperty('--body-line-height', String(typography.line_height));
      currentSlide.style.setProperty('--slide-paragraph-spacing', String(typography.paragraph_spacing_em) + 'em');
      currentSlide.style.setProperty('--slide-column-gap', String(typography.column_gap_em) + 'em');
      const content = currentSlide.querySelector('[data-flow-content]');
      if (content instanceof HTMLElement) content.dataset.columns = String(typography.columns);
      scheduleFit();
    };
    const previewTemplate = (data) => {
      const currentSlide = slides[slide];
      if (!(currentSlide instanceof HTMLElement) || data.slide_id !== DECK.slides[slide].id || !data.template || typeof data.template !== 'object') return;
      const template = data.template;
      currentSlide.dataset.regionLayout = String(template.region_layout);
      currentSlide.dataset.visualPreset = String(template.visual_preset);
      currentSlide.dataset.bodyFont = String(template.body_font);
      currentSlide.dataset.headingFont = String(template.heading_font);
      currentSlide.dataset.density = String(template.density);
      currentSlide.dataset.motionStyle = String(template.motion_style);
      currentSlide.dataset.animation = String(template.enter_animation);
      for (const [property, value] of Object.entries({
        '--template-background': template.background,
        '--template-surface': template.surface,
        '--template-foreground': template.foreground,
        '--template-muted': template.muted,
        '--template-accent': template.accent,
        '--template-accent-secondary': template.accent_secondary,
        '--template-border': template.border,
        '--template-radius': Number(template.corner_radius_px) / 16 + 'cqw',
        '--template-spacing': template.spacing_scale,
        '--template-font-scale': template.font_scale,
        '--template-sidebar-width': template.sidebar_width_percent + '%',
        '--body-weight': template.body_weight,
        '--heading-weight': template.heading_weight,
        '--body-letter-spacing': template.letter_spacing_em + 'em'
      })) currentSlide.style.setProperty(property, String(value));
      if (template.apply_line_height) currentSlide.style.setProperty('--body-line-height', String(template.line_height));
      currentSlide.style.animation = 'none';
      currentSlide.getBoundingClientRect();
      currentSlide.style.removeProperty('animation');
      scheduleFit();
    };
    const previewNarrationSettings = (data) => {
      const currentSlide = slides[slide];
      if (!(currentSlide instanceof HTMLElement) || data.slide_id !== DECK.slides[slide].id || !data.appearance) return;
      const region = currentSlide.querySelector('.narration');
      if (!(region instanceof HTMLElement)) return;
      region.dataset.display = String(data.display);
      region.dataset.placement = String(data.appearance.placement);
      region.dataset.size = String(data.appearance.size);
      region.dataset.textAlign = String(data.appearance.text_align);
      region.dataset.speakerVisible = String(data.appearance.speaker_visible);
      region.dataset.progressVisible = String(data.appearance.progress_visible);
      region.style.setProperty('--narration-text-scale', String(data.appearance.text_scale));
      region.style.setProperty('--narration-max-lines', String(data.appearance.max_lines));
      for (const [field, property] of [['background', '--narration-custom-background'], ['foreground', '--narration-custom-foreground'], ['border_color', '--narration-custom-border'], ['accent', '--narration-custom-accent']]) {
        const value = data.appearance[field];
        if (/^#[0-9a-f]{6}$/i.test(String(value || ''))) region.style.setProperty(property, String(value));
        else region.style.removeProperty(property);
      }
      if (Number.isFinite(data.appearance.corner_radius_px)) region.style.setProperty('--narration-custom-radius', previewLength(data.appearance.corner_radius_px));
      else region.style.removeProperty('--narration-custom-radius');
      const speaker = region.querySelector('.narration-speaker');
      const speakerText = String(data.speaker || DECK.slides[slide].narration?.speaker || '');
      if (speaker instanceof HTMLElement) { speaker.textContent = speakerText; speaker.hidden = speakerText === ''; }
      const track = region.querySelector('.narration-track');
      if (track instanceof HTMLElement) {
        track.replaceChildren();
        if (data.display === 'inline') {
          for (const segment of DECK.slides[slide].narration?.segments || []) {
            const item = document.createElement('span');
            item.className = 'narration-segment';
            item.dataset.narrationAt = String(segment.at);
            item.textContent = segment.text;
            if (segment.at === step) { item.classList.add('is-current'); item.setAttribute('aria-current', 'true'); }
            track.append(item);
          }
        } else {
          const item = document.createElement('p');
          item.className = 'narration-text';
          item.textContent = narration()?.text || '';
          track.append(item);
        }
      }
      region.dataset.active = String(data.display === 'inline' || Boolean(narration()));
      scheduleFit();
    };
    const previewComposition = (data) => {
      const currentSlide = slides[slide];
      if (!(currentSlide instanceof HTMLElement) || currentSlide.dataset.composition === 'flow' || data.slide_id !== DECK.slides[slide].id) return;
      if (/^#[0-9a-f]{6}$/i.test(String(data.background || ''))) currentSlide.style.setProperty('--canvas-background', String(data.background));
      currentSlide.style.setProperty('--canvas-overflow', data.clip_content ? 'hidden' : 'visible');
      scheduleFit();
    };
    const previewAppearance = (data) => {
      const currentSlide = slides[slide];
      if (!(currentSlide instanceof HTMLElement) || data.slide_id !== DECK.slides[slide].id) return;
      const template = data.template;
      if (!template || typeof template !== 'object') return;
      currentSlide.dataset.slideRole = String(data.role || 'content');
      currentSlide.dataset.coverLayout = String(data.cover_layout || 'center');
      currentSlide.dataset.tone = String(data.tone || 'dark');
      for (const className of [...currentSlide.classList]) {
        if (className.startsWith('tone-')) currentSlide.classList.remove(className);
      }
      currentSlide.classList.add('tone-' + String(data.tone || 'dark'));
      currentSlide.dataset.templateId = String(template.template_id || '');
      currentSlide.dataset.userTemplate = String(Boolean(template.user_template));
      currentSlide.dataset.regionLayout = String(template.region_layout || 'sidebar-right');
      currentSlide.dataset.visualPreset = String(template.visual_preset || 'studio');
      currentSlide.dataset.bodyFont = String(template.body_font || 'system-sans');
      currentSlide.dataset.headingFont = String(template.heading_font || 'system-sans');
      currentSlide.dataset.density = String(template.density || 'comfortable');
      currentSlide.dataset.motionStyle = String(template.motion_style || 'calm');
      currentSlide.dataset.animation = String(data.enter_animation || template.enter_animation || 'fade');
      for (const [property, value] of Object.entries({
        '--template-background': template.background,
        '--template-surface': template.surface,
        '--template-foreground': template.foreground,
        '--template-muted': template.muted,
        '--template-accent': template.accent,
        '--template-accent-secondary': template.accent_secondary,
        '--template-border': template.border,
        '--template-radius': Number(template.corner_radius_px) / 16 + 'cqw',
        '--template-spacing': template.spacing_scale,
        '--template-font-scale': template.font_scale,
        '--template-sidebar-width': template.sidebar_width_percent + '%',
        '--body-weight': template.body_weight,
        '--heading-weight': template.heading_weight,
        '--body-letter-spacing': template.letter_spacing_em + 'em'
      })) {
        if (value === undefined || value === null || String(value).includes('NaN')) currentSlide.style.removeProperty(property);
        else currentSlide.style.setProperty(property, String(value));
      }
      if (template.apply_line_height && Number.isFinite(Number(template.line_height))) {
        currentSlide.style.setProperty('--body-line-height', String(template.line_height));
      }
      currentSlide.style.animation = 'none';
      currentSlide.getBoundingClientRect();
      currentSlide.style.removeProperty('animation');
      scheduleFit();
    };
    const previewNarrationSegment = (data) => {
      const currentSlide = slides[slide];
      if (!(currentSlide instanceof HTMLElement) || data.slide_id !== DECK.slides[slide].id) return;
      const region = currentSlide.querySelector('.narration');
      if (!(region instanceof HTMLElement)) return;
      if (region.dataset.display === 'inline') {
        let item = region.querySelector('[data-narration-at="' + Number(data.at) + '"]');
        if (!(item instanceof HTMLElement)) {
          item = document.createElement('span');
          item.className = 'narration-segment';
          item.dataset.narrationAt = String(Number(data.at));
          region.querySelector('.narration-track')?.append(item);
        }
        item.textContent = String(data.text || '');
        item.classList.toggle('is-current', Number(data.at) === step);
        item.toggleAttribute('aria-current', Number(data.at) === step);
        region.dataset.active = 'true';
      } else if (Number(data.at) === step) {
        const item = region.querySelector('.narration-text');
        if (item instanceof HTMLElement) item.textContent = String(data.text || '');
        const speaker = region.querySelector('.narration-speaker');
        const speakerText = String(data.speaker || DECK.slides[slide].narration?.speaker || '');
        if (speaker instanceof HTMLElement) { speaker.textContent = speakerText; speaker.hidden = speakerText === ''; }
        region.dataset.active = String(String(data.text || '').trim() !== '');
      }
      scheduleFit();
    };
    const setPosition = (nextSlide, nextStep, push) => {
      slide = clamp(Number(nextSlide) - 1, 0, slides.length - 1);
      step = clamp(Number(nextStep), 0, DECK.slides[slide].revealSteps);
      if (push) syncUrl(); else history.replaceState(null, '', '?slide=' + (slide + 1) + '&step=' + step);
      render();
    };
    const showPrelude = (push) => {
      if (!DECK.loadingScreen.enabled || editorFrame) return false;
      started = false;
      elapsedAccumulated = 0;
      setTimerRunning(false);
      stopVoice();
      hideVoiceUnlock();
      prelude.hidden = false;
      schedulePreludeFit();
      slides.forEach((item) => { item.hidden = true; item.dataset.state = 'inactive'; });
      counter.textContent = '0 / ' + slides.length;
      progress.style.width = '0%';
      progress.parentElement?.setAttribute('aria-valuenow', '0');
      elapsed.textContent = '00:00';
      expected.textContent = '00:00';
      if (pace instanceof HTMLElement) { pace.dataset.state = 'remaining'; pace.textContent = 'あと --:--'; }
      updateControls();
      if (push) history.pushState(null, '', '?slide=0');
      else history.replaceState(null, '', '?slide=0');
      return true;
    };
    const render = () => {
      unitStartedAt = performance.now();
      if (completion instanceof HTMLElement && !completion.hidden) closeModal(completion, false);
      if (shortcuts instanceof HTMLElement && !shortcuts.hidden) closeModal(shortcuts, false);
      updateControls();
      stopVoice(); slides.forEach((item, index) => { const active = index === slide; item.hidden = !active; item.dataset.state = active ? 'active' : 'inactive'; });
      slides[slide].querySelectorAll('[data-reveal]').forEach((item) => { const visible = Number(item.dataset.reveal) <= step; item.classList.toggle('is-visible', visible); item.setAttribute('aria-hidden', String(!visible)); });
      syncEditorTabStops();
      const segment = narration(); const narrationRegion = slides[slide].querySelector('.narration');
      narrationRegion.dataset.active = String(Boolean(segment) || narrationRegion.dataset.display === 'inline');
      const speaker = segment?.speaker || DECK.slides[slide].narration?.speaker || '';
      const speakerRegion = narrationRegion.querySelector('.narration-speaker');
      if (speakerRegion) { speakerRegion.textContent = speaker; speakerRegion.hidden = speaker === ''; }
      if (narrationRegion.dataset.display === 'inline') {
        narrationRegion.querySelectorAll('[data-narration-at]').forEach((item) => {
          const current = Number(item.dataset.narrationAt) === step;
          item.classList.toggle('is-current', current);
          if (current) { item.setAttribute('aria-current', 'true'); item.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' }); } else item.removeAttribute('aria-current');
        });
      } else {
        const textRegion = narrationRegion.querySelector('.narration-text');
        if (textRegion) textRegion.textContent = segment?.text ?? '';
      }
      counter.textContent = (slide + 1) + ' / ' + slides.length + ' · STEP ' + step;
      if (!editorFrame && slideAnnouncer instanceof HTMLElement) {
        const revealTotal = DECK.slides[slide].revealSteps;
        slideAnnouncer.textContent = 'スライド ' + (slide + 1) + ' / ' + slides.length + '、' + DECK.slides[slide].title + (revealTotal > 0 ? '、段階 ' + (step + 1) + ' / ' + (revealTotal + 1) : '');
      }
      const progressPercent = currentUnit() / units * 100;
      progress.style.width = progressPercent + '%';
      progress.parentElement?.setAttribute('aria-valuenow', String(Math.round(progressPercent)));
      progress.parentElement?.setAttribute('aria-valuetext', 'スライド ' + (slide + 1) + ' / ' + slides.length + '、段階 ' + (step + 1) + ' / ' + (DECK.slides[slide].revealSteps + 1));
      expected.textContent = format(expectedElapsed());
      scheduleFit(); speak(); scheduleUpcomingPreload();
    };
    const restore = () => {
      const query = new URLSearchParams(location.search);
      if (editorPrelude) {
        prelude.hidden = false;
        slides.forEach((item) => { item.hidden = true; item.dataset.state = 'inactive'; });
        schedulePreludeFit();
        return;
      }
      if ((query.get('slide') === null || query.get('slide') === '0') && showPrelude(false)) return;
      started = true;
      if (!timerRunning) setTimerRunning(true);
      prelude.hidden = true;
      slide = Math.min(Math.max(Number(query.get('slide') ?? 1) - 1, 0), slides.length - 1);
      step = Math.min(Math.max(Number(query.get('step') ?? 0), 0), DECK.slides[slide].revealSteps);
      render();
    };
    const markPreloadProgress = (completed, total, failed = 0) => {
      const percent = total === 0 ? 100 : completed / total * 100;
      if (preludeProgress) preludeProgress.style.width = percent + '%';
      if (preludeMeter) {
        preludeMeter.setAttribute('aria-valuenow', String(Math.round(percent)));
        preludeMeter.setAttribute('aria-valuetext', completed + ' / ' + total + '件');
      }
      if (preludeStatus && (completed === 0 || completed === total)) preludeStatus.textContent = completed < total
        ? '発表に必要な素材を準備しています'
        : failed > 0 ? failed + '件は開始後に読み込みます' : '準備できました';
      if (prelude instanceof HTMLElement) {
        prelude.dataset.preloadCompleted = String(completed);
        prelude.dataset.preloadTotal = String(total);
        prelude.dataset.preloadFailed = String(failed);
      }
      schedulePreludeFit();
    };
    const preloadedResources = new Set();
    const preloadResource = (url, kind) => new Promise((resolve) => {
      if (preloadedResources.has(url)) { resolve({ url, ok: true }); return; }
      preloadedResources.add(url);
      const media = kind === 'image' ? new Image() : new Audio();
      media.addEventListener(kind === 'image' ? 'load' : 'canplay', () => resolve({ url, ok: true }), { once: true });
      media.addEventListener('error', () => resolve({ url, ok: false }), { once: true });
      if (kind === 'audio') media.preload = 'auto';
      media.src = url;
      if (kind === 'audio') media.load();
    });
    const preloadResources = async (resources, onComplete, concurrency = 4) => {
      let cursor = 0;
      const worker = async () => {
        while (cursor < resources.length) {
          const [url, kind] = resources[cursor++];
          const task = kind === 'font' ? (document.fonts?.ready ?? Promise.resolve()) : preloadResource(url, kind);
          let succeeded = true;
          try { const result = await task; succeeded = result?.ok !== false; } catch { succeeded = false; }
          finally { onComplete(succeeded); }
        }
      };
      const workerCount = Math.min(concurrency, resources.length);
      await Promise.allSettled(Array.from({ length: workerCount }, worker));
    };
    const scheduleUpcomingPreload = () => {
      const upcoming = DECK.preload.slides[slide + 1];
      if (!upcoming) return;
      const resources = [
        ...upcoming.images.map((url) => [url, 'image']),
        ...upcoming.audio.filter((item) => item.at === 0).map((item) => [item.url, 'audio'])
      ];
      const deferredAudio = upcoming.audio.filter((item) => item.at !== 0).map((item) => [item.url, 'audio']);
      if (resources.length === 0 && deferredAudio.length === 0) return;
      const load = () => { void preloadResources(resources, () => {}, 2).then(() => preloadResources(deferredAudio, () => {}, 1)); };
      if ('requestIdleCallback' in window) window.requestIdleCallback(load, { timeout: 2000 });
      else setTimeout(load, 600);
    };
    const preparePrelude = async () => {
      const requested = Math.min(Math.max(Number(new URLSearchParams(location.search).get('slide') ?? 1) - 1, 0), DECK.slides.length - 1);
      const critical = DECK.preload.slides[requested] ?? { images: [], audio: [] };
      const resources = [
        ['fonts', 'font'],
        ...critical.images.map((url) => [url, 'image']),
        ...critical.audio.filter((item) => item.at === 0).map((item) => [item.url, 'audio'])
      ];
      const deferredAudio = critical.audio.filter((item) => item.at !== 0).map((item) => [item.url, 'audio']);
      let completed = 0, failed = 0;
      markPreloadProgress(completed, resources.length, failed);
      const startedLoadingAt = performance.now();
      let loadingSettled = false;
      const loadingTask = preloadResources(resources, (succeeded) => { completed += 1; if (!succeeded) failed += 1; markPreloadProgress(completed, resources.length, failed); })
        .finally(() => { loadingSettled = true; });
      const remaining = Math.max(0, Number(DECK.loadingScreen.minimum_duration_ms) - (performance.now() - startedLoadingAt));
      if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
      if (preludeStart) preludeStart.disabled = false;
      schedulePreludeFit();
      if (!loadingSettled && preludeStatus) preludeStatus.textContent = completed + ' / ' + resources.length + ' 件を準備中 · 先に開始できます';
      await Promise.race([loadingTask, new Promise((resolve) => setTimeout(resolve, 10_000))]);
      if (preludeStatus) preludeStatus.textContent = completed < resources.length
        ? '一部を読み込みながら開始できます'
        : failed > 0 ? failed + '件は開始後に読み込みます' : '準備できました';
      const loadDeferredAudio = () => { void preloadResources(deferredAudio, () => {}, 1); };
      if ('requestIdleCallback' in window) window.requestIdleCallback(loadDeferredAudio, { timeout: 2500 });
      else setTimeout(loadDeferredAudio, 800);
      schedulePreludeFit();
    };
    document.querySelector('#next').addEventListener('click', () => { if (visibilityPause) return; if (started) advance(); });
    document.querySelector('#prev').addEventListener('click', () => { if (visibilityPause || !started) return; if (step > 0) step -= 1; else if (slide > 0) { slide -= 1; step = DECK.slides[slide].revealSteps; } else return; syncUrl(); render(); });
    speechButton.addEventListener('click', () => { if (visibilityPause) return; speech = !speech; speechButton.setAttribute('aria-pressed', String(speech)); speechButton.textContent = '音声 ' + (speech ? 'ON' : 'OFF'); render(); });
    autoButton.addEventListener('click', () => {
      if (visibilityPause) return;
      auto = !auto;
      autoButton.setAttribute('aria-pressed', String(auto));
      autoButton.textContent = '自動 ' + (auto ? 'ON' : 'OFF');
      if (!auto) {
        clearTimeout(autoTimer);
        autoDeadline = null;
        if (progressClock?.kind === 'auto') {
          stopProgressClock();
          setVoiceProgress(0);
          setSecondaryProgressLabel('読み上げ進捗');
        }
      }
      else if (!activeAudio && (!('speechSynthesis' in window) || !speechSynthesis.speaking)) scheduleAutoAdvance();
    });
    volume.addEventListener('input', () => { if (visibilityPause) return; showVolume(); try { localStorage.setItem(volumeKey, volume.value); } catch {} });
    timerButton?.addEventListener('click', () => { if (visibilityPause) return; if (started) setTimerRunning(!timerRunning); });
    helpButton?.addEventListener('click', showShortcuts);
    dismissShortcutsButton?.addEventListener('click', hideShortcuts);
    const syncFullscreen = () => {
      if (!(fullscreenButton instanceof HTMLButtonElement)) return;
      const active = document.fullscreenElement !== null;
      fullscreenButton.setAttribute('aria-pressed', String(active));
      fullscreenButton.textContent = active ? '全画面を終了' : '全画面';
    };
    fullscreenButton?.addEventListener('click', async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await document.documentElement.requestFullscreen();
      } catch {}
    });
    if (!document.fullscreenEnabled && fullscreenButton instanceof HTMLButtonElement) fullscreenButton.hidden = true;
    addEventListener('fullscreenchange', syncFullscreen);
    syncFullscreen();
    try { volume.value = localStorage.getItem(volumeKey) ?? '1'; } catch {}
    showVolume();
    addEventListener('keydown', (event) => {
      if (editorFrame) {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
          const target = document.querySelector('[data-editor-selected="true"]');
          if (!(target instanceof HTMLElement)) {
            announceEditor('保存する表示パーツを先に選択してください。');
          } else {
            const id = target.getAttribute('data-node-id') || target.getAttribute('data-block-id') || '';
            parent.postMessage({
              type: 'ultimate-freestyle:save-component',
              component_type: target.hasAttribute('data-node-id') ? 'scene' : 'canvas',
              component_id: id
            }, location.origin);
            announceEditor('表示パーツ「' + id + '」の保存を開始します。');
          }
          event.preventDefault();
          return;
        }
        if (event.key === 'Escape') {
          document.querySelectorAll('[data-editor-selected="true"]').forEach((item) => { item.dataset.editorSelected = 'false'; });
          stage?.focus();
          announceEditor('表示パーツの選択を解除しました。');
          event.preventDefault();
          return;
        }
        if (['Enter', ' '].includes(event.key) && event.target instanceof HTMLElement && event.target.matches('[data-block-id], [data-node-id]')) {
          selectEditorTarget(event.target);
          event.preventDefault();
          return;
        }
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
        const target = document.querySelector('[data-editor-selected="true"]');
        if (target instanceof HTMLElement && target.hasAttribute('data-node-id') && target.dataset.positioned !== 'true') {
          announceEditor('自動配置のパーツです。自由配置へ切り替えると矢印キーで調整できます。');
          return;
        }
        const boundary = target instanceof HTMLElement ? target.offsetParent : null;
        if (!(target instanceof HTMLElement) || !(boundary instanceof HTMLElement)) return;
        const targetRect = target.getBoundingClientRect();
        const boundaryRect = boundary.getBoundingClientRect();
        if (boundaryRect.width <= 0 || boundaryRect.height <= 0) return;
        const amount = event.shiftKey ? 5 : 1;
        let x = (targetRect.left - boundaryRect.left) / boundaryRect.width * 100;
        let y = (targetRect.top - boundaryRect.top) / boundaryRect.height * 100;
        let width = targetRect.width / boundaryRect.width * 100;
        let height = targetRect.height / boundaryRect.height * 100;
        if (event.altKey) {
          if (event.key === 'ArrowLeft') width = clamp(width - amount, 5, 100 - x);
          if (event.key === 'ArrowRight') width = clamp(width + amount, 5, 100 - x);
          if (event.key === 'ArrowUp') height = clamp(height - amount, 5, 100 - y);
          if (event.key === 'ArrowDown') height = clamp(height + amount, 5, 100 - y);
        } else {
          if (event.key === 'ArrowLeft') x = clamp(x - amount, 0, 100 - width);
          if (event.key === 'ArrowRight') x = clamp(x + amount, 0, 100 - width);
          if (event.key === 'ArrowUp') y = clamp(y - amount, 0, 100 - height);
          if (event.key === 'ArrowDown') y = clamp(y + amount, 0, 100 - height);
        }
        target.style.left = x + '%';
        target.style.top = y + '%';
        target.style.width = width + '%';
        target.style.height = height + '%';
        parent.postMessage({
          type: 'ultimate-freestyle:move-component',
          component_type: target.hasAttribute('data-node-id') ? 'scene' : 'canvas',
          component_id: target.getAttribute('data-node-id') || target.getAttribute('data-block-id') || '',
          frame: { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, width: Math.round(width * 10) / 10, height: Math.round(height * 10) / 10 }
        }, location.origin);
        announceEditor('x ' + Math.round(x * 10) / 10 + '%、y ' + Math.round(y * 10) / 10 + '%、幅 ' + Math.round(width * 10) / 10 + '%、高さ ' + Math.round(height * 10) / 10 + '%。');
        event.preventDefault();
        return;
      }
      const activeModal = shortcuts instanceof HTMLElement && !shortcuts.hidden
        ? shortcuts
        : completion instanceof HTMLElement && !completion.hidden
          ? completion
          : null;
      if (activeModal) {
        if (event.key === 'Escape') {
          if (activeModal === shortcuts) hideShortcuts(); else hideCompletion();
          event.preventDefault();
        } else if (event.key === 'Tab') {
          trapModalFocus(event, activeModal);
        }
        return;
      }
      if (presentationResume instanceof HTMLButtonElement && !presentationResume.hidden) return;
      if (voiceUnlock instanceof HTMLButtonElement && !voiceUnlock.hidden && [' ', 'Enter'].includes(event.key)) {
        event.preventDefault();
        voiceUnlock.click();
        return;
      }
      const target = event.target;
      const interactive = target instanceof Element ? target.closest('button, a, input, select, textarea, summary, details') : null;
      if (interactive instanceof HTMLInputElement || interactive instanceof HTMLSelectElement || interactive instanceof HTMLTextAreaElement) return;
      if (interactive instanceof HTMLElement && [' ', 'Enter'].includes(event.key)) return;
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(event.key)) {
        event.preventDefault();
        if (!started && preludeStart instanceof HTMLButtonElement && !preludeStart.disabled) preludeStart.click();
        else advance();
      }
      else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(event.key)) { event.preventDefault(); document.querySelector('#prev').click(); }
      else if (event.key === 'Home') { event.preventDefault(); if (started) { slide = 0; step = 0; syncUrl(); render(); } }
      else if (event.key === 'End') { event.preventDefault(); if (started) { slide = slides.length - 1; step = DECK.slides[slide].revealSteps; syncUrl(); render(); } }
      else if (event.key.toLowerCase() === 'm') { event.preventDefault(); speechButton.click(); }
      else if (event.key.toLowerCase() === 'a') { event.preventDefault(); autoButton.click(); }
      else if (event.key.toLowerCase() === 't') { event.preventDefault(); timerButton.click(); }
      else if (event.key.toLowerCase() === 'f') { event.preventDefault(); fullscreenButton.click(); }
      else if (event.key === '?') { event.preventDefault(); showShortcuts(); }
    });
    let editorDrag = null;
    stage?.addEventListener('pointerdown', (event) => {
      if (!editorFrame || event.button !== 0 || !(event.target instanceof Element)) return;
      const target = event.target.closest('[data-block-id], [data-node-id][data-positioned="true"]');
      if (!(target instanceof HTMLElement)) return;
      if (target.dataset.editorSelected !== 'true') {
        selectEditorTarget(target);
        event.preventDefault();
        return;
      }
      const boundary = target.offsetParent;
      if (!(boundary instanceof HTMLElement)) return;
      const targetRect = target.getBoundingClientRect();
      const boundaryRect = boundary.getBoundingClientRect();
      if (boundaryRect.width <= 0 || boundaryRect.height <= 0) return;
      editorDrag = {
        target,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        boundaryRect,
        x: (targetRect.left - boundaryRect.left) / boundaryRect.width * 100,
        y: (targetRect.top - boundaryRect.top) / boundaryRect.height * 100,
        width: targetRect.width / boundaryRect.width * 100,
        height: targetRect.height / boundaryRect.height * 100,
        mode: target.dataset.editorSelected === 'true' && targetRect.right - event.clientX <= 18 && targetRect.bottom - event.clientY <= 18 ? 'resize' : 'move'
      };
      target.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    });
    stage?.addEventListener('pointermove', (event) => {
      if (!editorDrag || editorDrag.pointerId !== event.pointerId) return;
      const deltaX = (event.clientX - editorDrag.startX) / editorDrag.boundaryRect.width * 100;
      const deltaY = (event.clientY - editorDrag.startY) / editorDrag.boundaryRect.height * 100;
      const snapDrag = (value) => editorGridSnap ? Math.round(value / 5) * 5 : value;
      const x = editorDrag.mode === 'move' ? clamp(snapDrag(editorDrag.x + deltaX), 0, 100 - editorDrag.width) : editorDrag.x;
      const y = editorDrag.mode === 'move' ? clamp(snapDrag(editorDrag.y + deltaY), 0, 100 - editorDrag.height) : editorDrag.y;
      const width = editorDrag.mode === 'resize' ? clamp(snapDrag(editorDrag.width + deltaX), 5, 100 - editorDrag.x) : editorDrag.width;
      const height = editorDrag.mode === 'resize' ? clamp(snapDrag(editorDrag.height + deltaY), 5, 100 - editorDrag.y) : editorDrag.height;
      editorDrag.target.style.left = x + '%';
      editorDrag.target.style.top = y + '%';
      editorDrag.target.style.width = width + '%';
      editorDrag.target.style.height = height + '%';
      parent.postMessage({
        type: 'ultimate-freestyle:move-component',
        component_type: editorDrag.target.hasAttribute('data-node-id') ? 'scene' : 'canvas',
        component_id: editorDrag.target.getAttribute('data-node-id') || editorDrag.target.getAttribute('data-block-id') || '',
        frame: { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, width: Math.round(width * 10) / 10, height: Math.round(height * 10) / 10 }
      }, location.origin);
      event.preventDefault();
    });
    const endEditorDrag = (event) => {
      if (!editorDrag || editorDrag.pointerId !== event.pointerId) return;
      editorDrag.target.releasePointerCapture?.(event.pointerId);
      editorDrag = null;
    };
    stage?.addEventListener('pointerup', endEditorDrag);
    stage?.addEventListener('pointercancel', endEditorDrag);
    stage?.addEventListener('pointerdown', (event) => {
      if (visibilityPause) return;
      if (!started || editorFrame || event.pointerType === 'mouse' || !event.isPrimary) return;
      if (shortcuts instanceof HTMLElement && !shortcuts.hidden) return;
      if (completion instanceof HTMLElement && !completion.hidden) return;
      if (event.target instanceof Element && event.target.closest('button, a, input, select, textarea')) return;
      swipeStart = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
      stage.setPointerCapture?.(event.pointerId);
    });
    stage?.addEventListener('pointerup', (event) => {
      if (visibilityPause) { swipeStart = null; return; }
      if (!swipeStart || swipeStart.pointerId !== event.pointerId) return;
      const deltaX = event.clientX - swipeStart.x;
      const deltaY = event.clientY - swipeStart.y;
      swipeStart = null;
      if (Math.abs(deltaX) < 48 || Math.abs(deltaX) < Math.abs(deltaY) * 1.25) return;
      suppressStageClick = true;
      if (deltaX < 0) advance();
      else document.querySelector('#prev').click();
      setTimeout(() => { suppressStageClick = false; }, 0);
    });
    stage?.addEventListener('pointercancel', () => { swipeStart = null; });
    stage?.addEventListener('click', (event) => {
      if (visibilityPause) return;
      if (suppressStageClick) { suppressStageClick = false; return; }
      if (editorFrame) {
        const target = event.target instanceof Element ? event.target.closest('[data-node-id], [data-block-id]') : null;
        if (!(target instanceof HTMLElement)) return;
        selectEditorTarget(target);
        return;
      }
      if (getSelection()?.toString() || (shortcuts instanceof HTMLElement && !shortcuts.hidden)) return;
      if (completion instanceof HTMLElement && !completion.hidden) return;
      if (event.target instanceof Element && event.target.closest('button, a, input, select, textarea, summary, details')) return;
      if (!started) {
        if (preludeStart instanceof HTMLButtonElement && !preludeStart.disabled) preludeStart.click();
        return;
      }
      if (voiceUnlock instanceof HTMLButtonElement && !voiceUnlock.hidden) { speak(); return; }
      advance();
    });
    voiceUnlock?.addEventListener('click', () => { if (visibilityPause) return; if (started) speak(); });
    presentationResume?.addEventListener('click', () => {
      if (!visibilityPause) return;
      const paused = visibilityPause;
      visibilityPause = null;
      presentationResume.hidden = true;
      document.body.dataset.resumePending = 'false';
      if (presenterFooter instanceof HTMLElement) presenterFooter.inert = false;
      if (timerButton instanceof HTMLButtonElement) timerButton.disabled = false;
      unitStartedAt += performance.now() - paused.hiddenAt;
      if (paused.timer) setTimerRunning(true);
      if (paused.audio && activeAudio) activeAudio.play().catch(showVoiceUnlock);
      if (paused.speech && 'speechSynthesis' in window) {
        if (paused.progress) startProgressClock(paused.progress.duration, paused.progress.elapsed, paused.progress.kind);
        speechSynthesis.resume();
      }
      if (paused.delayCallback && paused.delayRemaining !== null) {
        if (paused.progress) startProgressClock(paused.progress.duration, paused.progress.elapsed, paused.progress.kind);
        startVoiceDelay(paused.delayRemaining, paused.delayCallback);
      }
      if (auto && paused.autoRemaining !== null) {
        if (paused.progress) startProgressClock(paused.progress.duration, paused.progress.elapsed, paused.progress.kind);
        startAdvanceTimer(paused.autoRemaining);
      } else if (auto && !paused.audio && !paused.speech && !paused.delayCallback) scheduleAutoAdvance();
      stage?.focus();
    });
    restartButton?.addEventListener('click', () => {
      hideCompletion();
      elapsedAccumulated = 0;
      if (!timerRunning) setTimerRunning(true);
      else startedAt = Date.now();
      slide = 0;
      step = 0;
      syncUrl();
      render();
    });
    dismissCompletionButton?.addEventListener('click', () => {
      hideCompletion();
    });
    addEventListener('visibilitychange', () => {
      if (editorFrame || !started) return;
      if (document.hidden) {
        if (visibilityPause) return;
        const audioPlaying = Boolean(activeAudio && !activeAudio.paused);
        const speechPlaying = 'speechSynthesis' in window && speechSynthesis.speaking && !speechSynthesis.paused;
        if (!timerRunning && !audioPlaying && !speechPlaying && !auto && voiceDelayDeadline === null) return;
        const autoRemaining = autoDeadline === null ? null : Math.max(0, autoDeadline - performance.now());
        const delayRemaining = voiceDelayDeadline === null ? null : Math.max(0, voiceDelayDeadline - performance.now());
        const delayCallback = voiceDelayCallback;
        const progress = pauseProgressClock();
        visibilityPause = { timer: timerRunning, audio: audioPlaying, speech: speechPlaying, auto, autoRemaining, delayRemaining, delayCallback, progress, hiddenAt: performance.now() };
        if (timerRunning) setTimerRunning(false);
        clearTimeout(autoTimer);
        autoDeadline = null;
        clearTimeout(voiceDelayTimer);
        voiceDelayDeadline = null;
        voiceDelayCallback = null;
        if (audioPlaying) activeAudio.pause();
        if (speechPlaying) speechSynthesis.pause();
      } else if (visibilityPause && presentationResume instanceof HTMLButtonElement) {
        presentationResume.hidden = false;
        document.body.dataset.resumePending = 'true';
        if (presenterFooter instanceof HTMLElement) presenterFooter.inert = true;
        if (timerButton instanceof HTMLButtonElement) timerButton.disabled = true;
        presentationResume.focus();
      }
    });
    addEventListener('message', (event) => {
      if (!editorFrame || event.source !== parent || event.origin !== location.origin) return;
      if (event.data?.type === 'ultimate-freestyle:set-position') setPosition(event.data.slide, event.data.step, false);
      else if (event.data?.type === 'ultimate-freestyle:set-editor-selection' && typeof event.data.component_id === 'string') setEditorSelection(event.data.component_id);
      else if (event.data?.type === 'ultimate-freestyle:set-editor-options') {
        editorGridSnap = event.data.grid_snap === true;
        document.body.dataset.editorGrid = String(editorGridSnap);
      }
      else if (event.data?.type === 'ultimate-freestyle:preview-fields') previewDraft(event.data);
      else if (event.data?.type === 'ultimate-freestyle:preview-scene-component') previewSceneComponent(event.data);
      else if (event.data?.type === 'ultimate-freestyle:preview-canvas-block') previewCanvasBlock(event.data);
      else if (event.data?.type === 'ultimate-freestyle:preview-composition') previewComposition(event.data);
      else if (event.data?.type === 'ultimate-freestyle:preview-typography') previewTypography(event.data);
      else if (event.data?.type === 'ultimate-freestyle:preview-template') previewTemplate(event.data);
      else if (event.data?.type === 'ultimate-freestyle:preview-appearance') previewAppearance(event.data);
      else if (event.data?.type === 'ultimate-freestyle:preview-narration-settings') previewNarrationSettings(event.data);
      else if (event.data?.type === 'ultimate-freestyle:preview-narration-segment') previewNarrationSegment(event.data);
      else if (event.data?.type === 'ultimate-freestyle:save-status' && typeof event.data.message === 'string') announceEditor(event.data.message);
    });
    addEventListener('popstate', restore);
    if ('ResizeObserver' in window) new ResizeObserver(scheduleFit).observe(document.querySelector('.stage'));
    document.fonts?.ready.then(scheduleFit);
    setTimeout(scheduleFit, 300);
    preludeStart?.addEventListener('click', () => {
      started = true;
      prelude.hidden = true;
      elapsedAccumulated = 0;
      if (!timerRunning) setTimerRunning(true);
      else startedAt = Date.now();
      history.pushState(null, '', '?slide=1&step=0');
      slide = 0;
       step = 0;
       render();
       stage?.focus({ preventScroll: true });
     });
    setInterval(() => { if (started) updateElapsed(); }, 250);
    preparePrelude();
    restore();
  })();</script>
</body>
</html>`;
}
