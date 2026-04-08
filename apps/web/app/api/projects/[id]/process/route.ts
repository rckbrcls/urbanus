import { NextRequest, NextResponse } from "next/server";

const PYTHON_API_URL = process.env.PYTHON_API_URL ?? "http://localhost:8000";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const contentType = request.headers.get("content-type");
  if (!contentType?.includes("application/json")) {
    return NextResponse.json(
      { error: "Edited graph payload must be sent as application/json" },
      { status: 400 },
    );
  }

  const body = await request.text();
  if (!body.trim()) {
    return NextResponse.json(
      { error: "Edited graph payload with nodes and edges is required" },
      { status: 400 },
    );
  }

  try {
    const res = await fetch(`${PYTHON_API_URL}/projects/${id}/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(600_000),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as {
        detail?: string | string[];
      };
      const msg = Array.isArray(err.detail) ? err.detail[0] : err.detail;
      return NextResponse.json(
        { error: msg ?? "Pipeline processing failed" },
        { status: res.status },
      );
    }

    const result = await res.json();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error in process pipeline API:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
