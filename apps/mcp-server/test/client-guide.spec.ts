import { describe, expect, it } from "vitest";

import {
  CLIENT_GUIDE_INFORMATION_DATE,
  renderClientChoiceGuide
} from "../src/web/client-guide";

describe("AI client choice guide", () => {
  it("starts with Remote MCP availability and reaches every supported client", () => {
    const html = renderClientChoiceGuide();

    expect(html).toContain("任意のMCP URLを登録する場所がありますか");
    expect(html).toContain('href="#claude-web"');
    expect(html).toContain('href="#claude-code"');
    expect(html).toContain('href="#codex"');
    expect(html).toContain('href="#chatgpt"');
    expect(html).toContain("Developer modeの表示が必須");
  });

  it("keeps plan prices, limitations, and the information date visible", () => {
    const html = renderClientChoiceGuide();

    expect(html).toContain("カスタムRemote MCPは1件まで");
    expect(html).toContain("Pro · $20/月");
    expect(html).toContain("Go · $8/月");
    expect(html).toContain("Plus · $20/月");
    expect(html).toContain("料金より利用可否の確認が先");
    expect(html).toContain(CLIENT_GUIDE_INFORMATION_DATE);
  });
});
