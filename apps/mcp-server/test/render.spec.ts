import { describe, expect, it } from "vitest";

import { renderPresentationHtml } from "../src/presentation/render";
import { projectRecordSchema } from "../src/projects/schema";

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
});
