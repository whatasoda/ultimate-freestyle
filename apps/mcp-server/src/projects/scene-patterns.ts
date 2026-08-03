import { z } from "zod";

import type { SlideSceneNode } from "./schema";

export const scenePatternSchema = z.enum([
  "pattern-claim-evidence",
  "pattern-comparison",
  "pattern-key-metrics",
  "pattern-timeline"
]);

export type ScenePattern = z.infer<typeof scenePatternSchema>;

export const SCENE_PATTERN_OPTIONS: ReadonlyArray<{
  value: ScenePattern;
  label: string;
  description: string;
}> = [
  {
    value: "pattern-claim-evidence",
    label: "主張＋根拠",
    description: "大見出しの下に、根拠と注目点を横並びで置きます。"
  },
  {
    value: "pattern-comparison",
    label: "2案を比較",
    description: "比較の観点と、左右2つの説明欄をまとめて置きます。"
  },
  {
    value: "pattern-key-metrics",
    label: "3つの数値",
    description: "結論を支える主要な数値を、同じ強さで3つ並べます。"
  },
  {
    value: "pattern-timeline",
    label: "経過・手順",
    description: "見出しと時系列をまとめ、実験手順や変化を示します。"
  }
];

type ScenePatternOptions = {
  pattern: ScenePattern;
  rootId: string;
  parentId: string | null;
  order: number;
  frame: SlideSceneNode["frame"];
  at: number;
};

export class ScenePatternPlanError extends Error {}

type ScenePatternInsertionOptions = {
  existingNodes: SlideSceneNode[];
  pattern: ScenePattern;
  parentId: string | null;
  rootId?: string;
  order?: number;
  frame?: SlideSceneNode["frame"];
  at?: number;
};

const baseNode = (
  id: string,
  parentId: string | null,
  order: number,
  at: number,
  animation: SlideSceneNode["animation"],
  frame: SlideSceneNode["frame"] = null
) => ({ id, parent_id: parentId, order, at, animation, frame });

export function createScenePatternNodes(options: ScenePatternOptions): SlideSceneNode[] {
  const root = {
    ...baseNode(
      options.rootId,
      options.parentId,
      options.order,
      options.at,
      "none",
      options.frame
    ),
    kind: "stack" as const,
    direction: "column" as const,
    gap_px: 20,
    align: "stretch" as const,
    justify: "start" as const,
    wrap: false
  };
  const headingId = `${options.rootId}-heading`;
  const heading: SlideSceneNode = {
    ...baseNode(headingId, options.rootId, 0, options.at, "fade"),
    kind: "hero",
    eyebrow: null,
    heading: "この一枚で伝えたいこと",
    subtitle: "内容に合わせて見出しと各パーツを書き換えます。",
    align: "start"
  };

  if (options.pattern === "pattern-timeline") {
    return [
      root,
      heading,
      {
        ...baseNode(`${options.rootId}-timeline`, options.rootId, 1, options.at, "rise"),
        kind: "timeline",
        items: [
          {
            id: "item-1",
            at: options.at,
            kicker: "STEP 1",
            heading: "最初の出来事",
            detail: "ここに手順や観察した変化を書きます。"
          },
          {
            id: "item-2",
            at: options.at,
            kicker: "STEP 2",
            heading: "次の出来事",
            detail: "必要に応じて項目を増減できます。"
          }
        ]
      }
    ];
  }

  const gridId = `${options.rootId}-items`;
  const columns = options.pattern === "pattern-key-metrics" ? 3 : 2;
  const grid: SlideSceneNode = {
    ...baseNode(gridId, options.rootId, 1, options.at, "none"),
    kind: "grid",
    columns,
    gap_px: 18,
    align: "stretch"
  };

  if (options.pattern === "pattern-key-metrics") {
    return [
      root,
      heading,
      grid,
      ...[1, 2, 3].map<SlideSceneNode>((position) => ({
        ...baseNode(
          `${options.rootId}-metric-${position}`,
          gridId,
          position - 1,
          options.at,
          "rise"
        ),
        kind: "metric",
        value: "0",
        unit: null,
        caption: `指標${position}の説明`,
        emphasis: position === 1 ? "signal" : "strong"
      }))
    ];
  }

  if (options.pattern === "pattern-comparison") {
    return [
      root,
      heading,
      grid,
      {
        ...baseNode(`${options.rootId}-left`, gridId, 0, options.at, "rise"),
        kind: "card",
        label: "A",
        markdown: "## 比較対象A\n\n特徴や結果を書きます。",
        variant: "plain"
      },
      {
        ...baseNode(`${options.rootId}-right`, gridId, 1, options.at, "rise"),
        kind: "card",
        label: "B",
        markdown: "## 比較対象B\n\n同じ観点で特徴や結果を書きます。",
        variant: "accent"
      }
    ];
  }

  return [
    root,
    heading,
    grid,
    {
      ...baseNode(`${options.rootId}-evidence`, gridId, 0, options.at, "rise"),
      kind: "card",
      label: "EVIDENCE",
      markdown: "## 根拠\n\n観察や測定で得た事実を書きます。",
      variant: "plain"
    },
    {
      ...baseNode(`${options.rootId}-point`, gridId, 1, options.at, "rise"),
      kind: "callout",
      label: "POINT",
      heading: "事実から言えること",
      markdown: "根拠と解釈を分けて整理します。",
      variant: "info"
    }
  ];
}

export function planScenePatternInsertion(
  options: ScenePatternInsertionOptions
): SlideSceneNode[] {
  const parent = options.parentId === null
    ? undefined
    : options.existingNodes.find((node) => node.id === options.parentId);
  if (
    options.parentId !== null &&
    (parent === undefined || !["layer", "stack", "grid"].includes(parent.kind))
  ) {
    throw new ScenePatternPlanError("The selected parent cannot contain components.");
  }
  const siblings = options.existingNodes.filter((node) => node.parent_id === options.parentId);
  const order = options.order ?? Math.min(
    999,
    Math.max(-1, ...siblings.map((node) => node.order)) + 1
  );
  const frame = options.frame !== undefined
    ? options.frame
    : parent?.kind === "stack" || parent?.kind === "grid"
      ? null
      : { x: 5, y: 5, width: 90, height: 90 };
  const used = new Set(options.existingNodes.map((node) => node.id));
  const base = options.pattern.replace("pattern-", "group-");
  let suffix = 1;
  let rootId = options.rootId ?? `${base}-${suffix}`;
  let nodes = createScenePatternNodes({
    pattern: options.pattern,
    rootId,
    parentId: options.parentId,
    order,
    frame,
    at: options.at ?? 0
  });
  if (options.rootId === undefined) {
    while (nodes.some((node) => used.has(node.id))) {
      suffix += 1;
      rootId = `${base}-${suffix}`;
      nodes = createScenePatternNodes({
        pattern: options.pattern,
        rootId,
        parentId: options.parentId,
        order,
        frame,
        at: options.at ?? 0
      });
    }
  } else if (nodes.some((node) => used.has(node.id))) {
    throw new ScenePatternPlanError(
      "The pattern would create a slide component that already exists."
    );
  }
  if (nodes.some((node) => node.id.length > 63)) {
    throw new ScenePatternPlanError(
      "The root ID must be short enough for the pattern child IDs."
    );
  }
  if (options.existingNodes.length + nodes.length > 200) {
    throw new ScenePatternPlanError("The scene component limit would be exceeded.");
  }
  return nodes;
}
