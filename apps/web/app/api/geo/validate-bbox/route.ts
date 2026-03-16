/**
 * API Route: Validação de Bounding Box
 *
 * Valida um bounding box antes de processar dados
 */

import { NextRequest, NextResponse } from "next/server";
import { GeoValidations, GeoCalculations, type BoundingBox } from "@/lib/geo";

const MAX_AREA_KM2 = 100;
const MIN_AREA_KM2 = 0.001;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { south, west, north, east } = body;

    const errors: string[] = [];

    // Validação de tipos
    if (!GeoValidations.isValidLatitude(south)) {
      errors.push("Latitude sul inválida");
    }
    if (!GeoValidations.isValidLatitude(north)) {
      errors.push("Latitude norte inválida");
    }
    if (!GeoValidations.isValidLongitude(west)) {
      errors.push("Longitude oeste inválida");
    }
    if (!GeoValidations.isValidLongitude(east)) {
      errors.push("Longitude leste inválida");
    }

    if (errors.length > 0) {
      return NextResponse.json({ valid: false, errors }, { status: 400 });
    }

    // Validação de ordem
    if (south >= north) {
      errors.push("Latitude sul deve ser menor que latitude norte");
    }
    if (west >= east) {
      errors.push("Longitude oeste deve ser menor que longitude leste");
    }

    if (errors.length > 0) {
      return NextResponse.json({ valid: false, errors }, { status: 400 });
    }

    // Cálculo de área
    const bbox: BoundingBox = {
      southWest: { lat: south, lng: west },
      northEast: { lat: north, lng: east },
    };
    const area = GeoCalculations.calculateArea(bbox);

    // Validação de área
    if (area > MAX_AREA_KM2) {
      errors.push(
        `Área (${area.toFixed(2)} km²) excede limite de ${MAX_AREA_KM2} km²`,
      );
    }
    if (area < MIN_AREA_KM2) {
      errors.push(
        `Área (${area.toFixed(4)} km²) menor que mínimo de ${MIN_AREA_KM2} km²`,
      );
    }

    const warnings: string[] = [];
    if (area > 50 && area <= MAX_AREA_KM2) {
      warnings.push("Áreas grandes podem demorar mais para processar");
    }

    return NextResponse.json({
      valid: errors.length === 0,
      errors,
      warnings,
      metadata: {
        area,
        center: GeoCalculations.getCenter(bbox),
        dimensions: GeoCalculations.getDimensions(bbox),
      },
    });
  } catch (error) {
    console.error("Erro ao validar bbox:", error);
    return NextResponse.json(
      { valid: false, errors: ["Erro ao processar requisição"] },
      { status: 500 },
    );
  }
}
