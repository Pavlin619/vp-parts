import type { DeliveryOfficeDto, DeliveryOfficeType } from "@vp-parts-shop/shared";

export type OfficeTypeFilter = "ALL" | DeliveryOfficeType;

export interface OfficeSearch {
  query: string;
  type: OfficeTypeFilter;
}

export const EMPTY_OFFICE_SEARCH: OfficeSearch = {
  query: "",
  type: "ALL",
};

const MAX_SUGGESTIONS = 4;

/** Offices of the kind asked for whose city, name, address or post code hold every word of the query. */
export function filterOffices(offices: DeliveryOfficeDto[], search: OfficeSearch): DeliveryOfficeDto[] {
  const words = queryWords(search.query);

  return offices.filter(
    (office) =>
      (search.type === "ALL" || office.type === search.type) &&
      matchesEveryWord(searchableText(office), words),
  );
}

export function suggestOffices(offices: DeliveryOfficeDto[], query: string): DeliveryOfficeDto[] {
  const words = queryWords(query);

  if (words.length === 0) {
    return [];
  }

  return offices
    .filter((office) => matchesEveryWord(searchableText(office), words))
    .slice(0, MAX_SUGGESTIONS);
}

function queryWords(query: string): string[] {
  return normalize(query).split(/\s+/).filter(Boolean);
}

function matchesEveryWord(text: string, words: string[]): boolean {
  return words.every((word) => text.includes(word));
}

function searchableText({ city, name, address, postCode }: DeliveryOfficeDto): string {
  return normalize([city, name, address, postCode ?? ""].join(" "));
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("bg");
}
