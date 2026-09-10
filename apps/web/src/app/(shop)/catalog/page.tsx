import type { Metadata } from "next";
import { BrowseView } from "@/components/catalog/browse";

export const metadata: Metadata = {
  title: "Каталог — VP Parts",
  description:
    "Разгледайте всички категории резервни части, съвместими с вашия автомобил.",
};

export default function CatalogPage() {
  return <BrowseView />;
}
