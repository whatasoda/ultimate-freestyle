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
      list.push(escapeHtml(trimmed.slice(2)));
      continue;
    }
    flushList();
    if (trimmed.length === 0) continue;
    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = Math.min(heading[1].length + 1, 4);
      blocks.push(`<h${level}>${escapeHtml(heading[2])}</h${level}>`);
    } else {
      blocks.push(`<p>${escapeHtml(trimmed)}</p>`);
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

function styleCss(style: SlideBlock["style"] | SlideSceneNode["style"]): string {
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
      ? "0 6px 22px #0005"
      : style?.shadow === "strong"
        ? "0 12px 36px #0009"
        : "none";
  return `
      background: ${style?.background ?? "transparent"};
      color: ${style?.foreground ?? "inherit"};
      border: ${style?.border_width_px ?? 0}px solid ${style?.border_color ?? "transparent"};
      border-radius: ${style?.corner_radius_px ?? 0}px;
      padding: ${style?.padding_px ?? 0}px;
      --component-opacity: ${style?.opacity ?? 1};
      text-align: ${textAlign}; justify-content: ${verticalAlign};
      font-size: calc(1em * ${style?.font_scale ?? 1});
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
  const attributes = `class="canvas-block reveal-block" data-block-id="${escapeHtml(block.id)}" data-block-kind="${block.kind}" data-reveal="${block.at}" data-reveal-at="${block.at}" data-animation="${block.animation}" aria-hidden="true"`;
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
      ? `display: flex; flex-direction: ${node.direction}; gap: ${node.gap_px}px; align-items: ${node.align === "start" ? "flex-start" : node.align === "end" ? "flex-end" : node.align}; justify-content: ${node.justify === "start" ? "flex-start" : node.justify === "end" ? "flex-end" : node.justify === "between" ? "space-between" : node.justify === "around" ? "space-around" : "center"}; flex-wrap: ${node.wrap ? "wrap" : "nowrap"};`
      : node.kind === "grid"
        ? `display: grid; grid-template-columns: repeat(${node.columns}, minmax(0, 1fr)); gap: ${node.gap_px}px; align-items: ${node.align === "start" ? "start" : node.align === "end" ? "end" : node.align};`
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
  return `${selector} { ${frame} ${layout} ${styleCss(node.style)} }
${itemCss}`;
}

function sceneAttributes(node: SlideSceneNode): string {
  return `class="scene-node reveal-block" data-node-id="${escapeHtml(node.id)}" data-component="uf-${node.kind.replaceAll("_", "-")}" data-reveal="${node.at}" data-reveal-at="${node.at}" data-animation="${node.animation}" data-positioned="${String(node.frame !== null && node.frame !== undefined)}" aria-hidden="true"`;
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

  const runtimeDeck = {
    projectId: project.project_id,
    version: project.version,
    title: project.document.title,
    shortTitle: deck.short_title,
    layout: deck.layout,
    accent: deck.accent,
    slides: deck.slides.map((slide) => ({
      id: slide.id,
      title: slide.title,
      durationSeconds: slide.duration_seconds,
      revealSteps: slide.reveal_steps,
      narration: slide.narration
    }))
  };
  const templates = new Map(
    (deck.templates ?? []).map((template) => [template.id, template])
  );
  const templateCss = [...templates.values()]
    .map(
      (template) => `.slide[data-template-id="${template.id}"] {
      --template-background: ${template.background};
      --template-surface: ${template.surface};
      --template-foreground: ${template.foreground};
      --template-muted: ${template.muted};
      --template-accent: ${template.accent};
      --template-radius: ${template.corner_radius_px}px;
      --template-spacing: ${template.spacing_scale};
      --template-font-scale: ${template.font_scale};
      --template-sidebar-width: ${template.sidebar_width_percent}%;
    }`
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
      const regionLayout = template?.region_layout ?? "sidebar-right";
      const enterAnimation =
        slide.enter_animation ?? template?.enter_animation ?? "fade";
      const revealAnimation = template?.reveal_animation ?? "rise";
      const composition = slide.composition;
      const content = composition?.mode === "canvas"
        ? `<div class="slide-canvas" data-region="canvas">${composition.blocks.map((block) => renderCanvasBlock(block, options.assetUrls ?? {})).join("\n")}</div>`
        : composition?.mode === "scene"
          ? `<div class="slide-scene" data-region="scene" data-runtime-version="${composition.runtime_version}">${renderScene(composition.nodes, options.assetUrls ?? {})}</div>`
        : `<div class="slide-main" data-region="main">
    <p class="eyebrow">${String(index + 1).padStart(2, "0")} · ${escapeHtml(slide.title)}</p>
    <div class="slide-content">${renderTextBlocks(slide.content_markdown)}</div>
    ${slide.reveal_blocks.map((block) => `<div class="reveal-block" data-reveal="${block.at}" data-reveal-at="${block.at}" data-animation="${revealAnimation}" aria-hidden="true">${renderTextBlocks(block.markdown)}</div>`).join("\n")}
  </div>
  <aside class="slide-sidebar" data-region="sidebar"${slide.sidebar_markdown === null ? " hidden" : ""}>
    ${slide.sidebar_markdown === null ? "" : renderTextBlocks(slide.sidebar_markdown)}
  </aside>`;
      return `<article class="slide tone-${slide.tone}" data-slide="${index}" data-slide-id="${escapeHtml(slide.id)}" data-template-id="${escapeHtml(templateId ?? `builtin-${deck.layout}`)}" data-user-template="${String(template !== undefined && template !== null)}" data-region-layout="${regionLayout}" data-composition="${composition?.mode ?? "flow"}" data-tone="${slide.tone}" data-animation="${enterAnimation}" data-state="inactive" hidden>
  ${content}
  <section class="narration" data-region="narration" aria-live="polite"></section>
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
    .app { width: 100vw; height: 100vh; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; gap: 10px; padding: 12px; }
    body[data-editor-frame="true"] .app { grid-template-rows: minmax(0, 1fr); gap: 0; padding: 0; }
    body[data-editor-frame="true"] header, body[data-editor-frame="true"] footer { display: none; }
    body[data-editor-frame="true"] .stage-wrap { grid-row: 1; }
    body[data-editor-frame="true"] .stage { width: 100%; height: 100%; border: 0; box-shadow: none; }
    header, footer { display: flex; align-items: center; gap: 12px; min-height: 36px; color: #a9b5c7; }
    header strong { color: #fff; }
    header .time { margin-left: auto; font-variant-numeric: tabular-nums; }
    .stage-wrap { min-height: 0; display: grid; place-items: center; }
    .stage { position: relative; width: min(100%, calc((100vh - 118px) * 16 / 9)); aspect-ratio: 16 / 9; overflow: hidden; border: 1px solid #334155; background: #111827; box-shadow: 0 18px 60px #0009; }
    .slide { position: absolute; inset: 0; display: grid; grid-template: 1fr auto / minmax(0, 1fr) minmax(0, 28%); background: radial-gradient(circle at 85% 15%, color-mix(in srgb, var(--accent) 20%, transparent), transparent 38%), #111827; }
    .slide[data-user-template="true"] { --accent: var(--template-accent); grid-template-columns: minmax(0, 1fr) var(--template-sidebar-width); border-radius: var(--template-radius); background: var(--template-background); color: var(--template-foreground); }
    .slide[data-user-template="true"] .slide-main { padding: calc(7% * var(--template-spacing)) calc(7% * var(--template-spacing)) calc(4% * var(--template-spacing)); }
    .slide[data-user-template="true"] .slide-sidebar { background: var(--template-surface); color: var(--template-muted); }
    .slide[data-user-template="true"] .slide-content, .slide[data-user-template="true"] .slide-sidebar, .slide[data-user-template="true"] .narration { font-size: calc(1em * var(--template-font-scale)); }
    .slide[data-region-layout="single"] { grid-template-columns: 1fr; }
    .slide[data-region-layout="single"] .slide-sidebar { display: none; }
    .slide[data-region-layout="sidebar-left"] { grid-template-columns: var(--template-sidebar-width, 28%) minmax(0, 1fr); }
    .slide[data-region-layout="sidebar-left"] .slide-main { grid-column: 2; grid-row: 1; }
    .slide[data-region-layout="sidebar-left"] .slide-sidebar { grid-column: 1; grid-row: 1; border-left: 0; border-right: 1px solid #ffffff25; }
    .slide[data-region-layout="lower-third"] { grid-template: minmax(0, 1fr) auto auto / 1fr; }
    .slide[data-region-layout="lower-third"] .slide-sidebar { grid-row: 2; padding: 2% 6%; border-top: 1px solid #ffffff25; border-left: 0; }
    .slide[data-composition="canvas"] { grid-template: minmax(0, 1fr) auto / 1fr; background: var(--canvas-background); overflow: var(--canvas-overflow); }
    .slide[data-composition="scene"] { grid-template: minmax(0, 1fr) auto / 1fr; background: radial-gradient(circle at 82% 0%, color-mix(in srgb, var(--accent) 25%, transparent), transparent 36%), var(--canvas-background); overflow: var(--canvas-overflow); }
    .slide-canvas { position: relative; min-width: 0; min-height: 0; grid-row: 1; grid-column: 1; overflow: var(--canvas-overflow); }
    .slide-scene { position: relative; min-width: 0; min-height: 0; grid-row: 1; grid-column: 1; padding: 6%; overflow: var(--canvas-overflow); container: slide-scene / size; }
    .slide-scene > .scene-node:not([data-positioned="true"]) { width: 100%; height: 100%; }
    .scene-node { min-width: 0; min-height: 0; max-width: 100%; overflow: hidden; }
    .scene-node.is-visible { opacity: var(--component-opacity); }
    uf-layer, uf-stack, uf-grid, uf-hero, uf-markdown, uf-image, uf-shape, uf-card, uf-metric, uf-quote, uf-callout, uf-bar-chart, uf-timeline, uf-bar-row, uf-timeline-item { box-sizing: border-box; }
    uf-stack > .scene-node, uf-grid > .scene-node { min-height: 0; }
    uf-hero { gap: clamp(8px, 1.5cqh, 20px); justify-content: center; }
    uf-hero[data-align="center"] { align-items: center; text-align: center; }
    uf-hero[data-align="end"] { align-items: flex-end; text-align: end; }
    uf-hero h2 { max-width: 16ch; margin: 0; font-size: clamp(30px, 7.8cqw, 104px); line-height: .96; letter-spacing: -.055em; text-wrap: balance; }
    .component-eyebrow, .component-label { margin: 0; color: var(--accent); font: 850 clamp(9px, 1.1cqw, 16px)/1.2 ui-monospace, monospace; letter-spacing: .14em; text-transform: uppercase; }
    .component-subtitle { max-width: 48rem; margin: 0; color: color-mix(in srgb, currentColor 68%, transparent); font-size: clamp(13px, 2cqw, 28px); line-height: 1.5; }
    uf-markdown h2, uf-markdown h3, uf-card h2, uf-card h3 { margin: 0 0 .45em; font-size: clamp(20px, 4cqw, 58px); line-height: 1.05; }
    uf-markdown p, uf-markdown li, uf-card p, uf-card li, uf-callout p { margin-top: 0; font-size: clamp(11px, 1.65cqw, 24px); line-height: 1.55; }
    uf-card, uf-callout { gap: .55em; padding: clamp(14px, 2.4cqw, 34px); border: 1px solid #ffffff26; border-radius: clamp(12px, 2cqw, 28px); background: #ffffff0b; backdrop-filter: blur(18px); }
    uf-card[data-variant="accent"] { border-color: color-mix(in srgb, var(--accent) 70%, transparent); background: color-mix(in srgb, var(--accent) 18%, transparent); }
    uf-card[data-variant="glass"] { background: #ffffff14; box-shadow: 0 18px 55px #0005; }
    uf-metric { justify-content: center; gap: .5em; padding: clamp(12px, 2cqw, 28px); }
    uf-metric p { display: flex; align-items: baseline; gap: .3em; margin: 0; }
    uf-metric strong { font: 900 clamp(36px, 7cqw, 96px)/.9 ui-monospace, monospace; letter-spacing: -.07em; }
    uf-metric span { color: var(--accent); font-size: clamp(12px, 2cqw, 28px); font-weight: 850; }
    uf-metric small { color: color-mix(in srgb, currentColor 62%, transparent); font-size: clamp(10px, 1.4cqw, 20px); }
    uf-metric[data-emphasis="signal"] { color: #17120a; background: var(--accent); }
    uf-quote { justify-content: center; gap: 1em; padding-left: 6%; border-left: clamp(4px, .7cqw, 10px) solid var(--accent); }
    uf-quote blockquote { margin: 0; font-size: clamp(20px, 4.2cqw, 62px); font-weight: 750; line-height: 1.2; text-wrap: balance; }
    uf-quote cite { color: color-mix(in srgb, currentColor 60%, transparent); font-style: normal; }
    uf-callout[data-variant="success"] { --callout-color: #62e6ad; }
    uf-callout[data-variant="warning"] { --callout-color: #ffd166; }
    uf-callout[data-variant="danger"] { --callout-color: #ff786f; }
    uf-callout { border-left: 5px solid var(--callout-color, #65ccff); }
    uf-callout h3 { margin: 0; font-size: clamp(16px, 2.7cqw, 38px); }
    uf-image { gap: .5em; margin: 0; }
    uf-image img { display: block; width: 100%; min-height: 0; flex: 1; border-radius: inherit; }
    uf-image img[data-fit="contain"] { object-fit: contain; }
    uf-image img[data-fit="cover"] { object-fit: cover; }
    uf-image img[data-fit="fill"] { object-fit: fill; }
    uf-image small { color: color-mix(in srgb, currentColor 62%, transparent); font-size: clamp(9px, 1.1cqw, 15px); }
    uf-shape[data-shape="ellipse"] { border-radius: 50%; }
    uf-shape[data-shape="line"] { height: 0 !important; min-height: 0; border-width: 0 0 2px !important; overflow: visible; }
    uf-shape span { margin: auto; }
    uf-bar-chart { justify-content: center; gap: clamp(7px, 1.4cqh, 18px); }
    uf-bar-row { display: grid; grid-template-columns: minmax(5em, 22%) 1fr auto; align-items: center; gap: 1em; }
    uf-bar-row span, uf-bar-row strong { font: 750 clamp(10px, 1.45cqw, 21px)/1.2 ui-monospace, monospace; }
    uf-bar-row i { height: clamp(10px, 1.7cqh, 20px); border-radius: 99px; background: linear-gradient(90deg, var(--bar-color) var(--bar-width), #ffffff15 var(--bar-width)); box-shadow: 0 0 28px color-mix(in srgb, var(--bar-color) 28%, transparent); }
    uf-timeline { justify-content: center; gap: clamp(8px, 1.4cqh, 18px); }
    uf-timeline-item { display: grid; grid-template-columns: minmax(4em, 16%) minmax(0, 1fr); gap: .2em 1.3em; padding-left: 1em; border-left: 3px solid var(--accent); }
    uf-timeline-item small { grid-row: 1 / 3; color: var(--accent); font: 800 clamp(9px, 1.1cqw, 15px)/1.4 ui-monospace, monospace; }
    uf-timeline-item strong { font-size: clamp(12px, 1.8cqw, 26px); }
    uf-timeline-item p { margin: 0; color: color-mix(in srgb, currentColor 64%, transparent); font-size: clamp(10px, 1.2cqw, 17px); }
    .canvas-block { position: absolute; display: flex; flex-direction: column; justify-content: flex-start; min-width: 0; min-height: 0; margin: 0; overflow: var(--canvas-overflow); }
    .canvas-block > * { width: 100%; }
    .reveal-block.canvas-block.is-visible { opacity: var(--component-opacity); }
    .canvas-block h2, .canvas-block h3, .canvas-block h4 { margin: 0 0 .35em; line-height: 1.08; font-size: clamp(18px, 3.8vw, 58px); }
    .canvas-block p, .canvas-block li { margin: 0; font-size: clamp(11px, 1.8vw, 28px); line-height: 1.45; }
    .canvas-block p + p { margin-top: .55em; }
    .canvas-block ul { margin: 0; padding-left: 1.25em; }
    figure.canvas-block img { display: block; width: 100%; height: 100%; }
    figure.canvas-block img[data-fit="contain"] { object-fit: contain; }
    figure.canvas-block img[data-fit="cover"] { object-fit: cover; }
    figure.canvas-block img[data-fit="fill"] { object-fit: fill; }
    .canvas-block[data-shape="ellipse"] { border-radius: 50%; }
    .canvas-block[data-shape="line"] { height: 0 !important; min-height: 0; border-width: 0 0 2px !important; border-radius: 0; overflow: visible; }
    .canvas-block[data-shape] span { margin: auto; font-size: clamp(10px, 1.6vw, 24px); line-height: 1.3; }
    .slide[hidden] { display: none; }
    .slide-main { padding: 7% 7% 4%; overflow: hidden; }
    .slide-sidebar { padding: 9% 8%; border-left: 1px solid #ffffff25; background: #05080dbb; overflow: hidden; }
    .slide-sidebar[hidden] { display: none; }
    .slide:has(.slide-sidebar[hidden]) { grid-template-columns: 1fr; }
    .narration { grid-column: 1 / -1; min-height: 18%; padding: 2.2% 5%; border-top: 1px solid #ffffff2b; background: #05080de8; font-size: clamp(13px, 2vw, 28px); line-height: 1.55; }
    .narration:empty { display: none; }
    .eyebrow { margin: 0 0 4%; color: var(--accent); font-size: clamp(10px, 1vw, 16px); font-weight: 800; letter-spacing: .16em; text-transform: uppercase; }
    .slide-content h2, .slide-content h3, .slide-content h4 { margin: 0 0 .5em; line-height: 1.12; font-size: clamp(24px, 4.8vw, 72px); }
    .slide-content p, .slide-content li { font-size: clamp(15px, 2.25vw, 34px); line-height: 1.5; }
    .slide-content ul { padding-left: 1.3em; }
    .reveal-block { opacity: 0; translate: 0 18px; transition: opacity .4s ease, translate .4s ease, scale .4s ease, clip-path .4s ease; }
    .reveal-block.is-visible { opacity: 1; translate: 0 0; }
    .reveal-block[data-animation="none"] { transition: none; translate: none; }
    .reveal-block[data-animation="zoom"] { scale: .92; translate: none; }
    .reveal-block[data-animation="zoom"].is-visible { scale: 1; }
    .reveal-block[data-animation="wipe"] { clip-path: inset(0 100% 0 0); translate: none; }
    .reveal-block[data-animation="wipe"].is-visible { clip-path: inset(0); }
    .reveal-block p, .reveal-block li { font-size: clamp(14px, 1.8vw, 28px); line-height: 1.45; }
    .slide-sidebar h2, .slide-sidebar h3, .slide-sidebar h4 { color: var(--accent); }
    .slide-sidebar p, .slide-sidebar li { font-size: clamp(10px, 1.2vw, 18px); line-height: 1.55; }
    .tone-light { background: #f6f1e8; color: #162033; }
    .tone-quiet { background: #e9eef5; color: #162033; }
    .tone-signal { background: var(--accent); color: #10131a; }
    [data-layout="minimal"] .stage { background: white; }
    [data-layout="minimal"] .slide { background: #fff; color: #172033; }
    [data-layout="minimal"] .slide-sidebar { background: #f1f5f9; color: #172033; border-color: #cbd5e1; }
    [data-layout="cinematic"] .slide-sidebar { display: none; }
    [data-layout="cinematic"] .slide { grid-template-columns: 1fr; }
    ${templateCss}
    ${compositionCss}
    @keyframes slide-fade { from { opacity: 0; } }
    @keyframes slide-rise { from { opacity: 0; translate: 0 3%; } }
    @keyframes slide-zoom { from { opacity: 0; scale: .96; } }
    @keyframes slide-wipe { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0); } }
    .slide:not([hidden])[data-animation="fade"] { animation: slide-fade .35s ease both; }
    .slide:not([hidden])[data-animation="rise"] { animation: slide-rise .4s ease both; }
    .slide:not([hidden])[data-animation="zoom"] { animation: slide-zoom .4s ease both; }
    .slide:not([hidden])[data-animation="wipe"] { animation: slide-wipe .45s ease both; }
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
    @media (prefers-reduced-motion: reduce) { .slide, .reveal-block { animation: none !important; transition: none !important; } }
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
    let slide = 0, step = 0, speech = true, auto = false, startedAt = Date.now(), voiceTimer;
    const units = DECK.slides.reduce((sum, item) => sum + item.revealSteps + 1, 0);
    const format = (seconds) => String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(Math.floor(seconds % 60)).padStart(2, '0');
    const currentUnit = () => DECK.slides.slice(0, slide).reduce((sum, item) => sum + item.revealSteps + 1, 0) + step + 1;
    const narration = () => DECK.slides[slide].narration?.segments.find((item) => item.at === step) ?? null;
    const syncUrl = () => history.pushState(null, '', '?slide=' + (slide + 1) + '&step=' + step);
    const stopVoice = () => { speechSynthesis?.cancel(); clearInterval(voiceTimer); voiceProgress.style.width = '0'; };
    const advance = () => {
      const current = DECK.slides[slide];
      if (step < current.revealSteps) step += 1;
      else if (slide < slides.length - 1) { slide += 1; step = 0; }
      else return false;
      syncUrl(); render(); return true;
    };
    const speak = () => {
      stopVoice(); const segment = narration();
      if (!speech || !segment || !('speechSynthesis' in window)) return;
      const utterance = new SpeechSynthesisUtterance(segment.text); utterance.lang = 'ja-JP'; utterance.volume = Number(volume.value);
      const estimated = Math.max(1.5, segment.text.length / 7); const begin = performance.now();
      voiceTimer = setInterval(() => { voiceProgress.style.width = Math.min(100, (performance.now() - begin) / 10 / estimated) + '%'; }, 100);
      utterance.onend = () => { clearInterval(voiceTimer); voiceProgress.style.width = '100%'; if (auto) setTimeout(advance, 350); };
      utterance.onerror = () => { clearInterval(voiceTimer); voiceProgress.style.width = '0'; };
      speechSynthesis.speak(utterance);
    };
    const render = () => {
      stopVoice(); slides.forEach((item, index) => { const active = index === slide; item.hidden = !active; item.dataset.state = active ? 'active' : 'inactive'; });
      slides[slide].querySelectorAll('[data-reveal]').forEach((item) => { const visible = Number(item.dataset.reveal) <= step; item.classList.toggle('is-visible', visible); item.setAttribute('aria-hidden', String(!visible)); });
      const segment = narration(); slides[slide].querySelector('.narration').textContent = segment?.text ?? '';
      counter.textContent = (slide + 1) + ' / ' + slides.length + ' · STEP ' + step;
      progress.style.width = (currentUnit() / units * 100) + '%';
      expected.textContent = format(DECK.slides.slice(0, slide).reduce((sum, item) => sum + item.durationSeconds, 0));
      speak();
    };
    const restore = () => { const query = new URLSearchParams(location.search); slide = Math.min(Math.max(Number(query.get('slide') ?? 1) - 1, 0), slides.length - 1); step = Math.min(Math.max(Number(query.get('step') ?? 0), 0), DECK.slides[slide].revealSteps); render(); };
    document.querySelector('#next').addEventListener('click', advance);
    document.querySelector('#prev').addEventListener('click', () => { if (step > 0) step -= 1; else if (slide > 0) { slide -= 1; step = DECK.slides[slide].revealSteps; } else return; syncUrl(); render(); });
    speechButton.addEventListener('click', () => { speech = !speech; speechButton.setAttribute('aria-pressed', String(speech)); render(); });
    autoButton.addEventListener('click', () => { auto = !auto; autoButton.setAttribute('aria-pressed', String(auto)); });
    volume.addEventListener('input', () => { try { localStorage.setItem(volumeKey, volume.value); } catch {} });
    try { volume.value = localStorage.getItem(volumeKey) ?? '1'; } catch {}
    addEventListener('keydown', (event) => { if (['ArrowRight', ' ', 'Enter'].includes(event.key)) { event.preventDefault(); advance(); } else if (event.key === 'ArrowLeft') { document.querySelector('#prev').click(); } });
    addEventListener('popstate', restore); setInterval(() => { elapsed.textContent = format((Date.now() - startedAt) / 1000); }, 250); restore();
  })();</script>
</body>
</html>`;
}
