import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Picks the Bulgarian noun form for a count. Only two forms exist, but a count
 * of one needs the singular: `1 категории` reads as broken in a way `1
 * categories` never would, and a TecDoc level holding one subgroup is ordinary.
 */
export function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
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
