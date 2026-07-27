import type { ProjectRecord, SlideBlock } from "../projects/schema";

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
};

export function listPresentationAssetIds(project: ProjectRecord): string[] {
  return [
    ...new Set(
      (project.document.deck?.slides ?? []).flatMap(
        (slide) =>
          slide.composition?.blocks.flatMap((block) =>
            block.kind === "image" ? [block.asset_id] : []
          ) ?? []
      )
    )
  ];
}

function blockCss(slideId: string, block: SlideBlock): string {
  const style = block.style;
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
  return `.slide[data-slide-id="${slideId}"] [data-block-id="${block.id}"] {
      left: ${block.frame.x}%; top: ${block.frame.y}%;
      width: ${block.frame.width}%; height: ${block.frame.height}%;
      z-index: ${block.z_index};
      background: ${style?.background ?? "transparent"};
      color: ${style?.foreground ?? "inherit"};
      border: ${style?.border_width_px ?? 0}px solid ${style?.border_color ?? "transparent"};
      border-radius: ${style?.corner_radius_px ?? 0}px;
      padding: ${style?.padding_px ?? 0}px;
      --block-opacity: ${style?.opacity ?? 1};
      text-align: ${textAlign}; justify-content: ${verticalAlign};
      font-size: calc(1em * ${style?.font_scale ?? 1});
      box-shadow: ${shadow};
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
  const canvasCss = deck.slides
    .flatMap((slide) => {
      if (slide.composition === null || slide.composition === undefined) {
        return [];
      }
      return [
        `.slide[data-slide-id="${slide.id}"] { --canvas-background: ${slide.composition.background}; --canvas-overflow: ${slide.composition.clip_content ? "hidden" : "visible"}; }`,
        ...slide.composition.blocks.map((block) => blockCss(slide.id, block))
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
      const content = composition
        ? `<div class="slide-canvas" data-region="canvas">${composition.blocks
            .map((block) =>
              renderCanvasBlock(block, options.assetUrls ?? {})
            )
            .join("\n")}</div>`
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
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-saijiyu-static'; script-src 'nonce-saijiyu-static'; media-src 'self' blob:; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'">
  <title>${escapeHtml(project.document.title)}</title>
  <style nonce="saijiyu-static">
    :root { color-scheme: dark; --accent: ${escapeHtml(deck.accent)}; font-family: Inter, "Noto Sans JP", system-ui, sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; overflow: hidden; background: #090d14; color: #f8fafc; }
    button, input { font: inherit; }
    .app { width: 100vw; height: 100vh; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; gap: 10px; padding: 12px; }
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
    .slide-canvas { position: relative; min-width: 0; min-height: 0; grid-row: 1; grid-column: 1; overflow: var(--canvas-overflow); }
    .canvas-block { position: absolute; display: flex; flex-direction: column; justify-content: flex-start; min-width: 0; min-height: 0; margin: 0; overflow: var(--canvas-overflow); }
    .canvas-block > * { width: 100%; }
    .reveal-block.canvas-block.is-visible { opacity: var(--block-opacity); }
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
    ${canvasCss}
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
<body data-layout="${escapeHtml(deck.layout)}">
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
