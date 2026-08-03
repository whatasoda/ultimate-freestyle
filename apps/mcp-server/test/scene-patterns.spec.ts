import { describe, expect, it } from "vitest";

import {
  createScenePatternNodes,
  planScenePatternInsertion,
  ScenePatternPlanError,
  scenePatternSchema
} from "../src/projects/scene-patterns";
import { slideCompositionSchema } from "../src/projects/schema";

describe("scene component patterns", () => {
  it.each(scenePatternSchema.options)("creates a valid editable tree for %s", (pattern) => {
    const nodes = createScenePatternNodes({
      pattern,
      rootId: "research-group",
      parentId: null,
      order: 0,
      frame: { x: 5, y: 5, width: 90, height: 90 },
      at: 0
    });

    expect(nodes[0]).toMatchObject({
      id: "research-group",
      kind: "stack",
      parent_id: null
    });
    expect(nodes.length).toBeGreaterThanOrEqual(3);
    expect(new Set(nodes.map((node) => node.id)).size).toBe(nodes.length);
    expect(
      slideCompositionSchema.safeParse({
        mode: "scene",
        runtime_version: "uf-runtime@1",
        background: "#11100e",
        clip_content: true,
        nodes
      }).success
    ).toBe(true);
  });

  it("keeps a group inside an auto-layout parent frame-free", () => {
    const parent = {
      id: "root",
      parent_id: null,
      order: 0,
      at: 0,
      animation: "none" as const,
      frame: null,
      kind: "stack" as const,
      direction: "column" as const,
      gap_px: 16,
      align: "stretch" as const,
      justify: "start" as const,
      wrap: false
    };
    const nodes = createScenePatternNodes({
      pattern: "pattern-comparison",
      rootId: "comparison",
      parentId: parent.id,
      order: 0,
      frame: null,
      at: 1
    });

    expect(nodes[0]).toMatchObject({ parent_id: "root", frame: null, at: 1 });
    expect(
      slideCompositionSchema.safeParse({
        mode: "scene",
        runtime_version: "uf-runtime@1",
        background: "#11100e",
        clip_content: true,
        nodes: [parent, ...nodes]
      }).success
    ).toBe(true);
  });

  it("chooses a collision-free root ID for Web insertion", () => {
    const existing = createScenePatternNodes({
      pattern: "pattern-timeline",
      rootId: "group-timeline-1",
      parentId: null,
      order: 0,
      frame: { x: 5, y: 5, width: 90, height: 90 },
      at: 0
    });
    const planned = planScenePatternInsertion({
      existingNodes: existing,
      pattern: "pattern-timeline",
      parentId: null
    });

    expect(planned[0]?.id).toBe("group-timeline-2");
    expect(planned[0]?.order).toBe(1);
  });

  it("rejects a caller-selected root ID collision", () => {
    const existing = createScenePatternNodes({
      pattern: "pattern-comparison",
      rootId: "comparison",
      parentId: null,
      order: 0,
      frame: null,
      at: 0
    });

    expect(() => planScenePatternInsertion({
      existingNodes: existing,
      pattern: "pattern-comparison",
      parentId: null,
      rootId: "comparison"
    })).toThrow(ScenePatternPlanError);
  });
});
