import type { Metadata } from "next";
import { BrowseView } from "@/components/catalog/browse";
import { parseCatalogCategoryId } from "@/lib/catalog/url/catalog-url";

export const metadata: Metadata = {
  title: "Каталог — VP Parts",
  description:
    "Разгледайте всички категории резервни части или изберете автомобил, за да видите само съвместимите с него.",
};

interface CatalogPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CatalogPage({ searchParams }: CatalogPageProps) {
  return (
    <BrowseView scopedCategoryId={parseCatalogCategoryId(await searchParams)} />
  );
}
