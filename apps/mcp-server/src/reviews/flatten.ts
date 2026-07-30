import type { ProjectRecord, SlideSceneNode } from "../projects/schema";

type PresentationSlide = NonNullable<ProjectRecord["document"]["deck"]>["slides"][number];

export type ReviewSourceKind = "slide" | "content" | "narration";

export type SlideReviewSource = {
  key: string;
  kind: ReviewSourceKind;
  label: string;
  text: string;
  step: number | null;
};

export type ReviewAnchorState = "current" | "moved" | "stale" | "whole";

export type ReviewAnchor = {
  state: ReviewAnchorState;
  start: number | null;
  end: number | null;
};

function addSource(
  sources: SlideReviewSource[],
  source: SlideReviewSource | null
): void {
  if (source !== null && source.text.length > 0) sources.push(source);
}

function textSource(
  key: string,
  kind: ReviewSourceKind,
  label: string,
  text: string | null | undefined,
  step: number | null = null
): SlideReviewSource | null {
  return text === null || text === undefined || text.length === 0
    ? null
    : { key, kind, label, text, step };
}

function flattenSceneNode(node: SlideSceneNode): SlideReviewSource[] {
  const sources: SlideReviewSource[] = [];
  const add = (field: string, label: string, text: string | null | undefined) =>
    addSource(
      sources,
      textSource(`scene:${node.id}:${field}`, "content", `${label} · ${node.id}`, text, node.at)
    );

  switch (node.kind) {
    case "hero":
      add("eyebrow", "前置き", node.eyebrow);
      add("heading", "見出し", node.heading);
      add("subtitle", "副題", node.subtitle);
      break;
    case "markdown":
      add("markdown", "本文", node.markdown);
      break;
    case "image":
      add("alt_text", "画像の説明", node.alt_text);
      add("caption", "画像の注釈", node.caption);
      break;
    case "shape":
      add("label", "図形の文字", node.label);
      break;
    case "card":
      add("label", "カード見出し", node.label);
      add("markdown", "カード本文", node.markdown);
      break;
    case "metric":
      add("value", "主要値", node.value);
      add("unit", "単位", node.unit);
      add("caption", "主要値の説明", node.caption);
      break;
    case "quote":
      add("quote", "引用", node.quote);
      add("attribution", "引用元", node.attribution);
      break;
    case "callout":
      add("label", "注目ラベル", node.label);
      add("heading", "注目見出し", node.heading);
      add("markdown", "注目本文", node.markdown);
      break;
    case "bar_chart":
      node.items.forEach((item, index) => {
        addSource(
          sources,
          textSource(
            `scene:${node.id}:items:${item.id}:label`,
            "content",
            `棒グラフ ${index + 1} · ${node.id}`,
            item.label,
            item.at
          )
        );
      });
      break;
    case "timeline":
      node.items.forEach((item, index) => {
        const prefix = `scene:${node.id}:items:${item.id}`;
        addSource(sources, textSource(`${prefix}:kicker`, "content", `年表 ${index + 1}の補助`, item.kicker, item.at));
        addSource(sources, textSource(`${prefix}:heading`, "content", `年表 ${index + 1}の見出し`, item.heading, item.at));
        addSource(sources, textSource(`${prefix}:detail`, "content", `年表 ${index + 1}の詳細`, item.detail, item.at));
      });
      break;
    case "layer":
    case "stack":
    case "grid":
      break;
  }
  return sources;
}

export function flattenSlideReviewSources(slide: PresentationSlide): SlideReviewSource[] {
  const sources: SlideReviewSource[] = [
    { key: "slide:whole", kind: "slide", label: "スライド全体", text: "", step: null },
    { key: "slide:title", kind: "content", label: "スライドタイトル", text: slide.title, step: null }
  ];

  if (slide.composition?.mode === "canvas") {
    for (const block of slide.composition.blocks) {
      if (block.kind === "markdown") {
        addSource(sources, textSource(`canvas:${block.id}:markdown`, "content", `本文パーツ · ${block.id}`, block.markdown, block.at));
      } else if (block.kind === "image") {
        addSource(sources, textSource(`canvas:${block.id}:alt_text`, "content", `画像の説明 · ${block.id}`, block.alt_text, block.at));
      } else {
        addSource(sources, textSource(`canvas:${block.id}:label`, "content", `図形の文字 · ${block.id}`, block.label, block.at));
      }
    }
    addSource(sources, textSource("slide:content", "content", "スライドの代替テキスト", slide.content_markdown));
    addSource(sources, textSource("slide:sidebar", "content", "代替の補足情報", slide.sidebar_markdown));
  } else if (slide.composition?.mode === "scene") {
    for (const node of slide.composition.nodes) sources.push(...flattenSceneNode(node));
    addSource(sources, textSource("slide:content", "content", "スライドの代替テキスト", slide.content_markdown));
    addSource(sources, textSource("slide:sidebar", "content", "代替の補足情報", slide.sidebar_markdown));
  } else {
    addSource(sources, textSource("slide:content", "content", "画面の本文", slide.content_markdown));
    addSource(sources, textSource("slide:sidebar", "content", "読み上げない補足", slide.sidebar_markdown));
  }
  for (const reveal of slide.reveal_blocks) {
    addSource(sources, textSource(`slide:reveal:${reveal.at}`, "content", `STEP ${reveal.at}の追加表示`, reveal.markdown, reveal.at));
  }

  for (const segment of slide.narration?.segments ?? []) {
    addSource(sources, textSource(`narration:${segment.at}`, "narration", `STEP ${segment.at}の読み上げ`, segment.text, segment.at));
  }
  return sources;
}

export function resolveReviewAnchor(
  sourceText: string | null,
  rangeStart: number | null,
  rangeEnd: number | null,
  selectedText: string
): ReviewAnchor {
  if (rangeStart === null || rangeEnd === null) {
    return { state: "whole", start: null, end: null };
  }
  if (sourceText === null || selectedText.length === 0) {
    return { state: "stale", start: null, end: null };
  }
  if (sourceText.slice(rangeStart, rangeEnd) === selectedText) {
    return { state: "current", start: rangeStart, end: rangeEnd };
  }
  const first = sourceText.indexOf(selectedText);
  if (first >= 0 && sourceText.indexOf(selectedText, first + 1) === -1) {
    return { state: "moved", start: first, end: first + selectedText.length };
  }
  return { state: "stale", start: null, end: null };
}
