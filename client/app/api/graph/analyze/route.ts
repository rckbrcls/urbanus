import { NextRequest, NextResponse } from "next/server";

const PYTHON_API_URL = process.env.PYTHON_API_URL ?? "http://localhost:8000";

interface AnalyzeRequest {
  geojson: GeoJSON.FeatureCollection;
  maxEdgeLength: number;
}

export async function POST(request: NextRequest) {
  try {
    const body: AnalyzeRequest = await request.json();
    const { geojson, maxEdgeLength } = body;

    if (!geojson?.features || typeof maxEdgeLength !== "number") {
      return NextResponse.json(
        { error: "Missing required fields: geojson (with features) and maxEdgeLength" },
        { status: 400 }
      );
    }

    if (maxEdgeLength <= 0) {
      return NextResponse.json(
        { error: "maxEdgeLength deve ser maior que zero" },
        { status: 400 }
      );
    }

    const res = await fetch(`${PYTHON_API_URL}/graph/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ geojson, maxEdgeLength }),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { detail?: string | string[] };
      const msg = Array.isArray(err.detail) ? err.detail[0] : err.detail;
      return NextResponse.json(
        { error: msg ?? "Graph analysis failed" },
        { status: res.status }
      );
    }

    const analyzed = await res.json();
    return NextResponse.json(analyzed);
  } catch (error) {
    console.error("Error in graph analyze API:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
