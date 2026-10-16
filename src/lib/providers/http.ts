const USER_AGENT = "Smolfeed/0.1 (local feed reader)";

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 8000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
        ...(init.headers ?? {}),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("The request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

export type TokenBundle = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number | null;
};

export function tokenBundle(
  body: {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  },
  existingRefresh: string | null,
): TokenBundle {
  if (!body.access_token) {
    throw new Error("Token response did not include an access token");
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? existingRefresh,
    expiresAt:
      typeof body.expires_in === "number"
        ? Date.now() + body.expires_in * 1000
        : null,
  };
}

export function basicAuth(id: string, secret: string): string {
  return `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
}

export function formBody(fields: Record<string, string>): string {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) body.set(key, value);
  return body.toString();
}
