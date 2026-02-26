import { NextRequest, NextResponse } from "next/server";

const PYTHON_API_URL = process.env.PYTHON_API_URL ?? "http://localhost:8000";

interface NodesExtractRequest {
  geojson: GeoJSON.FeatureCollection;
  mode?: "intersections" | "all";
}

export async function POST(request: NextRequest) {
  try {
    const body: NodesExtractRequest = await request.json();
    const { geojson, mode = "intersections" } = body;

    if (!geojson?.features) {
      return NextResponse.json(
        { error: "Missing required field: geojson (with features)" },
        { status: 400 },
      );
    }

    const res = await fetch(`${PYTHON_API_URL}/nodes/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ geojson, mode }),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as {
        detail?: string | string[];
      };
      const msg = Array.isArray(err.detail) ? err.detail[0] : err.detail;
      return NextResponse.json(
        { error: msg ?? "Node extraction failed" },
        { status: res.status },
      );
    }

    const result = await res.json();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error in nodes extract API:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
