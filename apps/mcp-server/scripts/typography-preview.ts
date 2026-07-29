import { renderPresentationHtml } from "../src/presentation/render";
import { createEmptyProject, projectRecordSchema } from "../src/projects/schema";

const content = `# 氷が溶ける速さと素材の関係
同じ室温に置いた氷でも、接している素材によって溶ける速さは変わります。金属は触ると冷たく感じますが、それは金属自体の温度が特別に低いからではなく、手から熱を速く移動させる性質があるためです。

## 実験方法
同じ製氷皿で作った氷を金属トレー、木の板、乾いた布の上へ同時に置きました。日光やエアコンの風が直接当たらない場所を選び、素材は実験前に同じ部屋へ三十分置いて温度をそろえました。

一分ごとに写真を撮り、氷の輪郭と溶けた水の広がりを記録しました。実験は三回繰り返し、完全に溶けるまでの時間だけでなく、五分ごとの見た目の変化も比較しました。

## 読み取れること
- 金属では周囲から氷へ熱が移動しやすい
- 木は金属より熱を伝えにくい
- 布は空気を多く含み、熱の移動をさらに遅らせる

今回の結果だけで素材一般の性質を断定することはできません。素材の厚さ、表面積、開始温度、溶けた水の残り方も結果へ影響するため、次の実験では表面温度を測り、氷の質量もそろえる必要があります。`;
const presets = ["statement", "standard", "article", "columns", "dense"] as const;

const createPreviewHtml = (aspectRatio: "16:9" | "4:3", loadingEnabled: boolean) => {
  const document = createEmptyProject("文章主体スライドの組版確認");
  document.deck = {
    short_title: "文章組版",
    description: "",
    author: "Codex",
    year: 2026,
    accent: "#4f91e8",
    layout: "minimal",
    aspect_ratio: aspectRatio,
    loading_screen: {
      enabled: loadingEnabled,
      style: "orbit",
      message: "画像・音声・フォントを準備しています",
      show_progress: true,
      minimum_duration_ms: 500
    },
    narration_defaults: null,
    voicevox: null,
    slides: presets.map((preset) => ({
      id: preset,
      title: preset,
      duration_seconds: 30,
      reveal_steps: 0,
      tone: "light" as const,
      role: "content" as const,
      typography: { preset },
      content_markdown: content,
      reveal_blocks: [],
      sidebar_markdown: null,
      narration: null
    }))
  };

  return renderPresentationHtml(
    projectRecordSchema.parse({
      project_id: "10000000-0000-4000-8000-000000000099",
      version: 1,
      document,
      created_at: "2026-07-29T00:00:00.000Z",
      updated_at: "2026-07-29T00:00:00.000Z"
    })
  );
};

const previews: Record<string, string> = {
  "16:9:false": createPreviewHtml("16:9", false),
  "16:9:true": createPreviewHtml("16:9", true),
  "4:3:false": createPreviewHtml("4:3", false),
  "4:3:true": createPreviewHtml("4:3", true)
};
const port = Number(process.env.TYPOGRAPHY_PREVIEW_PORT ?? 4319);

Bun.serve({
  port,
  fetch: (request) => {
    const search = new URL(request.url).searchParams;
    const ratio = search.get("ratio") === "4:3" ? "4:3" : "16:9";
    const loading = search.get("loading") === "1";
    return new Response(previews[`${ratio}:${loading}`], { headers: { "content-type": "text/html; charset=utf-8" } });
  }
});

console.log(`Typography preview: http://127.0.0.1:${port}/?slide=3&step=0`);
console.log(`Loading preview: http://127.0.0.1:${port}/?loading=1&slide=0`);
