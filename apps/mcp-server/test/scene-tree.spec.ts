import { describe, expect, it } from "vitest";

import { slideCompositionSchema, type SlideSceneNode } from "../src/projects/schema";
import {
  deleteSceneSubtree,
  duplicateSceneSubtree,
  sceneFrameForParent,
  SceneTreeOperationError
} from "../src/projects/scene-tree";

const sceneNodes = (): SlideSceneNode[] => [
  {
    id: "root",
    parent_id: null,
    order: 0,
    at: 0,
    animation: "none",
    frame: { x: 5, y: 5, width: 40, height: 90 },
    kind: "stack",
    direction: "column",
    gap_px: 16,
    align: "stretch",
    justify: "start",
    wrap: false
  },
  {
    id: "heading",
    parent_id: "root",
    order: 0,
    at: 0,
    animation: "fade",
    frame: null,
    kind: "hero",
    eyebrow: null,
    heading: "見出し",
    subtitle: null,
    align: "start"
  },
  {
    id: "items",
    parent_id: "root",
    order: 1,
    at: 0,
    animation: "none",
    frame: null,
    kind: "grid",
    columns: 2,
    gap_px: 16,
    align: "stretch"
  },
  {
    id: "metric",
    parent_id: "items",
    order: 0,
    at: 1,
    animation: "rise",
    frame: null,
    kind: "metric",
    value: "3",
    unit: "回",
    caption: "試行回数",
    emphasis: "strong"
  },
  {
    id: "after",
    parent_id: null,
    order: 1,
    at: 0,
    animation: "fade",
    frame: { x: 52, y: 5, width: 43, height: 90 },
    kind: "markdown",
    markdown: "次の内容"
  }
];

const parseScene = (nodes: SlideSceneNode[]) => slideCompositionSchema.parse({
  mode: "scene",
  runtime_version: "uf-runtime@1",
  background: "#11100e",
  clip_content: true,
  nodes
});

describe("scene tree operations", () => {
  it("adapts frames to the selected parent layout", () => {
    const frame = { x: 10, y: 10, width: 40, height: 40 };

    expect(sceneFrameForParent(frame, "stack")).toBeNull();
    expect(sceneFrameForParent(frame, "grid")).toBeNull();
    expect(sceneFrameForParent(null, "layer")).toEqual({ x: 5, y: 5, width: 90, height: 90 });
    expect(sceneFrameForParent(frame, "layer")).toBe(frame);
    expect(sceneFrameForParent(null, null)).toBeNull();
  });

  it("duplicates a complete subtree and remaps every parent", () => {
    const duplicated = duplicateSceneSubtree(sceneNodes(), "root");

    expect(duplicated.copiedIds).toHaveLength(4);
    expect(duplicated.rootCopyId).toBe("root-copy");
    expect(duplicated.nodes.find((node) => node.id === "root-copy")).toMatchObject({
      parent_id: null,
      order: 1,
      frame: { x: 8, y: 8, width: 40, height: 90 }
    });
    expect(duplicated.nodes.find((node) => node.id === "metric-copy")).toMatchObject({
      parent_id: "items-copy",
      value: "3"
    });
    expect(duplicated.nodes.find((node) => node.id === "after")).toMatchObject({ order: 2 });
    expect(() => parseScene(duplicated.nodes)).not.toThrow();
  });

  it("uses collision-free IDs when duplicating repeatedly", () => {
    const first = duplicateSceneSubtree(sceneNodes(), "root");
    const second = duplicateSceneSubtree(first.nodes, "root");

    expect(second.rootCopyId).toBe("root-copy-2");
    expect(second.copiedIds).toContain("metric-copy-2");
    expect(new Set(second.nodes.map((node) => node.id)).size).toBe(second.nodes.length);
  });

  it("deletes descendants together and normalizes the remaining order", () => {
    const deleted = deleteSceneSubtree(sceneNodes(), "root");

    expect(deleted.deletedIds).toEqual(expect.arrayContaining(["root", "heading", "items", "metric"]));
    expect(deleted.nodes).toEqual([expect.objectContaining({ id: "after", order: 0 })]);
    expect(() => parseScene(deleted.nodes)).not.toThrow();
  });

  it("rejects unknown roots", () => {
    expect(() => duplicateSceneSubtree(sceneNodes(), "missing")).toThrow(SceneTreeOperationError);
    expect(() => deleteSceneSubtree(sceneNodes(), "missing")).toThrow(SceneTreeOperationError);
  });
});
