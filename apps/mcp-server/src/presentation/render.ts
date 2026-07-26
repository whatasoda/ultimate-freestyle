import type { ProjectRecord } from "../projects/schema";

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

export function renderPresentationHtml(project: ProjectRecord): string {
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
  const slideHtml = deck.slides
    .map(
      (slide, index) => `<article class="slide tone-${slide.tone}" data-slide="${index}" hidden>
  <div class="slide-main">
    <p class="eyebrow">${String(index + 1).padStart(2, "0")} · ${escapeHtml(slide.title)}</p>
    <div class="slide-content">${renderTextBlocks(slide.content_markdown)}</div>
    ${slide.reveal_blocks.map((block) => `<div class="reveal-block" data-reveal="${block.at}" aria-hidden="true">${renderTextBlocks(block.markdown)}</div>`).join("\n")}
  </div>
  <aside class="slide-sidebar"${slide.sidebar_markdown === null ? " hidden" : ""}>
    ${slide.sidebar_markdown === null ? "" : renderTextBlocks(slide.sidebar_markdown)}
  </aside>
  <section class="narration" aria-live="polite"></section>
</article>`
    )
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
    .reveal-block { opacity: 0; translate: 0 18px; transition: opacity .4s ease, translate .4s ease; }
    .reveal-block.is-visible { opacity: 1; translate: 0 0; }
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
      stopVoice(); slides.forEach((item, index) => { item.hidden = index !== slide; });
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
