import { NextRequest, NextResponse } from "next/server";

const OVERPASS_API_URL = "https://overpass-api.de/api/interpreter";

interface StreetsRequest {
  south: number;
  north: number;
  west: number;
  east: number;
  types?: string[];
}

// Tipos de vias disponíveis
const DEFAULT_HIGHWAY_TYPES = [
  "motorway",
  "trunk",
  "primary",
  "secondary",
  "tertiary",
  "residential",
  "unclassified",
];

export async function POST(request: NextRequest) {
  try {
    const body: StreetsRequest = await request.json();
    const { south, north, west, east, types = DEFAULT_HIGHWAY_TYPES } = body;

    // Validação dos parâmetros
    if (south == null || north == null || west == null || east == null) {
      return NextResponse.json(
        { error: "Parâmetros de bounding box são obrigatórios (south, north, west, east)" },
        { status: 400 }
      );
    }

    // Calcular área aproximada em km²
    const latDiff = north - south;
    const lonDiff = east - west;
    const avgLat = (north + south) / 2;
    const kmPerDegreeLat = 111.32;
    const kmPerDegreeLon = 111.32 * Math.cos((avgLat * Math.PI) / 180);
    const areaKm2 = latDiff * kmPerDegreeLat * lonDiff * kmPerDegreeLon;

    // Limite de área para evitar sobrecarga
    const maxAreaKm2 = 100;
    if (areaKm2 > maxAreaKm2) {
      return NextResponse.json(
        {
          error: `Área muito grande (${areaKm2.toFixed(1)} km²). Máximo: ${maxAreaKm2} km²`,
          areaKm2,
        },
        { status: 400 }
      );
    }

    // Construir filtro de tipos de highway
    const highwayFilter = types.map((t) => `["highway"="${t}"]`).join("");

    // Query Overpass para buscar ruas
    const query = `
      [out:json][timeout:30];
      (
        way["highway"~"^(${types.join("|")})$"](${south},${west},${north},${east});
      );
      out body;
      >;
      out skel qt;
    `;

    const response = await fetch(OVERPASS_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `data=${encodeURIComponent(query)}`,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Overpass API error:", errorText);
      return NextResponse.json(
        { error: "Erro ao buscar dados do OpenStreetMap", details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Converter para GeoJSON
    const geojson = convertToGeoJSON(data);

    return NextResponse.json({
      type: "FeatureCollection",
      features: geojson.features,
      metadata: {
        totalStreets: geojson.features.length,
        areaKm2: areaKm2,
        bounds: { south, north, west, east },
      },
    });
  } catch (error) {
    console.error("Error in streets API:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor", details: String(error) },
      { status: 500 }
    );
  }
}

// Converter dados do Overpass para GeoJSON
function convertToGeoJSON(data: {
  elements: Array<{
    type: string;
    id: number;
    nodes?: number[];
    lat?: number;
    lon?: number;
    tags?: Record<string, string>;
  }>;
}) {
  const nodes: Record<number, [number, number]> = {};
  const ways: Array<{
    id: number;
    nodes: number[];
    tags: Record<string, string>;
  }> = [];

  // Separar nodes e ways
  for (const element of data.elements) {
    if (element.type === "node" && element.lat && element.lon) {
      nodes[element.id] = [element.lon, element.lat];
    } else if (element.type === "way" && element.nodes) {
      ways.push({
        id: element.id,
        nodes: element.nodes,
        tags: element.tags || {},
      });
    }
  }

  // Converter ways para features GeoJSON
  const features = ways
    .map((way) => {
      const coordinates = way.nodes
        .map((nodeId) => nodes[nodeId])
        .filter((coord) => coord !== undefined);

      if (coordinates.length < 2) return null;

      return {
        type: "Feature" as const,
        properties: {
          id: way.id,
          name: way.tags.name || null,
          highway: way.tags.highway,
          surface: way.tags.surface || null,
          lanes: way.tags.lanes ? parseInt(way.tags.lanes) : null,
          maxspeed: way.tags.maxspeed || null,
          oneway: way.tags.oneway === "yes",
        },
        geometry: {
          type: "LineString" as const,
          coordinates,
        },
      };
    })
    .filter((f) => f !== null);

  return { type: "FeatureCollection" as const, features };
}

// GET para informações da API
export async function GET() {
  return NextResponse.json({
    message: "Streets API - OpenStreetMap Overpass",
    endpoint: "POST /api/streets",
    requiredParams: {
      south: "Latitude sul do bounding box",
      north: "Latitude norte do bounding box",
      west: "Longitude oeste do bounding box",
      east: "Longitude leste do bounding box",
    },
    optionalParams: {
      types: `Tipos de via (padrão: ${DEFAULT_HIGHWAY_TYPES.join(", ")})`,
    },
    maxArea: "25 km²",
  });
}
