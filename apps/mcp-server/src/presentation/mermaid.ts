type MermaidDirection = "LR" | "RL" | "TD" | "TB" | "BT";

type MermaidNode = {
  id: string;
  label: string;
  shape: "rect" | "round" | "diamond";
};

type MermaidEdge = {
  from: string;
  to: string;
  label: string | null;
};

export type MermaidFlowchart = {
  direction: MermaidDirection;
  nodes: MermaidNode[];
  edges: MermaidEdge[];
};

export class MermaidSyntaxError extends Error {}

const NODE_ID = "[A-Za-z0-9_-]+";
const NODE_PATTERN = new RegExp(`^(${NODE_ID})(?:\\[([^\\]]+)\\]|\\(([^)]+)\\)|\\{([^}]+)\\})?$`);
const EDGE_PATTERN = new RegExp(
  `^(.+?)\\s*(?:--\\s*([^>-][^>]*)\\s*-->|-->|==>)\\s*(.+?)$`
);

function parseNode(value: string): MermaidNode {
  const match = NODE_PATTERN.exec(value.trim());
  if (match === null) {
    throw new MermaidSyntaxError(`未対応のノード記法です: ${value.trim()}`);
  }
  const [, id, square, round, diamond] = match;
  return {
    id,
    label: square ?? round ?? diamond ?? id,
    shape: diamond !== undefined ? "diamond" : round !== undefined ? "round" : "rect"
  };
}

function upsertNode(nodes: Map<string, MermaidNode>, node: MermaidNode): void {
  const current = nodes.get(node.id);
  if (current === undefined || node.label !== node.id || node.shape !== "rect") {
    nodes.set(node.id, node);
  }
}

export function parseMermaidFlowchart(source: string): MermaidFlowchart {
  if ([...source].length > 4_000) {
    throw new MermaidSyntaxError("図は4,000文字以内にしてください。");
  }
  const lines = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("%%"));
  const header = /^(?:flowchart|graph)\s+(LR|RL|TD|TB|BT)$/i.exec(lines.shift() ?? "");
  if (header === null) {
    throw new MermaidSyntaxError("先頭行は flowchart LR または flowchart TD の形で指定してください。");
  }

  const nodes = new Map<string, MermaidNode>();
  const edges: MermaidEdge[] = [];
  for (const line of lines.flatMap((value) => value.split(";").map((part) => part.trim()).filter(Boolean))) {
    const edge = EDGE_PATTERN.exec(line);
    if (edge !== null) {
      const from = parseNode(edge[1]);
      const to = parseNode(edge[3]);
      upsertNode(nodes, from);
      upsertNode(nodes, to);
      edges.push({ from: from.id, to: to.id, label: edge[2]?.trim() || null });
      continue;
    }
    upsertNode(nodes, parseNode(line));
  }
  if (nodes.size === 0) throw new MermaidSyntaxError("図にノードを1つ以上指定してください。");
  if (nodes.size > 24 || edges.length > 40) {
    throw new MermaidSyntaxError("1つの図はノード24個、接続40本までです。");
  }
  return { direction: header[1].toUpperCase() as MermaidDirection, nodes: [...nodes.values()], edges };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function wrapLabel(label: string, width = 13): string[] {
  const chars = [...label];
  const lines: string[] = [];
  for (let index = 0; index < chars.length; index += width) {
    lines.push(chars.slice(index, index + width).join(""));
  }
  return lines.slice(0, 3);
}

function nodeRanks(diagram: MermaidFlowchart): Map<string, number> {
  const ranks = new Map(diagram.nodes.map((node) => [node.id, 0]));
  for (let pass = 0; pass < diagram.nodes.length; pass += 1) {
    let changed = false;
    for (const edge of diagram.edges) {
      const next = Math.min(diagram.nodes.length - 1, (ranks.get(edge.from) ?? 0) + 1);
      if (next > (ranks.get(edge.to) ?? 0)) {
        ranks.set(edge.to, next);
        changed = true;
      }
    }
    if (!changed) break;
  }
  const used = [...new Set(ranks.values())].sort((left, right) => left - right);
  const normalized = new Map(used.map((rank, index) => [rank, index]));
  for (const [id, rank] of ranks) ranks.set(id, normalized.get(rank) ?? 0);
  return ranks;
}

export function renderMermaidFlowchart(source: string): string {
  let diagram: MermaidFlowchart;
  try {
    diagram = parseMermaidFlowchart(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : "図を読み取れませんでした。";
    return `<figure class="mermaid-diagram mermaid-error"><figcaption>Mermaid図の記法を確認してください</figcaption><p>${escapeHtml(message)}</p><pre>${escapeHtml(source)}</pre></figure>`;
  }

  const horizontal = diagram.direction === "LR" || diagram.direction === "RL";
  const reversed = diagram.direction === "RL" || diagram.direction === "BT";
  const ranks = nodeRanks(diagram);
  const maxRank = Math.max(...ranks.values());
  const groups = Array.from({ length: maxRank + 1 }, () => [] as MermaidNode[]);
  for (const node of diagram.nodes) groups[ranks.get(node.id) ?? 0].push(node);
  if (reversed) groups.reverse();
  const positions = new Map<string, { x: number; y: number }>();
  const width = 1_000;
  const height = 520;
  const nodeWidth = 190;
  const nodeHeight = 78;
  groups.forEach((group, rankIndex) => {
    group.forEach((node, itemIndex) => {
      const x = horizontal
        ? 80 + rankIndex * ((width - 160) / Math.max(1, groups.length - 1))
        : group.length === 1 ? width / 2 : 100 + itemIndex * ((width - 200) / (group.length - 1));
      const y = horizontal
        ? group.length === 1 ? height / 2 : 70 + itemIndex * ((height - 140) / (group.length - 1))
        : 65 + rankIndex * ((height - 130) / Math.max(1, groups.length - 1));
      positions.set(node.id, { x, y });
    });
  });
  const edgeMarkup = diagram.edges.map((edge) => {
    const from = positions.get(edge.from)!;
    const to = positions.get(edge.to)!;
    const horizontalSign = Math.sign(to.x - from.x) || 1;
    const verticalSign = Math.sign(to.y - from.y) || 1;
    const x1 = from.x + (horizontal ? horizontalSign * nodeWidth / 2 : 0);
    const y1 = from.y + (horizontal ? 0 : verticalSign * nodeHeight / 2);
    const x2 = to.x - (horizontal ? horizontalSign * nodeWidth / 2 : 0);
    const y2 = to.y - (horizontal ? 0 : verticalSign * nodeHeight / 2);
    const length = Math.hypot(x2 - x1, y2 - y1) || 1;
    const ux = (x2 - x1) / length;
    const uy = (y2 - y1) / length;
    const arrowBaseX = x2 - ux * 16;
    const arrowBaseY = y2 - uy * 16;
    const arrow = `${x2},${y2} ${arrowBaseX - uy * 8},${arrowBaseY + ux * 8} ${arrowBaseX + uy * 8},${arrowBaseY - ux * 8}`;
    const label = edge.label === null
      ? ""
      : `<text class="mermaid-edge-label" x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 8}" text-anchor="middle">${escapeHtml(edge.label)}</text>`;
    return `<line class="mermaid-edge" x1="${x1}" y1="${y1}" x2="${arrowBaseX}" y2="${arrowBaseY}"/><polygon class="mermaid-arrow" points="${arrow}"/>${label}`;
  }).join("");
  const nodeMarkup = diagram.nodes.map((node) => {
    const position = positions.get(node.id)!;
    const shape = node.shape === "diamond"
      ? `<polygon points="${position.x},${position.y - nodeHeight / 2} ${position.x + nodeWidth / 2},${position.y} ${position.x},${position.y + nodeHeight / 2} ${position.x - nodeWidth / 2},${position.y}"/>`
      : `<rect x="${position.x - nodeWidth / 2}" y="${position.y - nodeHeight / 2}" width="${nodeWidth}" height="${nodeHeight}" rx="${node.shape === "round" ? 28 : 8}"/>`;
    const lines = wrapLabel(node.label);
    const startY = position.y - ((lines.length - 1) * 12);
    return `<g class="mermaid-node" data-node-id="${escapeHtml(node.id)}">${shape}<text x="${position.x}" y="${startY}" text-anchor="middle">${lines.map((line, index) => `<tspan x="${position.x}" dy="${index === 0 ? 0 : 24}">${escapeHtml(line)}</tspan>`).join("")}</text></g>`;
  }).join("");
  const description = diagram.edges.map((edge) => `${diagram.nodes.find((node) => node.id === edge.from)?.label ?? edge.from}から${diagram.nodes.find((node) => node.id === edge.to)?.label ?? edge.to}`).join("、");
  return `<figure class="mermaid-diagram"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(description || diagram.nodes.map((node) => node.label).join("、"))}" preserveAspectRatio="xMidYMid meet">${edgeMarkup}${nodeMarkup}</svg></figure>`;
}
