import { describe, expect, it } from "vitest";

import {
  parseMermaidFlowchart,
  renderMermaidFlowchart
} from "../src/presentation/mermaid";
import {
  applyPronunciations,
  effectivePronunciations
} from "../src/projects/pronunciation";
import { projectDocumentSchema } from "../src/projects/schema";

describe("Mermaid flowchart", () => {
  it("parses nodes, arrows, labels, and supported shapes", () => {
    expect(parseMermaidFlowchart(`flowchart LR
      input[入力] --> process(集計)
      process -- 公開 --> result{結果}`)).toEqual({
      direction: "LR",
      nodes: [
        { id: "input", label: "入力", shape: "rect" },
        { id: "process", label: "集計", shape: "round" },
        { id: "result", label: "結果", shape: "diamond" }
      ],
      edges: [
        { from: "input", to: "process", label: null },
        { from: "process", to: "result", label: "公開" }
      ]
    });
  });

  it("renders escaped SVG without executing Mermaid source", () => {
    const html = renderMermaidFlowchart(`flowchart TD
      a[<script>alert(1)</script>] --> b[公開]`);

    expect(html).toContain('<svg viewBox="0 0 1000 520" role="img"');
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
  });

  it("returns an in-slide error for unsupported syntax", () => {
    expect(renderMermaidFlowchart("sequenceDiagram\nA->>B: hello")).toContain(
      "Mermaid図の記法を確認してください"
    );
  });
});

describe("narration pronunciations", () => {
  it("applies segment entries over deck entries without chained replacement", () => {
    const deck = [
      { surface: "kashiwo love", reading: "カシヲラブ" },
      { surface: "love", reading: "ラブ" },
      { surface: "カシヲ", reading: "別の読み" }
    ];
    const segment = [{ surface: "love", reading: "LOVE" }];

    expect(effectivePronunciations(deck, segment)[0]?.surface).toBe("kashiwo love");
    expect(applyPronunciations("kashiwo love と love", deck, segment)).toBe(
      "カシヲラブ と LOVE"
    );
  });

  it("rejects duplicate surfaces within one dictionary", () => {
    const parsed = projectDocumentSchema.safeParse({
      schema_version: 1,
      title: "読み辞書",
      summary: "",
      deck: {
        short_title: "読み辞書",
        description: "",
        author: "",
        year: 2026,
        accent: "#336699",
        layout: "minimal",
        narration_defaults: null,
        pronunciations: [
          { surface: "daifuku", reading: "だいふく" },
          { surface: "daifuku", reading: "ダイフク" }
        ],
        slides: []
      }
    });

    expect(parsed.success).toBe(false);
  });
});
