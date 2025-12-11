import { NextRequest, NextResponse } from "next/server";

const OPENTOPOGRAPHY_API_URL = "https://portal.opentopography.org/API/globaldem";

// Tipos de DEM disponíveis
const DEM_TYPES = [
  "SRTMGL3",    // SRTM GL3 90m
  "SRTMGL1",    // SRTM GL1 30m
  "COP30",      // Copernicus 30m
  "COP90",      // Copernicus 90m
  "AW3D30",     // ALOS World 3D 30m
  "NASADEM",    // NASA DEM
  "EU_DTM",     // EU DTM 30m
  "GEDI_L3",    // GEDI L3 1000m
] as const;

type DemType = (typeof DEM_TYPES)[number];

interface TopographyRequest {
  south: number;
  north: number;
  west: number;
  east: number;
  demType?: DemType;
  outputFormat?: "GTiff" | "AAIGrid" | "HFA";
}

export async function POST(request: NextRequest) {
  try {
    const body: TopographyRequest = await request.json();
    const { south, north, west, east, demType = "COP30", outputFormat = "GTiff" } = body;

    // Validação dos parâmetros
    if (south == null || north == null || west == null || east == null) {
      return NextResponse.json(
        { error: "Parâmetros de bounding box são obrigatórios (south, north, west, east)" },
        { status: 400 }
      );
    }

    // Validar range de coordenadas
    if (south >= north) {
      return NextResponse.json(
        { error: "south deve ser menor que north" },
        { status: 400 }
      );
    }

    if (west >= east) {
      return NextResponse.json(
        { error: "west deve ser menor que east" },
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

    // Verificar limite de área (OpenTopography tem limites)
    const maxAreaKm2 = 100;
    if (areaKm2 > maxAreaKm2) {
      return NextResponse.json(
        {
          error: `Área selecionada muito grande (${areaKm2.toFixed(0)} km²). Máximo permitido: ${maxAreaKm2} km²`,
          areaKm2: areaKm2
        },
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENTOPOGRAPHY_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "API Key do OpenTopography não configurada. Adicione OPENTOPOGRAPHY_API_KEY no .env.local" },
        { status: 500 }
      );
    }

    // Construir URL da API
    const params = new URLSearchParams({
      demtype: demType,
      south: south.toString(),
      north: north.toString(),
      west: west.toString(),
      east: east.toString(),
      outputFormat: outputFormat,
      API_Key: apiKey,
    });

    const apiUrl = `${OPENTOPOGRAPHY_API_URL}?${params.toString()}`;

    // Fazer requisição ao OpenTopography
    const response = await fetch(apiUrl, {
      method: "GET",
      headers: {
        Accept: "application/octet-stream",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenTopography API error:", errorText);
      return NextResponse.json(
        {
          error: "Erro ao buscar dados do OpenTopography",
          details: errorText,
          status: response.status
        },
        { status: response.status }
      );
    }

    // Verificar se é um arquivo ou mensagem de erro
    const contentType = response.headers.get("content-type");

    if (contentType?.includes("application/json") || contentType?.includes("text/html")) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: "Resposta inesperada do OpenTopography", details: errorText },
        { status: 400 }
      );
    }

    // Retornar o arquivo GeoTIFF
    const buffer = await response.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "image/tiff",
        "Content-Disposition": `attachment; filename="dem_${demType}_${Date.now()}.tif"`,
        "Content-Length": buffer.byteLength.toString(),
      },
    });

  } catch (error) {
    console.error("Error in topography API:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor", details: String(error) },
      { status: 500 }
    );
  }
}

// GET para retornar informações sobre a API
export async function GET() {
  return NextResponse.json({
    message: "OpenTopography API Proxy",
    endpoint: "POST /api/topography",
    demTypes: DEM_TYPES,
    requiredParams: {
      south: "Latitude sul do bounding box",
      north: "Latitude norte do bounding box",
      west: "Longitude oeste do bounding box",
      east: "Longitude leste do bounding box",
    },
    optionalParams: {
      demType: `Tipo de DEM (padrão: COP30). Opções: ${DEM_TYPES.join(", ")}`,
      outputFormat: "Formato de saída (padrão: GTiff). Opções: GTiff, AAIGrid, HFA",
    },
  });
}
