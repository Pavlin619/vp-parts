import Link from "next/link";

interface CatalogPaginationProps {
  page: number;
  pageSize: number;
  total: number;
  vehicleId: string;
}

export function CatalogPagination({
  page,
  pageSize,
  total,
  vehicleId,
}: CatalogPaginationProps) {
  const totalPages = Math.ceil(total / pageSize);

  if (total <= pageSize) {
    return null;
  }

  return (
    <nav
      aria-label="Странициране"
      className="mt-8 flex items-center justify-center gap-2"
    >
      {page > 1 && (
        <Link
          href={`?vehicleId=${vehicleId}&page=${page - 1}&pageSize=${pageSize}`}
          className="h-9 px-4 flex items-center rounded-lg border border-line text-sm hover:bg-bg-sunken transition-colors"
        >
          ← Предишна
        </Link>
      )}
      <span className="text-sm text-muted px-3">
        Страница {page} от {totalPages}
      </span>
      {page < totalPages && (
        <Link
          href={`?vehicleId=${vehicleId}&page=${page + 1}&pageSize=${pageSize}`}
          className="h-9 px-4 flex items-center rounded-lg border border-line text-sm hover:bg-bg-sunken transition-colors"
        >
          Следваща →
        </Link>
      )}
    </nav>
  );
}
