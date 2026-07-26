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
          narration_defaults: null,
          slides: [
            {
              id: "result",
              title: "結果",
              duration_seconds: 60,
              reveal_steps: 1,
              tone: "dark",
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
});
