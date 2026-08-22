import { Breadcrumbs } from "@/components/common/breadcrumbs";
import type { BreadcrumbItem } from "@/lib/breadcrumbs";

const CATALOG_TRAIL: BreadcrumbItem[] = [
  { key: "home", label: "Начало", href: "/" },
  { key: "parts", label: "Части" },
];

export function CatalogBreadcrumbs() {
  return <Breadcrumbs items={CATALOG_TRAIL} />;
}
