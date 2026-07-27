import { describe, expect, it } from "vitest";

import { renderPresentationHtml } from "../src/presentation/render";
import {
  projectRecordSchema,
  slideCompositionSchema
} from "../src/projects/schema";

describe("presentation artifact renderer", () => {
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
              corner_radius_px: 12,
              spacing_scale: 1,
              font_scale: 1,
              enter_animation: "wipe",
              reveal_animation: "zoom"
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
              content_markdown: "# 結果\n<script>alert('content')</script>\n- 記録A",
              reveal_blocks: [
                { at: 1, markdown: "追加で見せる証拠" }
              ],
              sidebar_markdown: "作者コメント",
              narration: {
                display: "commentary",
                speaker: null,
                segments: [
                  {
                    at: 0,
                    text: "読み上げにも </script><script>alert('voice')</script>",
                    audio_src: null
                  }
                ]
              }
            }
          ]
        }
      }
    });

    const html = renderPresentationHtml(project);
    expect(html).toContain('<meta http-equiv="Content-Security-Policy"');
    expect(html).toContain('class="stage"');
    expect(html).toContain('id="voice-progress"');
    expect(html).toContain('id="volume"');
    expect(html).toContain("history.pushState");
    expect(html).toContain("speechSynthesis");
    expect(html).toContain('data-reveal="1"');
    expect(html).toContain('data-slide-id="result"');
    expect(html).toContain('data-template-id="my-biim"');
    expect(html).toContain('data-region="sidebar"');
    expect(html).toContain('data-reveal-at="1"');
    expect(html).toContain('--template-sidebar-width: 34%');
    expect(html).toContain("classList.toggle('is-visible'");
    expect(html).toContain("&lt;script&gt;alert(&#039;content&#039;)&lt;/script&gt;");
    expect(html).toContain("\\u003c/script\\u003e\\u003cscript");
    expect(html).not.toContain("<script>alert('content')</script>");
    expect(html).not.toContain("<script>alert('voice')</script>");
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
              narration: null,
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

  it("renders nested registered Web Components with rich data visuals", () => {
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
              narration: null,
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
    expect(html).toContain('data-runtime-version="uf-runtime@1"');
    expect(html).toContain("<uf-stack");
    expect(html).toContain("<uf-grid");
    expect(html).toContain("<uf-hero");
    expect(html).toContain("<uf-metric");
    expect(html).toContain("<uf-bar-chart");
    expect(html).toContain('data-reveal-at="2"');
    expect(html).toContain("--bar-width: 91%");
    expect(html).toContain(`/presentation-assets/revision/${assetId}`);
    expect(html).toContain("RESULT &lt;unsafe&gt;");
    expect(html).not.toContain("RESULT <unsafe>");
    expect(html).toContain("frame-ancestors 'self'");
    expect(html).toContain('data-editor-frame="true"');
    expect(html).toContain("customElements.define");
    expect(html).not.toContain("fallback");
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
