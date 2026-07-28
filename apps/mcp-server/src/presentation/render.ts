import type {
  ProjectRecord,
  SlideBlock,
  SlideSceneNode
} from "../projects/schema";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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

  const flushList = () => {
    if (list.length === 0) return;
    blocks.push(`<ul>${list.map((item) => `<li>${item}</li>`).join("")}</ul>`);
    list = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("- ")) {
      list.push(renderInlineText(trimmed.slice(2)));
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
  | "scientific";
type FontPreset =
  | "system-sans"
  | "gothic"
  | "rounded"
  | "mincho"
  | "serif"
  | "monospace"
  | "display";
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
    return `<uf-hero ${attributes} data-align="${node.align}">${node.eyebrow === null ? "" : `<p class="component-eyebrow">${escapeHtml(node.eyebrow)}</p>`}<h2>${escapeHtml(node.heading)}</h2>${node.subtitle === null ? "" : `<p class="component-subtitle">${escapeHtml(node.subtitle)}</p>`}</uf-hero>`;
  }
  if (node.kind === "markdown") {
    return `<uf-markdown ${attributes}>${renderTextBlocks(node.markdown)}</uf-markdown>`;
  }
  if (node.kind === "image") {
    const src = assetUrls[node.asset_id] ?? `/media/${node.asset_id}`;
    return `<uf-image ${attributes}><img src="${escapeHtml(src)}" alt="${escapeHtml(node.alt_text)}" data-fit="${node.fit}">${node.caption === null ? "" : `<small>${escapeHtml(node.caption)}</small>`}</uf-image>`;
  }
  if (node.kind === "shape") {
    return `<uf-shape ${attributes} data-shape="${node.shape}">${node.label === null ? "" : `<span>${escapeHtml(node.label)}</span>`}</uf-shape>`;
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

  const runtimeDeck = {
    projectId: project.project_id,
    version: project.version,
    title: project.document.title,
    shortTitle: deck.short_title,
    layout: deck.layout,
    accent: deck.accent,
    slides: deck.slides.map((slide) => {
      const segments = slide.narration?.segments.map((segment) => {
        const profile =
          (segment.voice_profile_id
            ? profiles.get(segment.voice_profile_id)
            : undefined) ?? defaultProfile;
        return {
          ...segment,
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
          }
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
    <p class="eyebrow">${String(index + 1).padStart(2, "0")} · ${escapeHtml(slide.title)}</p>
    <div class="slide-content">${renderTextBlocks(slide.content_markdown)}</div>
    ${slide.reveal_blocks.map((block) => `<div class="reveal-block" data-reveal="${block.at}" data-reveal-at="${block.at}" data-animation="${revealAnimation}" aria-hidden="true">${renderTextBlocks(block.markdown)}</div>`).join("\n")}
  </div>
  <aside class="slide-sidebar" data-region="sidebar" data-fit-content data-fit-id="flow:sidebar" data-fit-region="sidebar"${slide.sidebar_markdown === null ? " hidden" : ""}>
    ${slide.sidebar_markdown === null ? "" : renderTextBlocks(slide.sidebar_markdown)}
  </aside>`;
      return `<article class="slide tone-${slide.tone}" data-slide="${index}" data-slide-id="${escapeHtml(slide.id)}" data-template-id="${escapeHtml(templateId ?? `builtin-${deck.layout}`)}" data-user-template="${String(template !== undefined && template !== null)}" data-region-layout="${regionLayout}" data-composition="${composition?.mode ?? "flow"}" data-tone="${slide.tone}" data-visual-preset="${appearance.visual_preset}" data-body-font="${appearance.body_font}" data-heading-font="${appearance.heading_font}" data-density="${appearance.density}" data-motion-style="${appearance.motion_style}" data-animation="${enterAnimation}" data-state="inactive" style="--body-weight:${appearance.body_weight};--heading-weight:${appearance.heading_weight};--body-line-height:${appearance.line_height};--body-letter-spacing:${appearance.letter_spacing_em}em" hidden>
  ${content}
  <section class="narration" data-region="narration" data-display="${narrationDisplay}" data-placement="${narrationStyle.placement}" data-size="${narrationStyle.size}" data-text-align="${narrationStyle.text_align}" data-speaker-visible="${String(narrationStyle.speaker_visible)}" data-progress-visible="${String(narrationStyle.progress_visible)}" data-fit-content data-fit-id="narration" data-fit-region="narration"${narrationDisplay === "inline" ? " data-fit-scroll=\"true\"" : ""} data-active="${String(initialNarrationSegment !== undefined || narrationDisplay === "inline")}" style="--narration-text-scale:${narrationStyle.text_scale};--narration-max-lines:${narrationStyle.max_lines}" aria-live="polite">
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
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-saijiyu-static'; script-src 'nonce-saijiyu-static'; media-src 'self' blob:; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors ${options.frameAncestors ?? "'none'"}">
  <title>${escapeHtml(project.document.title)}</title>
  <style nonce="saijiyu-static">
    :root { color-scheme: dark; --accent: ${escapeHtml(deck.accent)}; font-family: Inter, "Noto Sans JP", system-ui, sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; overflow: hidden; background: #090d14; color: #f8fafc; }
    button, input { font: inherit; }
    .app { width: 100%; height: 100vh; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; gap: 10px; padding: 12px; }
    body[data-editor-frame="true"] .app { grid-template-rows: minmax(0, 1fr); gap: 0; padding: 0; }
    body[data-editor-frame="true"] header, body[data-editor-frame="true"] footer { display: none; }
    body[data-editor-frame="true"] .stage-wrap { grid-row: 1; }
    body[data-editor-frame="true"] .stage { width: 100%; height: 100%; border: 0; box-shadow: none; }
    header, footer { display: flex; align-items: center; gap: 12px; min-height: 36px; color: #a9b5c7; }
    header strong { color: #fff; }
    header .time { margin-left: auto; font-variant-numeric: tabular-nums; }
    .stage-wrap { min-height: 0; display: grid; place-items: center; }
    .stage { position: relative; width: min(100%, calc((100vh - 118px) * 16 / 9)); aspect-ratio: 16 / 9; overflow: hidden; container: presentation-stage / size; border: 1px solid #334155; background: #111827; box-shadow: 0 18px 60px #0009; }
    .slide { --template-font-scale: 1; --template-spacing: 1; --component-font-scale: 1; --fit-scale: 1; --body-weight: 400; --heading-weight: 800; --body-line-height: 1.5; --body-letter-spacing: 0; --theme-background: #111827; --theme-surface: #05080dcc; --theme-foreground: #f8fafc; --theme-muted: #a9b5c7; --theme-border: #ffffff25; --density-scale: 1; --motion-duration: .4s; --motion-ease: cubic-bezier(.2,.8,.2,1); --slide-base: var(--theme-background); position: absolute; inset: 0; display: grid; grid-template: minmax(0, 1fr) auto / minmax(0, 1fr) minmax(0, 28%); overflow: hidden; background: var(--slide-base); color: var(--theme-foreground); font-family: var(--font-body, system-ui, sans-serif); font-weight: var(--body-weight); line-height: var(--body-line-height); letter-spacing: var(--body-letter-spacing); }
    .slide::before, .slide::after { content: ""; position: absolute; z-index: 0; pointer-events: none; }
    .slide > * { position: relative; z-index: 1; }
    .slide[data-user-template="true"] { --accent: var(--template-accent); --theme-background: var(--template-background); --theme-surface: var(--template-surface); --theme-foreground: var(--template-foreground); --theme-muted: var(--template-muted); --slide-base: var(--theme-background); grid-template-columns: minmax(0, 1fr) var(--template-sidebar-width); border-radius: var(--template-radius); }
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
    .slide[data-heading-font="system-sans"] { --font-heading: Inter, "Noto Sans JP", system-ui, sans-serif; }
    .slide[data-heading-font="gothic"] { --font-heading: "BIZ UDPGothic", "Yu Gothic", "Hiragino Kaku Gothic ProN", sans-serif; }
    .slide[data-heading-font="rounded"] { --font-heading: "M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", ui-rounded, sans-serif; }
    .slide[data-heading-font="mincho"] { --font-heading: "Noto Serif JP", "Yu Mincho", "Hiragino Mincho ProN", serif; }
    .slide[data-heading-font="serif"] { --font-heading: Georgia, "Noto Serif JP", "Yu Mincho", serif; }
    .slide[data-heading-font="monospace"] { --font-heading: "BIZ UDGothic", "SFMono-Regular", Consolas, monospace; }
    .slide[data-heading-font="display"] { --font-heading: "Arial Black", "Hiragino Kaku Gothic StdN", "Yu Gothic", sans-serif; }
    .slide[data-user-template="false"][data-visual-preset="paper"] { --theme-background: #f7f3ea; --theme-surface: #ebe5d8; --theme-foreground: #1d2735; --theme-muted: #596474; --theme-border: #23304433; --slide-base: var(--theme-background); }
    .slide[data-user-template="false"][data-visual-preset="editorial"] { --theme-background: #f2eadb; --theme-surface: #e5d8c3; --theme-foreground: #201b18; --theme-muted: #665b52; --theme-border: #4d332d40; --slide-base: var(--theme-background); }
    .slide[data-user-template="false"][data-visual-preset="neon"] { --theme-background: #09071b; --theme-surface: #161130dd; --theme-foreground: #f4f2ff; --theme-muted: #b7afd6; --theme-border: color-mix(in srgb, var(--accent) 52%, transparent); --slide-base: var(--theme-background); }
    .slide[data-user-template="false"][data-visual-preset="retro-game"] { --theme-background: #171a20; --theme-surface: #262b35; --theme-foreground: #fff7d6; --theme-muted: #cac2a0; --theme-border: #fff7d666; --slide-base: var(--theme-background); }
    .slide[data-user-template="false"][data-visual-preset="soft-pop"] { --theme-background: #f7edf5; --theme-surface: #fff8fdde; --theme-foreground: #34243a; --theme-muted: #745f7b; --theme-border: #704b7d33; --slide-base: var(--theme-background); }
    .slide[data-user-template="false"][data-visual-preset="scientific"] { --theme-background: #edf4f5; --theme-surface: #f8fcfcdd; --theme-foreground: #152c35; --theme-muted: #536e76; --theme-border: #1b596a33; --slide-base: var(--theme-background); }
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
    .slide[data-region-layout="single"] { grid-template-columns: 1fr; }
    .slide[data-region-layout="single"] .slide-sidebar { display: none; }
    .slide[data-region-layout="sidebar-left"] { grid-template-columns: var(--template-sidebar-width, 28%) minmax(0, 1fr); }
    .slide[data-region-layout="sidebar-left"] .slide-main { grid-column: 2; grid-row: 1; }
    .slide[data-region-layout="sidebar-left"] .slide-sidebar { grid-column: 1; grid-row: 1; border-left: 0; border-right: 1px solid #ffffff25; }
    .slide[data-region-layout="lower-third"] { grid-template: minmax(0, 1fr) auto auto / 1fr; }
    .slide[data-region-layout="lower-third"] .slide-sidebar { grid-row: 2; padding: 2% 6%; border-top: 1px solid #ffffff25; border-left: 0; }
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
    :is(uf-hero,uf-markdown,uf-card,uf-metric,uf-quote,uf-callout,uf-bar-chart,uf-timeline)[data-fit-content] { --fit-scale: 1; }
    uf-hero h2 { max-width: 16ch; margin: 0; font-family: var(--font-heading); font-size: calc(7.1cqw * var(--template-font-scale) * var(--component-font-scale) * var(--fit-scale)); font-weight: var(--heading-weight); line-height: .96; letter-spacing: -.055em; text-wrap: balance; overflow-wrap: anywhere; }
    .component-eyebrow, .component-label { margin: 0; color: var(--accent); font: 850 calc(1.05cqw * var(--template-font-scale) * var(--component-font-scale) * var(--fit-scale))/1.2 ui-monospace, monospace; letter-spacing: .14em; text-transform: uppercase; }
    .component-subtitle { max-width: 48rem; margin: 0; color: color-mix(in srgb, currentColor 68%, transparent); font-size: calc(1.8cqw * var(--template-font-scale) * var(--component-font-scale) * var(--fit-scale)); line-height: var(--body-line-height); overflow-wrap: anywhere; }
    uf-markdown h2, uf-markdown h3, uf-markdown h4, uf-card h2, uf-card h3, uf-card h4 { margin: 0 0 .45em; font-family: var(--font-heading); font-size: calc(3.7cqw * var(--template-font-scale) * var(--component-font-scale) * var(--fit-scale)); font-weight: var(--heading-weight); line-height: 1.05; overflow-wrap: anywhere; }
    uf-markdown p, uf-markdown li, uf-card p, uf-card li, uf-callout p { margin: 0; font-size: calc(1.55cqw * var(--template-font-scale) * var(--component-font-scale) * var(--fit-scale)); line-height: var(--body-line-height); overflow-wrap: anywhere; }
    uf-card, uf-callout { gap: calc(.55em * var(--fit-scale)); padding: calc(2.1cqw * var(--density-scale) * var(--fit-scale)); border: max(1px, .07cqw) solid var(--theme-border); border-radius: 1.8cqw; background: var(--theme-surface); backdrop-filter: blur(18px); }
    uf-card[data-variant="accent"] { border-color: color-mix(in srgb, var(--accent) 70%, transparent); background: color-mix(in srgb, var(--accent) 18%, transparent); }
    uf-card[data-variant="glass"] { background: #ffffff14; box-shadow: 0 18px 55px #0005; }
    uf-metric { justify-content: center; gap: .5em; padding: calc(1.8cqw * var(--density-scale)); }
    uf-metric p { display: flex; align-items: baseline; gap: .3em; margin: 0; }
    uf-metric strong { font: 900 calc(6.4cqw * var(--template-font-scale) * var(--component-font-scale) * var(--fit-scale))/.9 ui-monospace, monospace; letter-spacing: -.07em; }
    uf-metric span { color: var(--accent); font-size: calc(1.8cqw * var(--template-font-scale) * var(--component-font-scale) * var(--fit-scale)); font-weight: 850; }
    uf-metric small { color: color-mix(in srgb, currentColor 62%, transparent); font-size: calc(1.3cqw * var(--template-font-scale) * var(--component-font-scale) * var(--fit-scale)); }
    uf-metric[data-emphasis="signal"] { color: #17120a; background: var(--accent); }
    uf-quote { justify-content: center; gap: 1em; padding-left: 6%; border-left: .65cqw solid var(--accent); }
    uf-quote blockquote { margin: 0; font-family: var(--font-heading); font-size: calc(3.8cqw * var(--template-font-scale) * var(--component-font-scale) * var(--fit-scale)); font-weight: var(--heading-weight); line-height: 1.2; text-wrap: balance; overflow-wrap: anywhere; }
    uf-quote cite { color: color-mix(in srgb, currentColor 60%, transparent); font-style: normal; }
    uf-callout[data-variant="success"] { --callout-color: #62e6ad; }
    uf-callout[data-variant="warning"] { --callout-color: #ffd166; }
    uf-callout[data-variant="danger"] { --callout-color: #ff786f; }
    uf-callout { border-left: .35cqw solid var(--callout-color, #65ccff); }
    uf-callout h3 { margin: 0; font-family: var(--font-heading); font-size: calc(2.5cqw * var(--template-font-scale) * var(--component-font-scale) * var(--fit-scale)); font-weight: var(--heading-weight); overflow-wrap: anywhere; }
    uf-image { gap: .5em; margin: 0; }
    uf-image { overflow: hidden; }
    uf-image img { display: block; width: 100%; height: 100%; min-height: 0; flex: 1; border-radius: inherit; }
    uf-image img[data-fit="contain"] { object-fit: contain; }
    uf-image img[data-fit="cover"] { object-fit: cover; }
    uf-image img[data-fit="fill"] { object-fit: fill; }
    uf-image small { color: color-mix(in srgb, currentColor 62%, transparent); font-size: calc(1cqw * var(--template-font-scale)); }
    uf-shape[data-shape="ellipse"] { border-radius: 50%; }
    uf-shape[data-shape="line"] { height: 0 !important; min-height: 0; border-width: 0 0 2px !important; overflow: visible; }
    uf-shape span { margin: auto; }
    uf-bar-chart { justify-content: center; gap: 1.35cqh; }
    uf-bar-row { display: grid; grid-template-columns: minmax(5em, 22%) 1fr auto; align-items: center; gap: 1em; }
    uf-bar-row span, uf-bar-row strong { font: 750 calc(1.35cqw * var(--template-font-scale) * var(--component-font-scale) * var(--fit-scale))/1.2 ui-monospace, monospace; overflow-wrap: anywhere; }
    uf-bar-row i { height: 1.65cqh; border-radius: 99px; background: linear-gradient(90deg, var(--bar-color) var(--bar-width), #ffffff15 var(--bar-width)); box-shadow: 0 0 1.8cqw color-mix(in srgb, var(--bar-color) 28%, transparent); }
    uf-timeline { justify-content: center; gap: 1.35cqh; }
    uf-timeline-item { display: grid; grid-template-columns: minmax(4em, 16%) minmax(0, 1fr); gap: .2em 1.3em; padding-left: 1em; border-left: 3px solid var(--accent); }
    uf-timeline-item small { grid-row: 1 / 3; color: var(--accent); font: 800 calc(1cqw * var(--template-font-scale) * var(--component-font-scale) * var(--fit-scale))/1.4 ui-monospace, monospace; }
    uf-timeline-item strong { font-family: var(--font-heading); font-size: calc(1.65cqw * var(--template-font-scale) * var(--component-font-scale) * var(--fit-scale)); font-weight: var(--heading-weight); overflow-wrap: anywhere; }
    uf-timeline-item p { margin: 0; color: color-mix(in srgb, currentColor 64%, transparent); font-size: calc(1.1cqw * var(--template-font-scale) * var(--component-font-scale) * var(--fit-scale)); overflow-wrap: anywhere; }
    .canvas-block { --fit-scale: 1; position: absolute; display: flex; flex-direction: column; justify-content: flex-start; min-width: 0; min-height: 0; margin: 0; overflow: var(--canvas-overflow); }
    .canvas-block > * { width: 100%; }
    .reveal-block.canvas-block.is-visible { opacity: var(--component-opacity); }
    .canvas-block h2, .canvas-block h3, .canvas-block h4 { margin: 0 0 .35em; font-family: var(--font-heading); line-height: 1.08; font-size: calc(3.55cqw * var(--template-font-scale) * var(--component-font-scale) * var(--fit-scale)); font-weight: var(--heading-weight); overflow-wrap: anywhere; }
    .canvas-block p, .canvas-block li { margin: 0; font-size: calc(1.7cqw * var(--template-font-scale) * var(--component-font-scale) * var(--fit-scale)); line-height: var(--body-line-height); overflow-wrap: anywhere; }
    .canvas-block p + p { margin-top: .55em; }
    .canvas-block ul { margin: 0; padding-left: 1.25em; }
    figure.canvas-block img { display: block; width: 100%; height: 100%; }
    figure.canvas-block img[data-fit="contain"] { object-fit: contain; }
    figure.canvas-block img[data-fit="cover"] { object-fit: cover; }
    figure.canvas-block img[data-fit="fill"] { object-fit: fill; }
    .canvas-block[data-shape="ellipse"] { border-radius: 50%; }
    .canvas-block[data-shape="line"] { height: 0 !important; min-height: 0; border-width: 0 0 2px !important; border-radius: 0; overflow: visible; }
    .canvas-block[data-shape] span { margin: auto; font-size: calc(1.5cqw * var(--template-font-scale) * var(--component-font-scale) * var(--fit-scale)); line-height: 1.3; overflow-wrap: anywhere; }
    .slide[hidden] { display: none; }
    .slide-main { --fit-scale: 1; min-width: 0; min-height: 0; padding: calc(7% * var(--density-scale)) calc(7% * var(--density-scale)) calc(4% * var(--density-scale)); overflow: hidden; }
    .slide-sidebar { --fit-scale: 1; min-width: 0; min-height: 0; padding: calc(9% * var(--density-scale)) calc(8% * var(--density-scale)); border-left: max(1px, .07cqw) solid var(--theme-border); background: var(--theme-surface); color: var(--theme-muted); overflow: hidden; }
    .slide-sidebar[hidden] { display: none; }
    .slide:has(.slide-sidebar[hidden]) { grid-template-columns: 1fr; }
    .narration { --fit-scale: 1; grid-column: 1 / -1; display: grid; grid-template: auto 1fr auto / minmax(0, 1fr); gap: .55cqh; min-width: 0; min-height: 0; max-height: 29cqh; padding: calc(1.8cqh * var(--density-scale)) 5%; border-top: max(1px, .07cqw) solid var(--theme-border); background: color-mix(in srgb, var(--theme-surface) 94%, transparent); color: var(--theme-foreground); font-size: calc(1.75cqw * var(--template-font-scale) * var(--narration-text-scale) * var(--fit-scale)); line-height: 1.45; text-align: start; overflow: hidden; }
    .narration[data-active="false"]:not([data-display="inline"]) { display: none; }
    .narration[data-size="compact"] { max-height: 15cqh; padding-block: 1.05cqh; font-size: calc(1.35cqw * var(--template-font-scale) * var(--narration-text-scale) * var(--fit-scale)); }
    .narration[data-size="large"] { max-height: 34cqh; padding-block: 2.2cqh; font-size: calc(2.15cqw * var(--template-font-scale) * var(--narration-text-scale) * var(--fit-scale)); }
    .narration[data-text-align="center"] { text-align: center; }
    .narration[data-placement="overlay-bottom"] { position: absolute; z-index: 30; right: 4%; bottom: 3%; left: 4%; width: auto; max-height: 30%; border: max(1px, .07cqw) solid var(--theme-border); border-radius: 1.2cqw; box-shadow: 0 1.1cqw 3cqw #0008; }
    .narration[data-placement="sidebar"] { position: absolute; z-index: 30; top: 5%; right: 3%; bottom: 5%; width: min(36%, 34cqw); max-height: none; border: max(1px, .07cqw) solid var(--theme-border); border-radius: 1.1cqw; }
    .narration-speaker { justify-self: start; max-width: 80%; padding: .35cqh .8cqw; border-radius: .4cqw; background: var(--accent); color: #10131a; font-size: .68em; font-weight: 850; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .narration[data-speaker-visible="false"] .narration-speaker, .narration-speaker[hidden] { display: none; }
    .narration-track { min-width: 0; min-height: 0; overflow: hidden; }
    .narration-text { display: -webkit-box; margin: 0; overflow: hidden; overflow-wrap: anywhere; -webkit-box-orient: vertical; -webkit-line-clamp: var(--narration-max-lines); }
    .narration-inline-progress { align-self: end; display: block; width: 0; height: .32cqh; border-radius: 99px; background: var(--accent); transition: width .15s linear; }
    .narration[data-progress-visible="false"] .narration-inline-progress { display: none; }
    .narration[data-display="dialogue"] { margin: 0 4% 3%; border: max(1px, .07cqw) solid var(--theme-border); border-radius: 1.1cqw; background: linear-gradient(135deg, color-mix(in srgb, var(--theme-surface) 96%, #08111f), var(--theme-surface)); box-shadow: 0 .8cqw 2.3cqw #0007, inset 0 1px #ffffff16; }
    .narration[data-display="commentary"] { max-height: 19cqh; padding-block: 1.35cqh; border-top-color: color-mix(in srgb, var(--accent) 45%, transparent); text-align: center; font-weight: 800; text-shadow: 0 .15cqw .7cqw #000; }
    .narration[data-display="subtitle"] { max-height: 16cqh; margin: 0 9% 2.5%; border: 0; border-radius: .6cqw; background: #000c; text-align: center; font-weight: 750; text-shadow: 0 .12cqw .45cqw #000; }
    .narration[data-display="minimal"] { justify-self: center; width: fit-content; max-width: 82%; max-height: 13cqh; margin-bottom: 2.5%; padding: .8cqh 1.4cqw; border: 0; border-radius: 99px; background: #000a; text-align: center; }
    .narration[data-display="inline"] { max-height: 25cqh; padding-block: 1.1cqh; border-top-color: #cbd5e1; background: #f8fafcee; color: #172033; font-size: calc(1.1cqw * var(--template-font-scale) * var(--narration-text-scale) * var(--fit-scale)); }
    .narration[data-display="inline"] .narration-track { display: grid; gap: .32em; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; }
    .narration-segment { opacity: .34; transition: opacity var(--motion-duration) var(--motion-ease), translate var(--motion-duration) var(--motion-ease); overflow-wrap: anywhere; }
    .narration-segment.is-current { opacity: 1; translate: .35em 0; font-weight: 800; }
    .eyebrow { margin: 0 0 4%; color: var(--accent); font-size: calc(1cqw * var(--template-font-scale) * var(--fit-scale)); font-weight: 800; letter-spacing: .16em; text-transform: uppercase; }
    .slide-content h2, .slide-content h3, .slide-content h4 { margin: 0 0 .5em; font-family: var(--font-heading); line-height: 1.12; font-size: calc(4.4cqw * var(--template-font-scale) * var(--fit-scale)); font-weight: var(--heading-weight); overflow-wrap: anywhere; }
    .slide-content p, .slide-content li { font-size: calc(2.05cqw * var(--template-font-scale) * var(--fit-scale)); line-height: var(--body-line-height); overflow-wrap: anywhere; }
    .slide-content ul { padding-left: 1.3em; }
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
    .reveal-block p, .reveal-block li { font-size: calc(1.65cqw * var(--template-font-scale) * var(--fit-scale)); line-height: var(--body-line-height); overflow-wrap: anywhere; }
    .slide-sidebar h2, .slide-sidebar h3, .slide-sidebar h4 { color: var(--accent); }
    .slide-sidebar p, .slide-sidebar li { font-size: calc(1.1cqw * var(--template-font-scale) * var(--fit-scale)); line-height: var(--body-line-height); overflow-wrap: anywhere; }
    .slide[data-composition="flow"].tone-light { background: #f6f1e8; color: #162033; }
    .slide[data-composition="flow"].tone-quiet { background: #e9eef5; color: #162033; }
    .slide[data-composition="flow"].tone-signal { background: var(--accent); color: #10131a; }
    [data-layout="minimal"] .stage { background: white; }
    [data-layout="minimal"] .slide[data-user-template="false"][data-composition="flow"] { background: var(--theme-background); color: var(--theme-foreground); }
    [data-layout="minimal"] .slide[data-user-template="false"] .slide-sidebar { background: var(--theme-surface); color: var(--theme-foreground); border-color: var(--theme-border); }
    [data-layout="cinematic"] .slide-sidebar { display: none; }
    [data-layout="cinematic"] .slide { grid-template-columns: 1fr; }
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
    .progress { flex: 1; max-width: 520px; height: 7px; overflow: hidden; border-radius: 99px; background: #263244; }
    .progress i, .voice-progress i { display: block; width: 0; height: 100%; background: var(--accent); transition: width .25s ease; }
    .voice-progress { width: 120px; height: 5px; overflow: hidden; border-radius: 99px; background: #263244; }
    .controls { display: flex; align-items: center; gap: 6px; }
    button { min-width: 40px; min-height: 34px; border: 1px solid #3a485d; border-radius: 8px; background: #172131; color: #fff; cursor: pointer; }
    button:hover { border-color: var(--accent); }
    label { display: flex; align-items: center; gap: 5px; font-size: 12px; }
    input[type="range"] { width: 80px; accent-color: var(--accent); }
    @media (max-width: 680px) { .app { padding: 6px; } header .meta { display: none; } .voice-progress { width: 70px; } }
    @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; scroll-behavior: auto !important; transition: none !important; } }
  </style>
</head>
<body data-layout="${escapeHtml(deck.layout)}" data-editor-frame="${String(options.editorFrame ?? false)}">
  <main class="app">
    <header><strong>${escapeHtml(deck.short_title)}</strong><span class="meta">v${project.version}</span><span class="time"><span id="elapsed">00:00</span> / <span id="expected">00:00</span></span></header>
    <div class="stage-wrap"><div class="stage" aria-label="${escapeHtml(project.document.title)}">${slideHtml}</div></div>
    <footer>
      <span id="counter">1 / ${deck.slides.length}</span><div class="progress"><i id="progress"></i></div>
      <div class="voice-progress" title="読み上げ進捗"><i id="voice-progress"></i></div>
      <div class="controls">
        <button id="prev" aria-label="前へ">←</button><button id="next" aria-label="次へ">→</button>
        <button id="speech" aria-pressed="true" title="自動読み上げ">音声</button>
        <button id="auto" aria-pressed="false" title="自動送り">自動</button>
        <label>音量 <input id="volume" type="range" min="0" max="1" step="0.05" value="1"></label>
      </div>
    </footer>
  </main>
  <script nonce="saijiyu-static">const DECK=${safeJson(runtimeDeck)};
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
    const volume = document.querySelector('#volume');
    const speechButton = document.querySelector('#speech');
    const autoButton = document.querySelector('#auto');
    const volumeKey = 'ultimate-freestyle:narration-volume';
    const editorFrame = document.body.dataset.editorFrame === 'true';
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let slide = 0, step = 0, speech = true, auto = false, startedAt = Date.now(), voiceTimer, activeAudio, fitFrame;
    const units = DECK.slides.reduce((sum, item) => sum + item.revealSteps + 1, 0);
    const format = (seconds) => String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(Math.floor(seconds % 60)).padStart(2, '0');
    const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum);
    const currentUnit = () => DECK.slides.slice(0, slide).reduce((sum, item) => sum + item.revealSteps + 1, 0) + step + 1;
    const narration = () => DECK.slides[slide].narration?.segments.find((item) => item.at === step) ?? null;
    const syncUrl = () => history.pushState(null, '', '?slide=' + (slide + 1) + '&step=' + step);
    const setVoiceProgress = (percent) => {
      const value = clamp(percent, 0, 100) + '%';
      voiceProgress.style.width = value;
      const localProgress = slides[slide]?.querySelector('.narration-inline-progress');
      if (localProgress instanceof HTMLElement) localProgress.style.width = value;
    };
    const stopVoice = () => {
      if ('speechSynthesis' in window) speechSynthesis.cancel();
      clearInterval(voiceTimer);
      if (activeAudio) { activeAudio.pause(); activeAudio.removeAttribute('src'); activeAudio.load(); activeAudio = null; }
      setVoiceProgress(0);
    };
    const finishVoice = () => { clearInterval(voiceTimer); setVoiceProgress(100); if (auto) setTimeout(advance, 350); };
    const advance = () => {
      const current = DECK.slides[slide];
      if (step < current.revealSteps) step += 1;
      else if (slide < slides.length - 1) { slide += 1; step = 0; }
      else return false;
      syncUrl(); render(); return true;
    };
    const speakWithBrowser = (segment) => {
      if (!('speechSynthesis' in window)) return;
      const tuning = segment.effectiveTuning || {};
      const utterance = new SpeechSynthesisUtterance(segment.text);
      utterance.lang = 'ja-JP';
      utterance.rate = clamp(Number(tuning.speedScale || 1), .5, 2);
      utterance.pitch = clamp(1 + Number(tuning.pitchScale || 0) * 4, .5, 1.5);
      utterance.volume = clamp(Number(volume.value) * Number(tuning.volumeScale || 1), 0, 1);
      const estimated = Math.max(1.5, segment.text.length / (7 * utterance.rate));
      const begin = performance.now();
      voiceTimer = setInterval(() => setVoiceProgress((performance.now() - begin) / 10 / estimated), 100);
      utterance.onend = finishVoice;
      utterance.onerror = () => { clearInterval(voiceTimer); setVoiceProgress(0); };
      speechSynthesis.speak(utterance);
    };
    const speak = () => {
      stopVoice(); const segment = narration();
      if (!speech || !segment) return;
      if (!segment.audio_src) { speakWithBrowser(segment); return; }
      const player = new Audio(segment.audio_src);
      const tuning = segment.effectiveTuning || {};
      activeAudio = player;
      player.preload = 'auto';
      player.volume = clamp(Number(volume.value) * Number(tuning.volumeScale || 1), 0, 1);
      player.addEventListener('timeupdate', () => {
        if (Number.isFinite(player.duration) && player.duration > 0) setVoiceProgress(player.currentTime / player.duration * 100);
      });
      player.addEventListener('ended', finishVoice, { once: true });
      const fallback = () => {
        if (activeAudio !== player) return;
        player.pause(); activeAudio = null; setVoiceProgress(0); speakWithBrowser(segment);
      };
      player.addEventListener('error', fallback, { once: true });
      player.play().catch(fallback);
    };
    const collectOverflow = (target) => {
      const ignoreVertical = target.dataset.fitScroll === 'true';
      return {
        x: Math.max(0, target.scrollWidth - target.clientWidth),
        y: ignoreVertical ? 0 : Math.max(0, target.scrollHeight - target.clientHeight)
      };
    };
    const fitAndReport = () => {
      const currentSlide = slides[slide];
      const diagnostics = [];
      currentSlide.querySelectorAll('[data-fit-content]').forEach((target) => {
        if (!(target instanceof HTMLElement) || target.hidden || target.offsetParent === null) return;
        target.style.setProperty('--fit-scale', '1');
        let scale = 1;
        let overflow = collectOverflow(target);
        while ((overflow.x > 1 || overflow.y > 1) && scale > .45 && target.dataset.fitScroll !== 'true') {
          scale = Math.max(.45, Number((scale - .05).toFixed(2)));
          target.style.setProperty('--fit-scale', String(scale));
          overflow = collectOverflow(target);
        }
        const overflowing = overflow.x > 1 || overflow.y > 1;
        target.dataset.overflow = String(overflowing);
        target.dataset.fitScale = String(scale);
        if (overflowing) diagnostics.push({ id: target.dataset.fitId || '', region: target.dataset.fitRegion || '', overflow_x: overflow.x, overflow_y: overflow.y, fit_scale: scale });
      });
      if (editorFrame && parent !== window) parent.postMessage({ type: 'ultimate-freestyle:render-diagnostics', slide_id: DECK.slides[slide].id, overflows: diagnostics }, location.origin);
    };
    const scheduleFit = () => { cancelAnimationFrame(fitFrame); fitFrame = requestAnimationFrame(() => requestAnimationFrame(fitAndReport)); };
    const setPosition = (nextSlide, nextStep, push) => {
      slide = clamp(Number(nextSlide) - 1, 0, slides.length - 1);
      step = clamp(Number(nextStep), 0, DECK.slides[slide].revealSteps);
      if (push) syncUrl(); else history.replaceState(null, '', '?slide=' + (slide + 1) + '&step=' + step);
      render();
    };
    const render = () => {
      stopVoice(); slides.forEach((item, index) => { const active = index === slide; item.hidden = !active; item.dataset.state = active ? 'active' : 'inactive'; });
      slides[slide].querySelectorAll('[data-reveal]').forEach((item) => { const visible = Number(item.dataset.reveal) <= step; item.classList.toggle('is-visible', visible); item.setAttribute('aria-hidden', String(!visible)); });
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
      progress.style.width = (currentUnit() / units * 100) + '%';
      expected.textContent = format(DECK.slides.slice(0, slide).reduce((sum, item) => sum + item.durationSeconds, 0));
      scheduleFit(); speak();
    };
    const restore = () => { const query = new URLSearchParams(location.search); slide = Math.min(Math.max(Number(query.get('slide') ?? 1) - 1, 0), slides.length - 1); step = Math.min(Math.max(Number(query.get('step') ?? 0), 0), DECK.slides[slide].revealSteps); render(); };
    document.querySelector('#next').addEventListener('click', advance);
    document.querySelector('#prev').addEventListener('click', () => { if (step > 0) step -= 1; else if (slide > 0) { slide -= 1; step = DECK.slides[slide].revealSteps; } else return; syncUrl(); render(); });
    speechButton.addEventListener('click', () => { speech = !speech; speechButton.setAttribute('aria-pressed', String(speech)); render(); });
    autoButton.addEventListener('click', () => { auto = !auto; autoButton.setAttribute('aria-pressed', String(auto)); });
    volume.addEventListener('input', () => { if (activeAudio) { const tuning = narration()?.effectiveTuning || {}; activeAudio.volume = clamp(Number(volume.value) * Number(tuning.volumeScale || 1), 0, 1); } try { localStorage.setItem(volumeKey, volume.value); } catch {} });
    try { volume.value = localStorage.getItem(volumeKey) ?? '1'; } catch {}
    addEventListener('keydown', (event) => { if (['ArrowRight', ' ', 'Enter'].includes(event.key)) { event.preventDefault(); advance(); } else if (event.key === 'ArrowLeft') { document.querySelector('#prev').click(); } });
    addEventListener('message', (event) => { if (!editorFrame || event.source !== parent || event.origin !== location.origin || event.data?.type !== 'ultimate-freestyle:set-position') return; setPosition(event.data.slide, event.data.step, false); });
    addEventListener('popstate', restore);
    if ('ResizeObserver' in window) new ResizeObserver(scheduleFit).observe(document.querySelector('.stage'));
    document.fonts?.ready.then(scheduleFit);
    setTimeout(scheduleFit, 300);
    setInterval(() => { elapsed.textContent = format((Date.now() - startedAt) / 1000); }, 250); restore();
  })();</script>
</body>
</html>`;
}
