import type { ApiErrorResponse } from "@vp-parts-shop/shared";
import { BROWSER_API_URL } from "./browser-api-url";
import { getSessionToken } from "./session-token";

const API_BASE_URL =
  typeof window === "undefined"
    ? (process.env.API_URL ?? "http://127.0.0.1:3001")
    : BROWSER_API_URL;

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly errorCode: string,
  ) {
    super(`${errorCode} (${statusCode})`);
    this.name = "ApiError";
  }
}

/** A 4xx answers the same on a retry; only an outage is worth asking again. */
export function isRefusal(error: unknown): boolean {
  return error instanceof ApiError && error.statusCode < 500;
}

interface ApiFetchOptions extends Omit<RequestInit, "body"> {
  token?: string;
  /**
   * Sends the signed-in customer's Clerk session. Opt-in: an `Authorization`
   * header turns every cross-origin read into a CORS preflight, and the catalog
   * reads need no session.
   */
  withSession?: boolean;
  body?: unknown;
  /**
   * Handed the response headers before the body is read, for the few reads
   * whose answer is partly in a header — the cart token a first add mints.
   */
  onHeaders?: (headers: Headers) => void;
}

export async function apiFetch<T>(
  path: string,
  { token, withSession, body, onHeaders, ...init }: ApiFetchOptions = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  const bearer = token ?? (withSession ? await getSessionToken() : null);

  if (body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  if (bearer) {
    headers.set("Authorization", `Bearer ${bearer}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  onHeaders?.(response.headers);

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
