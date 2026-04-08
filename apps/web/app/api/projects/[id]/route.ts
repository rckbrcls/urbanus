import { NextResponse } from "next/server";

const PYTHON_API_URL = process.env.PYTHON_API_URL ?? "http://localhost:8000";
const REQUEST_TIMEOUT_MS = 15_000;

function getTimeoutErrorMessage(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  if (error.name === "TimeoutError" || error.name === "AbortError") {
    return "Request timed out";
  }
  return null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const res = await fetch(`${PYTHON_API_URL}/projects/${id}`, {
      method: "GET",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as {
        detail?: string | string[];
      };
      const msg = Array.isArray(err.detail) ? err.detail[0] : err.detail;
      return NextResponse.json(
        { error: msg ?? "Failed to fetch project" },
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

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const res = await fetch(`${PYTHON_API_URL}/projects/${id}`, {
      method: "DELETE",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as {
        detail?: string | string[];
      };
      const msg = Array.isArray(err.detail) ? err.detail[0] : err.detail;
      return NextResponse.json(
        { error: msg ?? "Failed to delete project" },
        { status: res.status },
      );
    }

    return NextResponse.json({ status: "deleted" });
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
