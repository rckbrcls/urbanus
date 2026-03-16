/**
 * API Route: Nós
 *
 * CRUD de nós editados de um projeto
 */

import { NextRequest, NextResponse } from "next/server";
import { GeoValidations } from "@urbanus/geo";

/**
 * POST /api/geo/nodes
 * Salva nós editados de um projeto
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, nodes } = body;

    // Validações
    if (!projectId || typeof projectId !== "string") {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_PROJECT_ID",
            message: "ID do projeto inválido",
          },
        },
        { status: 400 },
      );
    }

    if (!Array.isArray(nodes)) {
      return NextResponse.json(
        { error: { code: "INVALID_NODES", message: "Nós devem ser um array" } },
        { status: 400 },
      );
    }

    // Valida cada nó
    const invalidNodes = nodes.filter(
      (node: { id?: string; position?: unknown }) => {
        if (!node.id || !node.position) return true;
        if (!GeoValidations.isValidLatLng(node.position)) return true;
        return false;
      },
    );

    if (invalidNodes.length > 0) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_NODE_DATA",
            message: `${invalidNodes.length} nó(s) com dados inválidos`,
          },
        },
        { status: 400 },
      );
    }

    // Por enquanto, retorna sucesso simulado
    // Em produção, salvaria no backend (MongoDB via FastAPI)
    return NextResponse.json({
      success: true,
      savedCount: nodes.length,
      projectId,
    });
  } catch (error) {
    console.error("Erro ao salvar nós:", error);
    return NextResponse.json(
      {
        error: { code: "INTERNAL_ERROR", message: "Erro interno do servidor" },
      },
      { status: 500 },
    );
  }
}
