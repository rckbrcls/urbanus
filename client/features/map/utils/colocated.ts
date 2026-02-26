/**
 * Utilitário para encontrar nós co-localizados (mesma posição geográfica)
 *
 * Necessário porque extractNodesFromStreets cria um MapNode por vértice por rua,
 * sem deduplicação. Interseções onde N ruas se encontram geram N nós com IDs
 * diferentes mas mesma lat/lng.
 */

import type { MapNode } from "../types";

/**
 * Retorna o conjunto de IDs de todos os nós que compartilham a mesma posição
 * do nó alvo (incluindo o próprio nó alvo).
 *
 * Usa toFixed(6) para comparação de precisão, consistente com extractNodesFromStreets.
 */
export function getColocatedNodeIds(
  nodes: MapNode[],
  targetNode: MapNode
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
