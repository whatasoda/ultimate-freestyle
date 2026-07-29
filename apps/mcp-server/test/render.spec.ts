import { describe, expect, it } from "vitest";

import {
  PRESENTATION_RENDERER_VERSION,
  renderPresentationHtml
} from "../src/presentation/render";
import { projectDetailPage, slideWorkspacePage } from "../src/web/pages";
import { resolveSlideTypography } from "../src/projects/typography";
import {
  projectRecordSchema,
  slideCompositionSchema
} from "../src/projects/schema";

describe("presentation artifact renderer", () => {
  it("resolves readable defaults for text-heavy slide presets", () => {
    expect(resolveSlideTypography({ preset: "article" })).toMatchObject({
      columns: 1,
      body_scale: 0.7,
      line_height: 1.6
    });
    expect(resolveSlideTypography({ preset: "columns" })).toMatchObject({
      columns: 2,
      body_scale: 0.65
    });
    expect(resolveSlideTypography({ preset: "dense", columns: 3 })).toMatchObject({
      columns: 3,
      body_scale: 0.55
    });
    expect(resolveSlideTypography(undefined, 1.75)).toMatchObject({
      preset: "standard",
      line_height: 1.75
    });
  });

  it("renders a self-contained interactive deck and escapes project content", () => {
    const project = projectRecordSchema.parse({
      project_id: "63ab1ec4-20a0-4cf6-a1a0-f74ced56778a",
      version: 3,
      created_at: "2026-07-26T12:00:00.000Z",
      updated_at: "2026-07-26T12:30:00.000Z",
      document: {
        schema_version: 1,
        stage: "production",
        title: "<script>alert('title')</script>",
        summary: "",
        question: "何が変わる？",
        hypothesis: null,
        method: null,
        findings: [],
        limitations: [],
        logs: [],
        deck: {
          short_title: "安全な発表",
          description: "",
          author: "研究者",
          year: 2026,
          accent: "#ffcf32",
          layout: "biim",
          aspect_ratio: "4:3",
          loading_screen: {
            enabled: true,
            style: "orbit",
            message: "素材を準備しています",
            show_progress: true,
            minimum_duration_ms: 700
          },
          templates: [
            {
              id: "my-biim",
              name: "自分のBIIM",
              region_layout: "sidebar-right",
              sidebar_width_percent: 34,
              background: "#152238",
              surface: "#08111f",
              foreground: "#f8fafc",
              muted: "#bac8dc",
              accent: "#44ddaa",
              accent_secondary: "#65ccff",
              border: "#334155",
              corner_radius_px: 12,
              spacing_scale: 1,
              font_scale: 1,
              enter_animation: "wipe",
              reveal_animation: "zoom",
              visual_preset: "neon",
              body_font: "rounded",
              heading_font: "display",
              density: "compact",
              motion_style: "snappy",
              body_weight: 500,
              heading_weight: 900,
              line_height: 1.4,
              letter_spacing_em: 0.02
            }
          ],
          default_template_id: "my-biim",
          narration_defaults: null,
          slides: [
            {
              id: "result",
              title: "結果",
              duration_seconds: 60,
              reveal_steps: 1,
              tone: "dark",
              template_id: "my-biim",
              role: "cover",
              cover_layout: "poster",
              typography: {
                preset: "columns",
                columns: 3,
                body_scale: 0.6,
                heading_scale: 0.7,
                line_height: 1.55,
                paragraph_spacing_em: 0.6,
                column_gap_em: 2.4,
                text_align: "start",
                vertical_align: "start"
              },
              content_markdown: "# 結果\n**重要**\n<script>alert('content')</script>\n- 記録A\n1. 手順A\n2. 手順B\n\n| 比較 | **値** |\n| --- | :---: |\n| 安全 | <table-script> |",
              reveal_blocks: [
                { at: 1, markdown: "追加で見せる証拠" }
              ],
              sidebar_markdown: "作者コメント",
              narration: {
                display: "commentary",
                speaker: null,
                appearance: {
                  placement: "overlay-bottom",
                  size: "large",
                  text_align: "center",
                  speaker_visible: true,
                  progress_visible: true,
                  text_scale: 1.1,
                  max_lines: 3
                },
                segments: [
                  {
                    at: 0,
                    text: "読み上げにも </script><script>alert('voice')</script>",
                    audio_src: "/audio/result-0.mp3",
                    speaker: "ずんだもん",
                    voice_tuning: {
                      speedScale: 1.25,
                      pitchScale: 0.05,
                      volumeScale: 0.8
                    }
                  }
                ]
              }
            }
          ]
        }
      }
    });

    const html = renderPresentationHtml(project, {
      assetUrls: {
        "40000000-0000-4000-8000-000000000004":
          "/presentation-assets/revision/image"
      }
    });
    expect(html).toContain('<meta http-equiv="Content-Security-Policy"');
    expect(html).toContain('class="stage"');
    expect(html).toContain('id="voice-progress"');
    expect(html).toContain('id="volume"');
    expect(html).toContain("history.pushState");
    expect(html).toContain("speechSynthesis");
    expect(html).toContain('data-reveal="1"');
    expect(html).toContain('data-slide-id="result"');
    expect(html).toContain(`data-renderer-version="${PRESENTATION_RENDERER_VERSION}"`);
    expect(PRESENTATION_RENDERER_VERSION).toBe("uf-renderer@35");
    expect(html).toContain('<meta property="og:site_name" content="最自由研究">');
    expect(html).toContain('<meta name="twitter:card" content="summary">');
    expect(html).toContain("<table><thead><tr>");
    expect(html).toContain('<th class="align-center"><strong>値</strong></th>');
    expect(html).toContain("&lt;table-script&gt;");
    expect(html).toContain('data-shortcuts role="dialog"');
    expect(html).toContain('id="help" aria-haspopup="dialog"');
    expect(html).toContain("event.key === '?'" );
    expect(html).toContain("data-completion-time");
    expect(html).toContain("想定より' + format(Math.abs(difference))");
    expect(html).toContain('id="pace" data-state="remaining"');
    expect(html).toContain("pace.textContent = over ? '目安超過 '");
    expect(html).toContain('title="実経過時間 / 現在の区切り目安 / 想定合計時間"');
    expect(html).toContain('class="time-total"> / 全01:00</span>');
    expect(html).toContain("const expectedElapsed = () =>");
    expect(html).toContain("(step + 1) / (current.revealSteps + 1)");
    expect(html).toContain("const scheduleAutoAdvance = () =>");
    expect(html).toContain("current.durationSeconds * 1000 / (current.revealSteps + 1)");
    expect(html).toContain("stage?.addEventListener('click'");
    expect(html).toContain("スライドをクリック、または → / Space で進みます");
    expect(html).toContain(">音声 ON</button>");
    expect(html).toContain(">自動 OFF</button>");
    expect(html).toContain("grid-template-columns: repeat(5, minmax(44px, auto))");
    expect(html).toContain("@media (max-width: 430px)");
    expect(html).toContain("min-height: 42px");
    expect(html).toContain("data-voice-unlock");
    expect(html).toContain(">音声を開始</button>");
    expect(html).toContain("error.name === 'NotAllowedError'");
    expect(html).toContain("showVoiceUnlock()");
    expect(html).toContain("if (run !== voiceRun) return;");
    expect(html).toContain("else scheduleAutoAdvance();");
    expect(html).toContain("ultimate-freestyle:preview-fields");
    expect(html).toContain("ultimate-freestyle:preview-scene-component");
    expect(html).toContain("const previewSceneComponent =");
    expect(html).toContain("const renderDraftMarkdown =");
    expect(html).toContain("data-flow-content");
    expect(html).toContain("ultimate-freestyle:preview-typography");
    expect(html).toContain("const previewTypography =");
    expect(html).toContain("ultimate-freestyle:preview-template");
    expect(html).toContain("const previewTemplate =");
    expect(html).toContain("ultimate-freestyle:preview-appearance");
    expect(html).toContain("const previewAppearance =");
    expect(html).toContain('role="region" tabindex="0"');
    expect(html).toContain("target.closest('button, a, input, select, textarea')");
    expect(html).toContain("if (editorFrame) return;");
    expect(html).toContain("failed + '件は開始後に読み込みます'");
    expect(html).toContain("resolve({ url, ok: false })");
    expect(html).toContain('aria-label="発表の進捗"');
    expect(html).toContain('aria-label="読み上げ進捗"');
    expect(html).toContain("setAttribute('aria-valuenow'");
    expect(html).toContain("const updateControls = () =>");
    expect(html).toContain("previousButton.disabled = !started || (slide === 0 && step === 0)");
    expect(html).toContain("setSecondaryProgressLabel('自動送りまで')");
    expect(html).toContain("(performance.now() - begin) / delay * 100");
    expect(html).toContain("<ol><li>手順A</li><li>手順B</li></ol>");
    expect(html).toContain("document.createElement('ol')");
    expect(html).toContain("ultimate-freestyle:preview-narration-settings");
    expect(html).toContain("ultimate-freestyle:preview-narration-segment");
    expect(html).toContain("const previewNarrationSettings =");
    expect(html).toContain("発表はここまでです");
    expect(html).toContain('role="dialog" aria-modal="true"');
    expect(html).toContain("const hideCompletion = () =>");
    expect(html).toContain("'ArrowDown', 'PageDown'");
    expect(html).toContain("'ArrowUp', 'PageUp'");
    expect(html).toContain("event.key === 'Home'");
    expect(html).toContain("event.key === 'End'");
    expect(html).toContain("'PageUp', 'Backspace'");
    expect(html).toContain("event.key.toLowerCase() === 'm'");
    expect(html).toContain("event.key.toLowerCase() === 'a'");
    expect(html).toContain('aria-keyshortcuts="M"');
    expect(html).toContain('aria-keyshortcuts="A"');
    expect(html).toContain('id="timer-toggle"');
    expect(html).toContain('aria-keyshortcuts="T"');
    expect(html).toContain("const setTimerRunning = (running)");
    expect(html).toContain("elapsedAccumulated");
    expect(html).toContain("event.key.toLowerCase() === 't'");
    expect(html).toContain("data-restart");
    expect(html).toContain("else { showCompletion(); return false; }");
    expect(html).toContain('id="volume-value"');
    expect(html).toContain("const normalizeVolume = (value)");
    expect(html).toContain("Math.round(value * 100) + '%'");
    expect(html).toContain('data-aspect-ratio="4:3"');
    expect(html).toContain('data-style="orbit"');
    expect(html).toContain('data-slide-role="cover"');
    expect(html).toContain('data-cover-layout="poster"');
    expect(html).toContain('data-text-preset="columns"');
    expect(html).toContain('data-columns="3"');
    expect(html).toContain('--slide-body-scale:0.6');
    expect(html).toContain('--slide-heading-scale:0.7');
    expect(html).toContain('--slide-column-gap:2.4em');
    expect(html).toContain('--template-accent-secondary: #65ccff');
    expect(html).toContain('--template-border: #334155');
    expect(html).toContain('"/presentation-assets/revision/image"');
    expect(html).toContain('"/audio/result-0.mp3"');
    expect(html).toContain("const preloadResources = async");
    expect(html).toContain("Math.min(4, resources.length)");
    expect(html).not.toContain("].slice(0, 2)");
    expect(html).toContain("history.pushState(null, '', '?slide=1&step=0')");
    expect(html).toContain('data-template-id="my-biim"');
    expect(html).toContain('data-region="sidebar"');
    expect(html).toContain('data-reveal-at="1"');
    expect(html).toContain('--template-sidebar-width: 34%');
    expect(html).toContain('data-visual-preset="neon"');
    expect(html).toContain('data-body-font="rounded"');
    expect(html).toContain('data-heading-font="display"');
    expect(html).toContain('data-density="compact"');
    expect(html).toContain('data-motion-style="snappy"');
    expect(html).toContain('data-placement="overlay-bottom"');
    expect(html).toContain('class="narration-speaker">ずんだもん</span>');
    expect(html).toContain("const player = new Audio(segment.audio_src)");
    expect(html).toContain("player.addEventListener('timeupdate'");
    expect(html).toContain('"speedScale":1.25');
    expect(html).toContain('"speaker":"ずんだもん"');
    expect(html).toContain("segment?.speaker || DECK.slides[slide].narration?.speaker");
    expect(html).toContain("ultimate-freestyle:render-diagnostics");
    expect(html).toContain("overflows: diagnostics, fits");
    expect(html).toContain("ultimate-freestyle:set-position");
    expect(html).toContain("container: presentation-stage / size");
    expect(html).not.toMatch(/\d(?:\.\d+)?vw/);
    expect(html).toContain("classList.toggle('is-visible'");
    expect(html).toContain("&lt;script&gt;alert(&#039;content&#039;)&lt;/script&gt;");
    expect(html).toContain("<p><strong>重要</strong></p>");
    expect(html).toContain("\\u003c/script\\u003e\\u003cscript");
    expect(html).not.toContain("<script>alert('content')</script>");
    expect(html).not.toContain("<script>alert('voice')</script>");
    const runtimeScript = html.match(/<script nonce="saijiyu-static">([\s\S]+)<\/script>/)?.[1];
    expect(runtimeScript).toBeDefined();
    expect(() => new Function(runtimeScript ?? "")).not.toThrow();
  });

  it("rejects a project without slides", () => {
    const project = projectRecordSchema.parse({
      project_id: "63ab1ec4-20a0-4cf6-a1a0-f74ced56778a",
      version: 1,
      created_at: "2026-07-26T12:00:00.000Z",
      updated_at: "2026-07-26T12:00:00.000Z",
      document: {
        schema_version: 1,
        stage: "discovery",
        title: "未構成",
        summary: "",
        question: null,
        hypothesis: null,
        method: null,
        findings: [],
        limitations: [],
        logs: [],
        deck: null
      }
    });
    expect(() => renderPresentationHtml(project)).toThrow(
      "A non-empty deck is required"
    );
  });

  it("renders freely positioned blocks with stable data hooks", () => {
    const assetId = "40000000-0000-4000-8000-000000000004";
    const project = projectRecordSchema.parse({
      project_id: "63ab1ec4-20a0-4cf6-a1a0-f74ced56778a",
      version: 4,
      created_at: "2026-07-27T12:00:00.000Z",
      updated_at: "2026-07-27T12:30:00.000Z",
      document: {
        schema_version: 1,
        stage: "production",
        title: "自由構成",
        summary: "",
        question: null,
        hypothesis: null,
        method: null,
        findings: [],
        limitations: [],
        logs: [],
        deck: {
          short_title: "自由構成",
          description: "",
          author: "研究者",
          year: 2026,
          accent: "#9d7bff",
          layout: "minimal",
          narration_defaults: null,
          slides: [
            {
              id: "canvas",
              title: "自由な一枚",
              duration_seconds: 45,
              reveal_steps: 1,
              tone: "dark",
              content_markdown: "legacy fallback",
              reveal_blocks: [],
              sidebar_markdown: null,
              narration: {
                display: "inline",
                speaker: null,
                segments: [
                  { at: 0, text: "最初の説明", audio_src: null },
                  { at: 1, text: "次の説明", audio_src: null }
                ]
              },
              composition: {
                mode: "canvas",
                background: "#102030",
                clip_content: true,
                blocks: [
                  {
                    id: "headline",
                    kind: "markdown",
                    frame: { x: 8, y: 8, width: 84, height: 24 },
                    z_index: 10,
                    at: 0,
                    animation: "fade",
                    markdown: "# <自由>な見出し",
                    style: { text_align: "center", font_scale: 1.2 }
                  },
                  {
                    id: "photo",
                    kind: "image",
                    frame: { x: 5, y: 35, width: 55, height: 58 },
                    z_index: 5,
                    at: 0,
                    animation: "rise",
                    asset_id: assetId,
                    alt_text: "観察写真",
                    fit: "cover"
                  },
                  {
                    id: "callout",
                    kind: "shape",
                    frame: { x: 64, y: 42, width: 30, height: 34 },
                    z_index: 20,
                    at: 1,
                    animation: "zoom",
                    shape: "ellipse",
                    label: "注目",
                    style: { background: "#ffcc33", foreground: "#111111" }
                  }
                ]
              }
            }
          ]
        }
      }
    });

    const html = renderPresentationHtml(project, {
      assetUrls: {
        [assetId]: `/presentation-assets/revision/${assetId}`
      }
    });
    expect(html).toContain('data-composition="canvas"');
    expect(html).toContain('data-region="canvas"');
    expect(html).toContain('data-block-id="headline"');
    expect(html).toContain('data-block-kind="image"');
    expect(html).toContain('data-reveal-at="1"');
    expect(html).toContain("left: 8%; top: 8%");
    expect(html).toContain(`/presentation-assets/revision/${assetId}`);
    expect(html).toContain("#102030");
    expect(html).toContain("&lt;自由&gt;な見出し");
    expect(html).not.toContain("legacy fallback");
  });

  it("rejects a canvas block outside the slide", () => {
    const parsed = projectRecordSchema.safeParse({
      project_id: "63ab1ec4-20a0-4cf6-a1a0-f74ced56778a",
      version: 1,
      created_at: "2026-07-27T12:00:00.000Z",
      updated_at: "2026-07-27T12:00:00.000Z",
      document: {
        schema_version: 1,
        stage: "production",
        title: "範囲外",
        summary: "",
        question: null,
        hypothesis: null,
        method: null,
        findings: [],
        limitations: [],
        logs: [],
        deck: {
          short_title: "範囲外",
          description: "",
          author: "",
          year: 2026,
          accent: "#9d7bff",
          layout: "minimal",
          narration_defaults: null,
          slides: [
            {
              id: "bad",
              title: "bad",
              duration_seconds: 30,
              reveal_steps: 0,
              tone: "dark",
              content_markdown: "fallback",
              reveal_blocks: [],
              sidebar_markdown: null,
              narration: null,
              composition: {
                mode: "canvas",
                background: "#000000",
                clip_content: true,
                blocks: [
                  {
                    id: "outside",
                    kind: "shape",
                    frame: { x: 90, y: 10, width: 20, height: 20 },
                    z_index: 0,
                    at: 0,
                    animation: "none",
                    shape: "rectangle",
                    label: null
                  }
                ]
              }
            }
          ]
        }
      }
    });
    expect(parsed.success).toBe(false);
  });

  it("renders nested registered Web Components with rich data visuals", async () => {
    const assetId = "50000000-0000-4000-8000-000000000005";
    const project = projectRecordSchema.parse({
      project_id: "63ab1ec4-20a0-4cf6-a1a0-f74ced56778a",
      version: 5,
      created_at: "2026-07-27T13:00:00.000Z",
      updated_at: "2026-07-27T13:30:00.000Z",
      document: {
        schema_version: 1,
        stage: "production",
        title: "リッチな構成",
        summary: "",
        question: null,
        hypothesis: null,
        method: null,
        findings: [],
        limitations: [],
        logs: [],
        deck: {
          short_title: "リッチな構成",
          description: "",
          author: "研究者",
          year: 2026,
          accent: "#ffcf32",
          layout: "cinematic",
          narration_defaults: null,
          slides: [
            {
              id: "rich-result",
              title: "結果",
              duration_seconds: 60,
              reveal_steps: 2,
              tone: "dark",
              content_markdown: "fallback",
              reveal_blocks: [],
              sidebar_markdown: null,
              narration: {
                display: "inline",
                speaker: null,
                segments: [
                  { at: 0, text: "最初の説明", audio_src: null },
                  { at: 1, text: "次の説明", audio_src: null }
                ]
              },
              composition: {
                mode: "scene",
                runtime_version: "uf-runtime@1",
                background: "#11100e",
                clip_content: true,
                nodes: [
                  {
                    id: "root",
                    kind: "stack",
                    parent_id: null,
                    order: 0,
                    at: 0,
                    animation: "none",
                    frame: null,
                    direction: "column",
                    gap_px: 22,
                    align: "stretch",
                    justify: "center",
                    wrap: false
                  },
                  {
                    id: "headline",
                    kind: "hero",
                    parent_id: "root",
                    order: 0,
                    at: 0,
                    animation: "fade",
                    frame: null,
                    eyebrow: "RESULT <unsafe>",
                    heading: "結果は、予想外。",
                    subtitle: "構造を保ったまま表現する",
                    align: "start"
                  },
                  {
                    id: "content-grid",
                    kind: "grid",
                    parent_id: "root",
                    order: 1,
                    at: 0,
                    animation: "none",
                    frame: null,
                    columns: 2,
                    gap_px: 20,
                    align: "stretch"
                  },
                  {
                    id: "trial-count",
                    kind: "metric",
                    parent_id: "content-grid",
                    order: 0,
                    at: 1,
                    animation: "zoom",
                    frame: null,
                    value: "12",
                    unit: "回",
                    caption: "試した回数",
                    emphasis: "signal"
                  },
                  {
                    id: "photo",
                    kind: "image",
                    parent_id: "content-grid",
                    order: 1,
                    at: 1,
                    animation: "rise",
                    frame: null,
                    asset_id: assetId,
                    alt_text: "観察写真",
                    fit: "cover",
                    caption: "固定された証拠"
                  },
                  {
                    id: "comparison",
                    kind: "bar_chart",
                    parent_id: "root",
                    order: 2,
                    at: 1,
                    animation: "rise",
                    frame: null,
                    max_value: 100,
                    items: [
                      { id: "before", at: 1, label: "変更前", value: 42, color: null },
                      { id: "after", at: 2, label: "変更後", value: 91, color: "#ffcf32" }
                    ]
                  }
                ]
              }
            }
          ]
        }
      }
    });

    const html = renderPresentationHtml(project, {
      assetUrls: { [assetId]: `/presentation-assets/revision/${assetId}` },
      frameAncestors: "'self'",
      editorFrame: true
    });
    expect(html).toContain('data-composition="scene"');
    expect(html).toContain('.slide[data-composition="flow"].tone-light');
    expect(html).toContain('[data-layout="minimal"] .slide[data-user-template="false"][data-composition="flow"]');
    expect(html).not.toContain('[data-layout="minimal"] .slide { background: #fff;');
    expect(html).toContain('--theme-surface: #05080dcc');
    expect(html).toContain('data-runtime-version="uf-runtime@1"');
    expect(html).toContain('data-display="inline"');
    expect(html).toContain('data-narration-at="1">次の説明</span>');
    expect(html).toContain("item.classList.toggle('is-current', current)");
    expect(html).toContain("<uf-stack");
    expect(html).toContain("<uf-grid");
    expect(html).toContain("<uf-hero");
    expect(html).toContain("<uf-metric");
    expect(html).toContain("<uf-bar-chart");
    expect(html).toContain('data-reveal-at="2"');
    expect(html).toContain("--bar-width: 91%");
    const rootRule = html.match(
      /\[data-node-id="root"\] \{([^}]*)\}/
    )?.[1];
    expect(rootRule).toContain("justify-content: center");
    expect(rootRule?.match(/justify-content/g)).toHaveLength(1);
    expect(rootRule).toContain("--component-font-scale: 1");
    expect(rootRule).not.toContain("font-size");
    expect(html).toContain(`/presentation-assets/revision/${assetId}`);
    expect(html).toContain("RESULT &lt;unsafe&gt;");
    expect(html).not.toContain("RESULT <unsafe>");
    expect(html).toContain("frame-ancestors 'self'");
    expect(html).toContain('data-editor-frame="true"');
    expect(html).toContain("customElements.define");
    expect(html).toContain('class="narration-track"');
    expect(html).toContain('data-fit-scroll="true"');
    expect(html).toContain("item.scrollIntoView");
    expect(html).toContain("target.dataset.overflow = String(overflowing)");
    expect(html).toContain("Math.max(0, target.scrollWidth - target.clientWidth)");
    expect(html).toContain("const collectClippedOverflow = (target)");
    expect(html).toContain("boundary.getBoundingClientRect()");
    expect(html).toContain("overflow.x > 1 || overflow.y > 1");
    expect(html).toContain("scale > .45");
    expect(html).toContain("setTimeout(scheduleFit, 300)");
    expect(html).toContain("uf-card h4");
    expect(html).toContain("uf-hero { gap: .45cqh");
    expect(html).toContain("var(--density-scale) * var(--fit-scale)");
    expect(html).toContain("@media (prefers-reduced-motion: reduce) { *, *::before, *::after");
    expect(html).not.toContain(">fallback<");

    const workspaceHtml = await slideWorkspacePage({
      twitchLogin: "researcher",
      csrfToken: "csrf-token",
      project,
      slideId: "rich-result"
    }).text();
    expect(workspaceHtml).toContain('class="component-outline-row"');
    expect(workspaceHtml).toContain('class="filmstrip-meta"');
    expect(workspaceHtml).toContain("60秒 · 3段階 · リッチ構成 6 component");
    expect(workspaceHtml).toContain("data-scene-component-editor");
    expect(workspaceHtml).toContain('data-component-id="headline"');
    expect(workspaceHtml).toContain('data-save-state data-state="saved"');
    expect(workspaceHtml).toContain("このcomponentを保存");
    expect(workspaceHtml).toContain("/components/headline");
    expect(workspaceHtml).toContain("/components/comparison");
    expect(workspaceHtml).toContain("グラフの最大値");
    expect(workspaceHtml).toContain("項目1 · ラベル");
    expect(workspaceHtml).toContain('data-component-path="items.0.value"');
    expect(workspaceHtml).toContain('class="component-step">STEP 1');
    expect(workspaceHtml).toContain("data-segment-editor");
    expect(workspaceHtml).toContain(">全文追従</span>");
    expect(workspaceHtml).toContain("スライド本文（Markdown対応）");
    expect(workspaceHtml).toContain("補足欄（読み上げない情報）");
    expect(workspaceHtml).toContain("data-preview-focus");
    expect(workspaceHtml).toContain("プレビューを広げる");
    expect(workspaceHtml).toContain("別画面で開く");
    expect(workspaceHtml).toContain("標準（短文・箇条書き）");
    expect(workspaceHtml.indexOf(">root<")).toBeLessThan(
      workspaceHtml.indexOf(">headline<")
    );
    expect(workspaceHtml).not.toContain("parent: root");

    const projectWithNextSlide = projectRecordSchema.parse({
      ...project,
      document: {
        ...project.document,
        deck: {
          ...project.document.deck!,
          slides: [
            ...project.document.deck!.slides,
            {
              ...project.document.deck!.slides[0],
              id: "conclusion",
              title: "まとめ"
            }
          ]
        }
      }
    });
    const sequentialWorkspaceHtml = await slideWorkspacePage({
      twitchLogin: "researcher",
      csrfToken: "csrf-token",
      project: projectWithNextSlide,
      slideId: "rich-result"
    }).text();
    expect(sequentialWorkspaceHtml).toContain("保存して次へ");
    expect(sequentialWorkspaceHtml).toContain(
      'data-save-next="/dashboard/projects/63ab1ec4-20a0-4cf6-a1a0-f74ced56778a/slides/conclusion"'
    );
    expect(sequentialWorkspaceHtml).toContain("次のスライド →");

    const overLimitProject = projectRecordSchema.parse({
      ...projectWithNextSlide,
      document: {
        ...projectWithNextSlide.document,
        question: "素材によって温度変化はどう変わるか？",
        method: "2種類を同じ条件で比較する。",
        deck: {
          ...projectWithNextSlide.document.deck!,
          slides: projectWithNextSlide.document.deck!.slides.map((slide) => ({
            ...slide,
            duration_seconds: 700
          }))
        }
      }
    });
    const overLimitHtml = await projectDetailPage({
      twitchLogin: "researcher",
      csrfToken: "csrf-token",
      project: overLimitProject,
      assets: [],
      publication: {
        project_id: overLimitProject.project_id,
        draft_version: overLimitProject.version,
        current_renderer_version: PRESENTATION_RENDERER_VERSION,
        slug: null,
        latest_preview: null,
        published: null
      }
    }).text();
    expect(overLimitHtml).toContain("23分20秒");
    expect(overLimitHtml).toContain("20分以内を3分20秒超えています");
    expect(overLimitHtml).toContain('<dt>想定時間</dt><dd data-state="warning">23分20秒 · 20分超過</dd>');
    expect(overLimitHtml).toContain("発表を20分以内に収める");
    expect(overLimitHtml).toContain('data-duration-valid="false" data-published-current="false" disabled');
  });

  it("maps every safe visual and font preset and renders bounded narration variants", () => {
    const visuals = [
      "studio",
      "paper",
      "editorial",
      "neon",
      "retro-game",
      "soft-pop",
      "scientific"
    ] as const;
    const fonts = [
      "system-sans",
      "gothic",
      "rounded",
      "mincho",
      "serif",
      "monospace",
      "display"
    ] as const;
    const project = projectRecordSchema.parse({
      project_id: "63ab1ec4-20a0-4cf6-a1a0-f74ced56778a",
      version: 6,
      created_at: "2026-07-28T12:00:00.000Z",
      updated_at: "2026-07-28T12:30:00.000Z",
      document: {
        schema_version: 1,
        stage: "production",
        title: "表示preset",
        summary: "",
        question: null,
        hypothesis: null,
        method: null,
        findings: [],
        limitations: [],
        logs: [],
        deck: {
          short_title: "表示preset",
          description: "",
          author: "研究者",
          year: 2026,
          accent: "#44ddaa",
          layout: "minimal",
          narration_defaults: {
            display: "subtitle",
            speaker: "四国めたん",
            credit: null,
            appearance: {
              placement: "bottom",
              speaker_visible: true,
              max_lines: 2
            }
          },
          templates: visuals.map((visual, index) => ({
            id: `preset-${index}`,
            name: visual,
            region_layout: "single",
            sidebar_width_percent: 28,
            background: "#182234",
            surface: "#0b1220",
            foreground: "#f8fafc",
            muted: "#a9b5c7",
            accent: "#44ddaa",
            corner_radius_px: 8,
            spacing_scale: 1,
            font_scale: 1,
            enter_animation: index === 0 ? "slide-left" : "fade",
            reveal_animation: index === 1 ? "blur" : "pop",
            visual_preset: visual,
            body_font: fonts[index],
            heading_font: fonts[fonts.length - index - 1],
            density: index % 2 === 0 ? "spacious" : "compact",
            motion_style: index % 2 === 0 ? "dramatic" : "calm"
          })),
          default_template_id: null,
          slides: visuals.map((visual, index) => ({
            id: `slide-${index}`,
            title: visual,
            duration_seconds: 30,
            reveal_steps: 0,
            tone: "dark",
            template_id: `preset-${index}`,
            enter_animation: null,
            composition: null,
            content_markdown: `# ${visual}\n日本語の本文`,
            reveal_blocks: [],
            sidebar_markdown: null,
            narration: {
              display: index === 0 ? "subtitle" : index === 1 ? "minimal" : "dialogue",
              speaker: index === 0 ? "四国めたん" : null,
              appearance: index === 1 ? { size: "compact", text_align: "center" } : {},
              segments: [{ at: 0, text: `${visual}の説明`, audio_src: null }]
            }
          }))
        }
      }
    });

    const html = renderPresentationHtml(project, { editorFrame: true });
    for (const visual of visuals) {
      expect(html).toContain(`data-visual-preset="${visual}"`);
      expect(html).toContain(`[data-visual-preset="${visual}"]`);
    }
    for (const font of fonts) {
      expect(html).toContain(`data-body-font="${font}"`);
      expect(html).toContain(`[data-body-font="${font}"]`);
      expect(html).toContain(`[data-heading-font="${font}"]`);
    }
    expect(html).toContain('data-display="subtitle"');
    expect(html).toContain('data-display="minimal"');
    expect(html).toContain('class="narration-speaker">四国めたん</span>');
    expect(html).toContain('.narration[data-display="subtitle"]');
    expect(html).toContain('.narration[data-display="minimal"]');
    expect(html).toContain('data-animation="slide-left"');
    expect(html).toContain('@keyframes slide-blur');
  });

  it("rejects cyclic or invalid scene parent relationships", () => {
    const base = {
      mode: "scene" as const,
      runtime_version: "uf-runtime@1" as const,
      background: "#11100e",
      clip_content: true
    };
    const cycle = slideCompositionSchema.safeParse({
      ...base,
      nodes: [
        {
          id: "first",
          kind: "stack",
          parent_id: "second",
          order: 0,
          at: 0,
          animation: "none",
          frame: null,
          direction: "column",
          gap_px: 0,
          align: "stretch",
          justify: "start",
          wrap: false
        },
        {
          id: "second",
          kind: "stack",
          parent_id: "first",
          order: 1,
          at: 0,
          animation: "none",
          frame: null,
          direction: "column",
          gap_px: 0,
          align: "stretch",
          justify: "start",
          wrap: false
        }
      ]
    });
    expect(cycle.success).toBe(false);

    const leafParent = slideCompositionSchema.safeParse({
      ...base,
      nodes: [
        {
          id: "metric",
          kind: "metric",
          parent_id: null,
          order: 0,
          at: 0,
          animation: "none",
          frame: null,
          value: "1",
          unit: null,
          caption: "親にはできない",
          emphasis: "normal"
        },
        {
          id: "child",
          kind: "markdown",
          parent_id: "metric",
          order: 0,
          at: 0,
          animation: "none",
          frame: null,
          markdown: "child"
        }
      ]
    });
    expect(leafParent.success).toBe(false);
  });
});
