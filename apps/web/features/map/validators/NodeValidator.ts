/**
 * Validador de Nós
 */

import { GeoCalculations } from "@/lib/geo";
import type { LatLng, BoundingBox } from "../types";
import type {
  MapNode,
  MoveValidationResult,
  NodeValidationError,
  NodeValidationWarning,
} from "../types/node.types";
import { NODE_CONSTRAINTS } from "../constants";

export class NodeValidator {
  /**
   * Valida se uma posição está dentro do bbox
   */
  isInsideBbox(position: LatLng, bbox: BoundingBox): boolean {
    return GeoCalculations.isInsideBbox(position, bbox);
  }

  /**
   * Valida movimento de um nó para nova posição
   */
  validateMove(
    node: MapNode,
    newPosition: LatLng,
    allNodes: MapNode[],
    bbox: BoundingBox,
  ): MoveValidationResult {
    const errors: NodeValidationError[] = [];
    const warnings: NodeValidationWarning[] = [];

    // 1. Verifica se nó está bloqueado
    if (node.isLocked) {
      errors.push({
        code: "NODE_LOCKED",
        message: "Este nó está bloqueado para edição",
      });
      return { valid: false, errors, warnings };
    }

    // 2. Verifica se nova posição está dentro do bbox
    if (!this.isInsideBbox(newPosition, bbox)) {
      errors.push({
        code: "OUTSIDE_BOUNDS",
        message: "Nova posição está fora da área selecionada",
      });
    }

    // 3. Verifica distância mínima de outros nós
    const tooClose = allNodes.find((other) => {
      if (other.id === node.id) return false;
      const distance = GeoCalculations.calculateDistance(
        newPosition,
        other.position,
      );
      return distance < NODE_CONSTRAINTS.MIN_DISTANCE_METERS;
    });

    if (tooClose) {
      warnings.push({
        code: "TOO_CLOSE",
        message: `Nó muito próximo de outro nó (< ${NODE_CONSTRAINTS.MIN_DISTANCE_METERS}m)`,
      });
    }

    // 4. Verifica se movimento é muito grande (possível erro do usuário)
    const moveDistance = GeoCalculations.calculateDistance(
      node.position,
      newPosition,
    );
    if (moveDistance > NODE_CONSTRAINTS.MAX_MOVE_DISTANCE_METERS) {
      warnings.push({
        code: "LARGE_MOVE",
        message: `Movimento grande detectado (${moveDistance.toFixed(0)}m)`,
      });
    }

    // 5. Aviso se nó é uma interseção
    if (node.isIntersection) {
      warnings.push({
        code: "INTERSECTION_MODIFIED",
        message: "Este nó é uma interseção entre ruas",
      });
    }

    // 6. Sugestão de snap (opcional)
    let snapSuggestion: LatLng | undefined;
    const nearestNode = this.findNearestNode(newPosition, allNodes, node.id);
    if (
      nearestNode &&
      GeoCalculations.calculateDistance(newPosition, nearestNode.position) <
        NODE_CONSTRAINTS.SNAP_DISTANCE_METERS
    ) {
      snapSuggestion = nearestNode.position;
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      snapSuggestion,
    };
  }

  /**
   * Valida se um nó pode ser deletado
   */
  validateDelete(node: MapNode): {
    valid: boolean;
    error?: NodeValidationError;
  } {
    // Não pode deletar nós bloqueados
    if (node.isLocked) {
      return {
        valid: false,
        error: {
          code: "NODE_LOCKED",
          message: "Este nó está bloqueado para edição",
        },
      };
    }

    // Não pode deletar endpoints
    if (node.isEndpoint) {
      return {
        valid: false,
        error: {
          code: "CANNOT_DELETE_ENDPOINT",
          message: "Não é possível deletar endpoints de ruas",
        },
      };
    }

    return { valid: true };
  }

  /**
   * Valida se uma posição é válida para criar novo nó
   */
  validateCreate(
    position: LatLng,
    allNodes: MapNode[],
    bbox: BoundingBox,
  ): { valid: boolean; errors: NodeValidationError[] } {
    const errors: NodeValidationError[] = [];

    // Verifica se está dentro do bbox
    if (!this.isInsideBbox(position, bbox)) {
      errors.push({
        code: "OUTSIDE_BOUNDS",
        message: "Posição está fora da área selecionada",
      });
    }

    // Verifica se não está muito próximo de outro nó
    const tooClose = allNodes.find((other) => {
      const distance = GeoCalculations.calculateDistance(
        position,
        other.position,
      );
      return distance < NODE_CONSTRAINTS.MIN_DISTANCE_METERS;
    });

    if (tooClose) {
      errors.push({
        code: "INVALID_POSITION",
        message: `Posição muito próxima de outro nó (< ${NODE_CONSTRAINTS.MIN_DISTANCE_METERS}m)`,
      });
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Encontra o nó mais próximo de uma posição
   */
  findNearestNode(
    position: LatLng,
    nodes: MapNode[],
    excludeId: string,
  ): MapNode | null {
    let nearest: MapNode | null = null;
    let minDistance = Infinity;

    nodes.forEach((node) => {
      if (node.id === excludeId) return;
      const distance = GeoCalculations.calculateDistance(
        position,
        node.position,
      );
      if (distance < minDistance) {
        minDistance = distance;
        nearest = node;
      }
    });

    return nearest;
  }

  /**
   * Encontra nós dentro de uma distância de um ponto
   */
  findNodesNear(
    position: LatLng,
    nodes: MapNode[],
    radiusMeters: number,
    excludeId?: string,
  ): MapNode[] {
    return nodes.filter((node) => {
      if (excludeId && node.id === excludeId) return false;
      const distance = GeoCalculations.calculateDistance(
        position,
        node.position,
      );
      return distance <= radiusMeters;
    });
  }
}
