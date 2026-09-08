type MermaidDirection = "LR" | "RL" | "TD" | "TB" | "BT";

type MermaidNodeShape =
  | "rect"
  | "round"
  | "diamond"
  | "stadium"
  | "database"
  | "circle"
  | "hexagon";

type MermaidNode = {
  id: string;
  label: string;
  shape: MermaidNodeShape;
};

type MermaidEdge = {
  from: string;
  to: string;
  label: string | null;
  style: "solid" | "dashed" | "thick";
};

type MermaidCluster = {
  id: string;
  label: string;
  nodeIds: string[];
};

export type MermaidFlowchart = {
  kind: "flowchart";
  direction: MermaidDirection;
  nodes: MermaidNode[];
  edges: MermaidEdge[];
  clusters: MermaidCluster[];
};

type MermaidParticipant = {
  id: string;
  label: string;
  actor: boolean;
};

type MermaidBlockKind = "loop" | "opt" | "alt" | "par" | "critical" | "break" | "else";

type MermaidSequenceEvent =
  | {
      kind: "message";
      from: string;
      to: string;
      label: string;
      dashed: boolean;
      cross: boolean;
    }
  | {
      kind: "note";
      placement: "left of" | "right of" | "over";
      participants: string[];
      label: string;
    }
  | {
      kind: "block";
      block: MermaidBlockKind;
      label: string;
    };

export type MermaidSequenceDiagram = {
  kind: "sequence";
  participants: MermaidParticipant[];
  events: MermaidSequenceEvent[];
};

export type MermaidDiagram = MermaidFlowchart | MermaidSequenceDiagram;

export class MermaidSyntaxError extends Error {}

const NODE_ID = /^[A-Za-z0-9_-]+$/;
const EDGE_CONNECTOR = /(-->(?:\|[^|]+\|)?|-\.->|==>|--\s+[^>]+?\s+-->)/g;

function assertSourceLength(source: string): void {
  if ([...source].length > 8_000) {
    throw new MermaidSyntaxError("図は8,000文字以内にしてください。");
  }
}

function stripLabelQuotes(label: string): string {
  const trimmed = label.trim();
  return trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')
    ? trimmed.slice(1, -1)
    : trimmed;
}

function parseNode(value: string): MermaidNode {
  const trimmed = value.trim();
  const idMatch = /^([A-Za-z0-9_-]+)(.*)$/.exec(trimmed);
  if (idMatch === null) {
    throw new MermaidSyntaxError(`未対応のノード記法です: ${trimmed}`);
  }
  const [, id, notation] = idMatch;
  const shapes: Array<[RegExp, MermaidNodeShape]> = [
    [/^\(\[(.+)\]\)$/, "stadium"],
    [/^\[\((.+)\)\]$/, "database"],
    [/^\(\((.+)\)\)$/, "circle"],
    [/^\{\{(.+)\}\}$/, "hexagon"],
    [/^\[(.+)\]$/, "rect"],
    [/^\((.+)\)$/, "round"],
    [/^\{(.+)\}$/, "diamond"]
  ];
  if (notation.length === 0) return { id, label: id, shape: "rect" };
  for (const [pattern, shape] of shapes) {
    const match = pattern.exec(notation);
    if (match !== null) return { id, label: stripLabelQuotes(match[1]), shape };
  }
  throw new MermaidSyntaxError(`未対応のノード記法です: ${trimmed}`);
}

function upsertNode(nodes: Map<string, MermaidNode>, node: MermaidNode): void {
  const current = nodes.get(node.id);
  if (current === undefined || node.label !== node.id || node.shape !== "rect") {
    nodes.set(node.id, node);
  }
}

function connectorDetails(connector: string): Pick<MermaidEdge, "label" | "style"> {
  if (connector === "-.->") return { label: null, style: "dashed" };
  if (connector === "==>") return { label: null, style: "thick" };
  const pipeLabel = /^-->\|([^|]+)\|$/.exec(connector);
  if (pipeLabel !== null) return { label: pipeLabel[1].trim() || null, style: "solid" };
  const spacedLabel = /^--\s+(.+?)\s+-->$/.exec(connector);
  return { label: spacedLabel?.[1].trim() || null, style: "solid" };
}

export function parseMermaidFlowchart(source: string): MermaidFlowchart {
  assertSourceLength(source);
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
  const clusters: MermaidCluster[] = [];
  let currentCluster: MermaidCluster | null = null;
  const statements = lines.flatMap((value) =>
    value.split(";").map((part) => part.trim()).filter(Boolean)
  );
  for (const line of statements) {
    const subgraph = /^subgraph\s+([A-Za-z0-9_-]+)(?:\[(.+)\])?$/i.exec(line);
    if (subgraph !== null) {
      if (currentCluster !== null) throw new MermaidSyntaxError("subgraphの入れ子には対応していません。");
      currentCluster = {
        id: subgraph[1],
        label: stripLabelQuotes(subgraph[2] ?? subgraph[1]),
        nodeIds: []
      };
      clusters.push(currentCluster);
      continue;
    }
    if (/^end$/i.test(line)) {
      if (currentCluster === null) throw new MermaidSyntaxError("対応するsubgraphがないendです。");
      currentCluster = null;
      continue;
    }

    const parts = line.split(EDGE_CONNECTOR).map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 3 && parts.length % 2 === 1) {
      let from = parseNode(parts[0]);
      upsertNode(nodes, from);
      if (currentCluster !== null && !currentCluster.nodeIds.includes(from.id)) currentCluster.nodeIds.push(from.id);
      for (let index = 1; index < parts.length; index += 2) {
        const connector = parts[index];
        const to = parseNode(parts[index + 1]);
        upsertNode(nodes, to);
        if (currentCluster !== null && !currentCluster.nodeIds.includes(to.id)) currentCluster.nodeIds.push(to.id);
        edges.push({ from: from.id, to: to.id, ...connectorDetails(connector) });
        from = to;
      }
      continue;
    }
    if (parts.length !== 1) throw new MermaidSyntaxError(`接続記法を読み取れません: ${line}`);
    const node = parseNode(line);
    upsertNode(nodes, node);
    if (currentCluster !== null && !currentCluster.nodeIds.includes(node.id)) currentCluster.nodeIds.push(node.id);
  }
  if (currentCluster !== null) throw new MermaidSyntaxError("subgraphをendで閉じてください。");
  if (nodes.size === 0) throw new MermaidSyntaxError("図にノードを1つ以上指定してください。");
  if (nodes.size > 32 || edges.length > 64 || clusters.length > 8) {
    throw new MermaidSyntaxError("1つの図はノード32個、接続64本、subgraph 8個までです。");
  }
  return {
    kind: "flowchart",
    direction: header[1].toUpperCase() as MermaidDirection,
    nodes: [...nodes.values()],
    edges,
    clusters
  };
}

function addParticipant(
  participants: Map<string, MermaidParticipant>,
  id: string,
  label = id,
  actor = false
): void {
  if (!NODE_ID.test(id)) throw new MermaidSyntaxError(`参加者IDを読み取れません: ${id}`);
  const current = participants.get(id);
  participants.set(id, {
    id,
    label: current !== undefined && current.label !== current.id && label === id
      ? current.label
      : stripLabelQuotes(label),
    actor: current?.actor === true || actor
  });
}

export function parseMermaidSequence(source: string): MermaidSequenceDiagram {
  assertSourceLength(source);
  const lines = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("%%"));
  if (!/^sequenceDiagram$/i.test(lines.shift() ?? "")) {
    throw new MermaidSyntaxError("先頭行は sequenceDiagram と指定してください。");
  }
  const participants = new Map<string, MermaidParticipant>();
  const events: MermaidSequenceEvent[] = [];
  const blocks: string[] = [];

  for (const line of lines) {
    const participant = /^(participant|actor)\s+([A-Za-z0-9_-]+)(?:\s+as\s+(.+))?$/i.exec(line);
    if (participant !== null) {
      addParticipant(
        participants,
        participant[2],
        participant[3] ?? participant[2],
        participant[1].toLowerCase() === "actor"
      );
      continue;
    }
    const message = /^([A-Za-z0-9_][A-Za-z0-9_-]*?)\s*(-->>|->>|-->|->|--x|-x)\s*([A-Za-z0-9_-]+)\s*:\s*(.+)$/.exec(line);
    if (message !== null) {
      addParticipant(participants, message[1]);
      addParticipant(participants, message[3]);
      events.push({
        kind: "message",
        from: message[1],
        to: message[3],
        label: message[4].trim(),
        dashed: message[2].startsWith("--"),
        cross: message[2].endsWith("x")
      });
      continue;
    }
    const note = /^Note\s+(left of|right of|over)\s+([A-Za-z0-9_-]+)(?:\s*,\s*([A-Za-z0-9_-]+))?\s*:\s*(.+)$/i.exec(line);
    if (note !== null) {
      addParticipant(participants, note[2]);
      if (note[3] !== undefined) addParticipant(participants, note[3]);
      events.push({
        kind: "note",
        placement: note[1].toLowerCase() as "left of" | "right of" | "over",
        participants: [note[2], note[3]].filter((id): id is string => id !== undefined),
        label: note[4].trim()
      });
      continue;
    }
    const block = /^(loop|opt|alt|par|critical|break)(?:\s+(.+))?$/i.exec(line);
    if (block !== null) {
      const blockName = block[1].toLowerCase() as Exclude<MermaidBlockKind, "else">;
      blocks.push(blockName);
      events.push({ kind: "block", block: blockName, label: block[2]?.trim() ?? "" });
      continue;
    }
    const otherwise = /^else(?:\s+(.+))?$/i.exec(line);
    if (otherwise !== null && blocks.at(-1) === "alt") {
      events.push({ kind: "block", block: "else", label: otherwise[1]?.trim() ?? "" });
      continue;
    }
    if (/^end$/i.test(line) && blocks.length > 0) {
      blocks.pop();
      continue;
    }
    throw new MermaidSyntaxError(`未対応のシーケンス記法です: ${line}`);
  }
  if (blocks.length > 0) throw new MermaidSyntaxError("loopやaltをendで閉じてください。");
  if (participants.size === 0) throw new MermaidSyntaxError("参加者を1つ以上指定してください。");
  if (participants.size > 12 || events.length > 48) {
    throw new MermaidSyntaxError("1つの図は参加者12件、やり取り48件までです。");
  }
  return { kind: "sequence", participants: [...participants.values()], events };
}

export function parseMermaidDiagram(source: string): MermaidDiagram {
  const header = source
    .split(/\r?\n/)
    .find((line) => line.trim().length > 0 && !line.trim().startsWith("%%"))
    ?.trim() ?? "";
  return /^sequenceDiagram$/i.test(header)
    ? parseMermaidSequence(source)
    : parseMermaidFlowchart(source);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function wrapLabel(label: string, width = 13, maxLines = 3): string[] {
  const chars = [...label];
  const lines: string[] = [];
  for (let index = 0; index < chars.length; index += width) {
    lines.push(chars.slice(index, index + width).join(""));
  }
  return lines.slice(0, maxLines);
}

function textMarkup(label: string, x: number, y: number, width = 13, maxLines = 3): string {
  const lines = wrapLabel(label, width, maxLines);
  const startY = y - (lines.length - 1) * 12;
  return `<text x="${x}" y="${startY}" text-anchor="middle">${lines.map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : 24}">${escapeHtml(line)}</tspan>`).join("")}</text>`;
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

function flowchartNodeShape(
  node: MermaidNode,
  x: number,
  y: number,
  width: number,
  height: number
): string {
  if (node.shape === "diamond") {
    return `<polygon points="${x},${y - height / 2} ${x + width / 2},${y} ${x},${y + height / 2} ${x - width / 2},${y}"/>`;
  }
  if (node.shape === "hexagon") {
    return `<polygon points="${x - width * .38},${y - height / 2} ${x + width * .38},${y - height / 2} ${x + width / 2},${y} ${x + width * .38},${y + height / 2} ${x - width * .38},${y + height / 2} ${x - width / 2},${y}"/>`;
  }
  if (node.shape === "circle") {
    return `<ellipse cx="${x}" cy="${y}" rx="${height / 2}" ry="${height / 2}"/>`;
  }
  if (node.shape === "database") {
    const left = x - width / 2;
    const top = y - height / 2;
    return `<path d="M ${left} ${top + 11} Q ${x} ${top - 4} ${left + width} ${top + 11} L ${left + width} ${top + height - 11} Q ${x} ${top + height + 4} ${left} ${top + height - 11} Z"/><path class="mermaid-node-detail" d="M ${left} ${top + 11} Q ${x} ${top + 26} ${left + width} ${top + 11}"/>`;
  }
  const radius = node.shape === "stadium" ? height / 2 : node.shape === "round" ? 28 : 8;
  return `<rect x="${x - width / 2}" y="${y - height / 2}" width="${width}" height="${height}" rx="${radius}"/>`;
}

function renderFlowchart(diagram: MermaidFlowchart): string {
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
  const nodeWidth = Math.min(190, horizontal && groups.length > 4 ? 150 : 190);
  const nodeHeight = 78;
  groups.forEach((group, rankIndex) => {
    group.forEach((node, itemIndex) => {
      const x = horizontal
        ? 80 + rankIndex * ((width - 160) / Math.max(1, groups.length - 1))
        : group.length === 1
          ? width / 2
          : 100 + itemIndex * ((width - 200) / (group.length - 1));
      const y = horizontal
        ? group.length === 1
          ? height / 2
          : 70 + itemIndex * ((height - 140) / (group.length - 1))
        : 65 + rankIndex * ((height - 130) / Math.max(1, groups.length - 1));
      positions.set(node.id, { x, y });
    });
  });
  const clusterMarkup = diagram.clusters.map((cluster) => {
    const points = cluster.nodeIds
      .map((id) => positions.get(id))
      .filter((point): point is { x: number; y: number } => point !== undefined);
    if (points.length === 0) return "";
    const left = Math.max(8, Math.min(...points.map((point) => point.x)) - nodeWidth / 2 - 24);
    const right = Math.min(width - 8, Math.max(...points.map((point) => point.x)) + nodeWidth / 2 + 24);
    const top = Math.max(8, Math.min(...points.map((point) => point.y)) - nodeHeight / 2 - 32);
    const bottom = Math.min(height - 8, Math.max(...points.map((point) => point.y)) + nodeHeight / 2 + 24);
    return `<g class="mermaid-cluster" data-cluster-id="${escapeHtml(cluster.id)}"><rect x="${left}" y="${top}" width="${right - left}" height="${bottom - top}" rx="18"/><text x="${left + 16}" y="${top + 22}">${escapeHtml(cluster.label)}</text></g>`;
  }).join("");
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
    return `<line class="mermaid-edge mermaid-edge-${edge.style}" x1="${x1}" y1="${y1}" x2="${arrowBaseX}" y2="${arrowBaseY}"/><polygon class="mermaid-arrow" points="${arrow}"/>${label}`;
  }).join("");
  const nodeMarkup = diagram.nodes.map((node) => {
    const position = positions.get(node.id)!;
    return `<g class="mermaid-node" data-node-id="${escapeHtml(node.id)}">${flowchartNodeShape(node, position.x, position.y, nodeWidth, nodeHeight)}${textMarkup(node.label, position.x, position.y, node.shape === "circle" ? 6 : 13)}</g>`;
  }).join("");
  const description = diagram.edges
    .map((edge) => `${diagram.nodes.find((node) => node.id === edge.from)?.label ?? edge.from}から${diagram.nodes.find((node) => node.id === edge.to)?.label ?? edge.to}`)
    .join("、");
  return `<figure class="mermaid-diagram"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(description || diagram.nodes.map((node) => node.label).join("、"))}" preserveAspectRatio="xMidYMid meet">${clusterMarkup}${edgeMarkup}${nodeMarkup}</svg></figure>`;
}

function renderSequence(diagram: MermaidSequenceDiagram): string {
  const width = 1_000;
  const rowHeight = 62;
  const top = 72;
  const height = Math.max(360, top * 2 + Math.max(1, diagram.events.length) * rowHeight);
  const span = width - 160;
  const positions = new Map(diagram.participants.map((participant, index) => [
    participant.id,
    diagram.participants.length === 1
      ? width / 2
      : 80 + index * (span / (diagram.participants.length - 1))
  ]));
  const participantWidth = Math.min(180, Math.max(90, span / Math.max(2, diagram.participants.length) - 18));
  const participantMarkup = diagram.participants.map((participant) => {
    const x = positions.get(participant.id)!;
    const box = participant.actor
      ? `<circle cx="${x}" cy="29" r="10"/><path d="M ${x} 39 L ${x} 59 M ${x - 13} 47 L ${x + 13} 47 M ${x} 59 L ${x - 12} 70 M ${x} 59 L ${x + 12} 70"/>`
      : `<rect x="${x - participantWidth / 2}" y="10" width="${participantWidth}" height="52" rx="10"/>`;
    const labelY = participant.actor ? 92 : 42;
    return `<g class="mermaid-participant" data-participant-id="${escapeHtml(participant.id)}">${box}${textMarkup(participant.label, x, labelY, 10, 2)}<line class="mermaid-lifeline" x1="${x}" y1="${top}" x2="${x}" y2="${height - 48}"/></g>`;
  }).join("");
  let y = top + 34;
  const eventMarkup = diagram.events.map((event) => {
    y += rowHeight;
    if (event.kind === "block") {
      const label = `${event.block}${event.label.length > 0 ? `: ${event.label}` : ""}`;
      return `<g class="mermaid-sequence-block"><rect x="32" y="${y - 31}" width="936" height="42" rx="8"/><text x="48" y="${y - 5}">${escapeHtml(label)}</text></g>`;
    }
    if (event.kind === "note") {
      const anchors = event.participants
        .map((id) => positions.get(id)!)
        .sort((left, right) => left - right);
      const center = event.placement === "left of"
        ? anchors[0] - 104
        : event.placement === "right of"
          ? anchors.at(-1)! + 104
          : (anchors[0] + anchors.at(-1)!) / 2;
      const noteWidth = Math.min(250, Math.max(170, Math.abs(anchors.at(-1)! - anchors[0]) + 120));
      const safeCenter = Math.max(noteWidth / 2 + 12, Math.min(width - noteWidth / 2 - 12, center));
      return `<g class="mermaid-sequence-note"><rect x="${safeCenter - noteWidth / 2}" y="${y - 35}" width="${noteWidth}" height="48" rx="7"/>${textMarkup(event.label, safeCenter, y - 8, 16, 2)}</g>`;
    }
    const from = positions.get(event.from)!;
    const to = positions.get(event.to)!;
    const css = `mermaid-message${event.dashed ? " mermaid-message-dashed" : ""}`;
    const label = textMarkup(event.label, (from + to) / 2, y - 18, 18, 2);
    if (from === to) {
      return `<g>${label}<path class="${css}" d="M ${from} ${y} H ${from + 54} V ${y + 25} H ${from + 9}"/><polygon class="mermaid-arrow" points="${from},${y + 25} ${from + 12},${y + 18} ${from + 12},${y + 32}"/></g>`;
    }
    const sign = Math.sign(to - from);
    const end = to - sign * 10;
    const arrow = event.cross
      ? `<path class="mermaid-message-cross" d="M ${to - 8} ${y - 8} L ${to + 8} ${y + 8} M ${to + 8} ${y - 8} L ${to - 8} ${y + 8}"/>`
      : `<polygon class="mermaid-arrow" points="${to},${y} ${end},${y - 7} ${end},${y + 7}"/>`;
    return `<g>${label}<line class="${css}" x1="${from}" y1="${y}" x2="${end}" y2="${y}"/>${arrow}</g>`;
  }).join("");
  const description = diagram.events
    .filter((event): event is Extract<MermaidSequenceEvent, { kind: "message" }> => event.kind === "message")
    .map((event) => `${event.from}から${event.to}へ${event.label}`)
    .join("、");
  return `<figure class="mermaid-diagram mermaid-sequence"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(description || diagram.participants.map((participant) => participant.label).join("、"))}" preserveAspectRatio="xMidYMid meet">${participantMarkup}${eventMarkup}</svg></figure>`;
}

function errorMarkup(source: string, error: unknown): string {
  const message = error instanceof Error ? error.message : "図を読み取れませんでした。";
  return `<figure class="mermaid-diagram mermaid-error"><figcaption>Mermaid図の記法を確認してください</figcaption><p>${escapeHtml(message)}</p><pre>${escapeHtml(source)}</pre></figure>`;
}

export function renderMermaidFlowchart(source: string): string {
  try {
    return renderFlowchart(parseMermaidFlowchart(source));
  } catch (error) {
    return errorMarkup(source, error);
  }
}

export function renderMermaidDiagram(source: string): string {
  try {
    const diagram = parseMermaidDiagram(source);
    return diagram.kind === "flowchart" ? renderFlowchart(diagram) : renderSequence(diagram);
  } catch (error) {
    return errorMarkup(source, error);
  }
}
