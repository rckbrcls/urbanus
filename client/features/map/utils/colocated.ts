/**
 * Utilitário para encontrar nós co-localizados (mesma posição geográfica)
 *
 * Necessário quando múltiplos nós compartilham a mesma posição (ex: interseções
 * onde distintas ruas se encontram podem gerar nós com IDs diferentes mas
 * mesma lat/lng).
 */

import type { MapNode } from "../types";

/**
 * Retorna o conjunto de IDs de todos os nós que compartilham a mesma posição
 * do nó alvo (incluindo o próprio nó alvo).
 *
 * Usa toFixed(6) para comparação de precisão.
 */
export function getColocatedNodeIds(
  nodes: MapNode[],
  targetNode: MapNode,
): Set<string> {
  const targetKey = `${targetNode.position.lat.toFixed(6)},${targetNode.position.lng.toFixed(6)}`;

  const ids = new Set<string>();
  for (const node of nodes) {
    const key = `${node.position.lat.toFixed(6)},${node.position.lng.toFixed(6)}`;
    if (key === targetKey) {
      ids.add(node.id);
    }
  }

  return ids;
}
