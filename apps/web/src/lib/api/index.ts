import type { ApiErrorResponse } from "@vp-parts-shop/shared";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly errorCode: string,
  ) {
    super(`${errorCode} (${statusCode})`);
    this.name = "ApiError";
  }
}

interface ApiFetchOptions extends Omit<RequestInit, "body"> {
  token?: string;
  body?: unknown;
}

export async function apiFetch<T>(
  path: string,
  { token, body, ...init }: ApiFetchOptions = {},
): Promise<T> {
  const headers = new Headers(init.headers);

  if (body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorPayload: ApiErrorResponse = await response
      .json()
      .catch(() => ({ statusCode: response.status, errorCode: "UNKNOWN_ERROR" }));
    throw new ApiError(errorPayload.statusCode, errorPayload.errorCode);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
