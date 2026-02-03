export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

export function extractErrorMessage(
  data: unknown,
  fallback: string,
): string {
  if (typeof data === "string" && data.trim()) return data;
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    const candidates = [
      obj.error,
      obj.detail,
      obj.message,
      obj.msg,
    ];
    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate;
      }
    }
    if (Array.isArray(obj.errors) && obj.errors.length > 0) {
      const first = obj.errors[0];
      if (typeof first === "string" && first.trim()) return first;
      if (first && typeof first === "object") {
        const nested = (first as Record<string, unknown>).message;
        if (typeof nested === "string" && nested.trim()) return nested;
      }
    }
  }
  return fallback;
}

export async function getErrorMessageFromResponse(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const data = await response.clone().json();
    return extractErrorMessage(data, fallback);
  } catch {
    // Ignore JSON parsing error
  }

  try {
    const text = await response.text();
    if (text.trim()) return text;
  } catch {
    // Ignore text parsing error
  }

  return fallback;
}
