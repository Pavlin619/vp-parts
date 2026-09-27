import type { DeliveryOfficeDto, DeliveryOfficeType } from "@vp-parts-shop/shared";

export type OfficeTypeFilter = "ALL" | DeliveryOfficeType;

export interface OfficeSearch {
  query: string;
  type: OfficeTypeFilter;
  city: string | null;
}

export interface OfficeSuggestions {
  cities: string[];
  offices: DeliveryOfficeDto[];
}

export const EMPTY_OFFICE_SEARCH: OfficeSearch = {
  query: "",
  type: "ALL",
  city: null,
};

const MAX_SUGGESTIONS = 4;

/** Offices that pass every filter and whose city, name, address or post code hold every word of the query. */
export function filterOffices(offices: DeliveryOfficeDto[], search: OfficeSearch): DeliveryOfficeDto[] {
  const words = queryWords(search.query);

  return offices.filter(
    (office) =>
      (search.type === "ALL" || office.type === search.type) &&
      (search.city === null || office.city === search.city) &&
      matchesEveryWord(searchableText(office), words),
  );
}

export function suggestOffices(offices: DeliveryOfficeDto[], query: string): OfficeSuggestions {
  const words = queryWords(query);

  if (words.length === 0) {
    return { cities: [], offices: [] };
  }

  return {
    cities: suggestCities(offices, normalize(query)),
    offices: offices
      .filter((office) => matchesEveryWord(searchableText(office), words))
      .slice(0, MAX_SUGGESTIONS),
  };
}

function suggestCities(offices: DeliveryOfficeDto[], query: string): string[] {
  const matching = [...new Set(offices.map(({ city }) => city))].filter((city) =>
    normalize(city).includes(query),
  );
  const startsWithQuery = (city: string) => normalize(city).startsWith(query);

  return [
    ...matching.filter(startsWithQuery),
    ...matching.filter((city) => !startsWithQuery(city)),
  ].slice(0, MAX_SUGGESTIONS);
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
