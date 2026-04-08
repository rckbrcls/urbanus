import { NextRequest, NextResponse } from "next/server";

const PYTHON_API_URL = process.env.PYTHON_API_URL ?? "http://localhost:8000";
const REQUEST_TIMEOUT_MS = 15_000;

function getTimeoutErrorMessage(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  if (error.name === "TimeoutError" || error.name === "AbortError") {
    return "Request timed out";
  }
  return null;
}

export async function GET() {
  try {
    const res = await fetch(`${PYTHON_API_URL}/projects`, {
      method: "GET",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as {
        detail?: string | string[];
      };
      const msg = Array.isArray(err.detail) ? err.detail[0] : err.detail;
      return NextResponse.json(
        { error: msg ?? "Failed to fetch projects" },
        { status: res.status },
      );
    }

    return NextResponse.json(await res.json());
  } catch (error) {
    return NextResponse.json(
      {
        error: getTimeoutErrorMessage(error) ?? "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  let body: string | undefined;
  const contentType = request.headers.get("content-type");
  if (contentType?.includes("application/json")) {
    body = await request.text();
  }

  try {
    const res = await fetch(`${PYTHON_API_URL}/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as {
        detail?: string | string[];
      };
      const msg = Array.isArray(err.detail) ? err.detail[0] : err.detail;
      return NextResponse.json(
        { error: msg ?? "Failed to save project" },
        { status: res.status },
      );
    }

    return NextResponse.json(await res.json());
  } catch (error) {
    return NextResponse.json(
      {
        error: getTimeoutErrorMessage(error) ?? "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
