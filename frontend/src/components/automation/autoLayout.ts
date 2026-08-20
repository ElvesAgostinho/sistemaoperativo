import type { Node, Edge } from '@xyflow/react';

const LEVEL_GAP_X = 280;
const SIBLING_GAP_Y = 130;
const START_X = 60;
const START_Y = 200;

/**
 * Reorganiza os nós em colunas por profundidade a partir do gatilho (BFS pelas
 * arestas), estilo "Tidy up" do n8n — não precisa de nenhuma lib de layout
 * externa porque os fluxos aqui são essencialmente árvores (trigger → ações →
 * branches de condição/menu), sem merges complexos.
 */
export function autoLayoutNodes(nodes: Node[], edges: Edge[]): Node[] {
  if (nodes.length === 0) return nodes;

  const childrenByNode = new Map<string, string[]>();
  edges.forEach(e => {
    if (!childrenByNode.has(e.source)) childrenByNode.set(e.source, []);
    childrenByNode.get(e.source)!.push(e.target);
  });

  const trigger = nodes.find(n => (n as any).type === 'trigger') || nodes[0];
  const levelById = new Map<string, number>();
  const visited = new Set<string>();
  const queue: { id: string; level: number }[] = [{ id: trigger.id, level: 0 }];

  while (queue.length > 0) {
    const { id, level } = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    levelById.set(id, level);
    (childrenByNode.get(id) || []).forEach(childId => {
      if (!visited.has(childId)) queue.push({ id: childId, level: level + 1 });
    });
  }

  // Nós órfãos (não alcançáveis a partir do gatilho) vão para uma coluna extra no final
  let maxLevel = Math.max(0, ...Array.from(levelById.values()));
  nodes.forEach(n => {
    if (!levelById.has(n.id)) {
      levelById.set(n.id, maxLevel + 1);
    }
  });

  const idsByLevel = new Map<number, string[]>();
  nodes.forEach(n => {
    const level = levelById.get(n.id) ?? 0;
    if (!idsByLevel.has(level)) idsByLevel.set(level, []);
    idsByLevel.get(level)!.push(n.id);
  });

  return nodes.map(n => {
    const level = levelById.get(n.id) ?? 0;
    const siblings = idsByLevel.get(level) || [n.id];
    const index = siblings.indexOf(n.id);
    const totalHeight = (siblings.length - 1) * SIBLING_GAP_Y;
    const y = START_Y - totalHeight / 2 + index * SIBLING_GAP_Y;
    return { ...n, position: { x: START_X + level * LEVEL_GAP_X, y: Math.max(40, y) } };
  });
}
