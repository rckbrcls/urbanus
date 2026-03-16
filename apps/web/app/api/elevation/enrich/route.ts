import { NextRequest, NextResponse } from "next/server";

const PYTHON_API_URL = process.env.PYTHON_API_URL ?? "http://localhost:8000";

interface EnrichRequest {
  geojson: GeoJSON.FeatureCollection;
  bbox: { south: number; north: number; west: number; east: number };
  demType?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: EnrichRequest = await request.json();
    const { geojson, bbox, demType = "COP30" } = body;

    if (!geojson?.features || !bbox) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: geojson (with features) and bbox (south, north, west, east)",
        },
        { status: 400 }
      );
    }

    const { south, north, west, east } = bbox;
    if (
      typeof south !== "number" ||
      typeof north !== "number" ||
      typeof west !== "number" ||
      typeof east !== "number"
    ) {
      return NextResponse.json(
        { error: "bbox must contain south, north, west, east as numbers" },
        { status: 400 }
      );
    }

    if (south >= north || west >= east) {
      return NextResponse.json(
        { error: "Invalid bbox: south < north and west < east required" },
        { status: 400 }
      );
    }

    const res = await fetch(`${PYTHON_API_URL}/elevation/enrich`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ geojson, bbox: { south, north, west, east }, demType }),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { detail?: string | string[] };
      const msg = Array.isArray(err.detail) ? err.detail[0] : err.detail;
      return NextResponse.json(
        { error: msg ?? "Elevation enrichment failed" },
        { status: res.status }
      );
    }

    const enriched = await res.json();
    return NextResponse.json(enriched);
  } catch (error) {
    console.error("Error in elevation enrich API:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
