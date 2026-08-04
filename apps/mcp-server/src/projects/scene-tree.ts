import type { SlideSceneNode } from "./schema";

export class SceneTreeOperationError extends Error {}

export function sceneFrameForParent(
  frame: SlideSceneNode["frame"],
  parentKind: SlideSceneNode["kind"] | null
): SlideSceneNode["frame"] {
  if (parentKind === "stack" || parentKind === "grid") return null;
  if (parentKind === "layer" && frame === null) {
    return { x: 5, y: 5, width: 90, height: 90 };
  }
  return frame;
}

function sceneSubtreeIds(nodes: SlideSceneNode[], rootId: string): Set<string> {
  if (!nodes.some((node) => node.id === rootId)) {
    throw new SceneTreeOperationError("The slide component does not exist.");
  }
  const ids = new Set<string>([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of nodes) {
      if (node.parent_id === null || !ids.has(node.parent_id) || ids.has(node.id)) continue;
      ids.add(node.id);
      changed = true;
    }
  }
  return ids;
}

function nextCopyId(sourceId: string, used: Set<string>): string {
  const base = `${sourceId.slice(0, 48)}-copy`;
  let candidate = base;
  for (let suffix = 2; used.has(candidate); suffix += 1) {
    candidate = `${base.slice(0, 58)}-${suffix}`;
  }
  used.add(candidate);
  return candidate;
}

function normalizeSiblingOrders(nodes: SlideSceneNode[], parentId: string | null): void {
  nodes
    .filter((node) => node.parent_id === parentId)
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
    .forEach((node, index) => {
      node.order = index;
    });
}

export function duplicateSceneSubtree(
  nodes: SlideSceneNode[],
  rootId: string
): { nodes: SlideSceneNode[]; rootCopyId: string; copiedIds: string[] } {
  const subtreeIds = sceneSubtreeIds(nodes, rootId);
  if (nodes.length + subtreeIds.size > 200) {
    throw new SceneTreeOperationError("The scene component limit would be exceeded.");
  }
  const root = nodes.find((node) => node.id === rootId)!;
  const used = new Set(nodes.map((node) => node.id));
  const idMap = new Map<string, string>();
  for (const node of nodes) {
    if (subtreeIds.has(node.id)) idMap.set(node.id, nextCopyId(node.id, used));
  }
  const copies = nodes
    .filter((node) => subtreeIds.has(node.id))
    .map((node) => {
      const copy = structuredClone(node);
      copy.id = idMap.get(node.id)!;
      copy.parent_id = node.id === rootId
        ? node.parent_id
        : idMap.get(node.parent_id!)!;
      if (node.id === rootId) {
        copy.order = root.order + 1;
        if (copy.frame) {
          copy.frame.x = Math.min(100 - copy.frame.width, copy.frame.x + 3);
          copy.frame.y = Math.min(100 - copy.frame.height, copy.frame.y + 3);
        }
      }
      return copy;
    });
  const result = [...nodes, ...copies];
  for (const sibling of result) {
    if (
      sibling.id !== idMap.get(rootId) &&
      sibling.parent_id === root.parent_id &&
      sibling.order > root.order
    ) {
      sibling.order += 1;
    }
  }
  normalizeSiblingOrders(result, root.parent_id);
  return {
    nodes: result,
    rootCopyId: idMap.get(rootId)!,
    copiedIds: copies.map((node) => node.id)
  };
}

export function deleteSceneSubtree(
  nodes: SlideSceneNode[],
  rootId: string
): { nodes: SlideSceneNode[]; deletedIds: string[] } {
  const subtreeIds = sceneSubtreeIds(nodes, rootId);
  const root = nodes.find((node) => node.id === rootId)!;
  const result = nodes.filter((node) => !subtreeIds.has(node.id));
  normalizeSiblingOrders(result, root.parent_id);
  return { nodes: result, deletedIds: [...subtreeIds] };
}
