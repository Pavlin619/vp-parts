import { redirect } from "next/navigation";
import { searchByPartNumber } from "@/lib/api/catalog";
import { SearchResults } from "@/components/catalog/search-results";
import { SearchEmptyState } from "@/components/catalog/search-empty-state";

interface SearchPageProps {
  searchParams: Promise<{ q?: string; vehicleId?: string }>;
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q, vehicleId } = await searchParams;
  const query = q?.trim();

  if (!query) {
    return (
      <div className="max-w-[1360px] mx-auto px-6 py-8">
        <SearchEmptyState query="" />
      </div>
    );
  }

  const response = await searchByPartNumber(query, vehicleId);

  if (response.redirect) {
    redirect(response.redirect);
  }

  const results = response.results ?? [];

  return (
    <div className="max-w-[1360px] mx-auto px-6 py-8">
      {results.length > 0 ? (
        <SearchResults query={query} results={results} />
      ) : (
        <SearchEmptyState query={query} suggestions={response.suggestions} />
      )}
    </div>
  );
}
