import Link from "next/link";

export function CatalogBreadcrumbs() {
  return (
    <nav aria-label="Навигационна пътека" className="mb-6">
      <ol className="flex items-center gap-2 text-sm text-muted">
        <li>
          <Link href="/" className="hover:text-ink transition-colors">
            Начало
          </Link>
        </li>
        <li aria-hidden="true">/</li>
        <li className="text-ink font-medium">Части</li>
      </ol>
    </nav>
  );
}
