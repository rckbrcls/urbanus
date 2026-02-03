import { NextRequest, NextResponse } from "next/server";

const PYTHON_API_URL = process.env.PYTHON_API_URL ?? "http://localhost:8000";

interface ProcessRequest {
  geojson: GeoJSON.FeatureCollection;
  options: {
    maxEdgeLength: number;
    preserveElevations?: boolean;
  };
}

export async function POST(request: NextRequest) {
  try {
    const body: ProcessRequest = await request.json();
    const { geojson, options } = body;

    if (!geojson?.features || !options) {
      return NextResponse.json(
        { error: "Missing required fields: geojson (with features) and options" },
        { status: 400 }
      );
    }

    if (typeof options.maxEdgeLength !== "number" || options.maxEdgeLength <= 0) {
      return NextResponse.json(
        { error: "maxEdgeLength deve ser maior que zero" },
        { status: 400 }
      );
    }

    const res = await fetch(`${PYTHON_API_URL}/graph/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        geojson,
        options: {
          maxEdgeLength: options.maxEdgeLength,
          preserveElevations: options.preserveElevations ?? true,
        },
      }),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { detail?: string | string[] };
      const msg = Array.isArray(err.detail) ? err.detail[0] : err.detail;
      return NextResponse.json(
        { error: msg ?? "Graph processing failed" },
        { status: res.status }
      );
    }

    const processed = await res.json();
    return NextResponse.json(processed);
  } catch (error) {
    console.error("Error in graph process API:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
