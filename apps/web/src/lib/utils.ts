import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat("bg-BG", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(typeof date === "string" ? new Date(date) : date);
}

/**
 * Next.js App Router does NOT decode dynamic route segments — `params.foo`
 * arrives percent-encoded (e.g. the article number "OX 982D" comes through as
 * "OX%20982D"). Always decode before using the value in an API call, query, or
 * the UI, otherwise it gets re-encoded into a double-encoded string downstream.
 * Falls back to the raw value if it is not valid percent-encoding so a malformed
 * URL never crashes the page.
 */
export function decodeRouteParam(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
