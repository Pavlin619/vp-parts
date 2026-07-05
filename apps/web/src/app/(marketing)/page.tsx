import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import { HeroSection } from "@/components/marketing/hero-section";
import { CategoryGrid } from "@/components/marketing/category-grid";

export const metadata: Metadata = {
  title: "VP Parts — Резервни части за автомобили",
  description:
    "Намерете оригинални и алтернативни резервни части за всички марки автомобили. Бърза доставка, конкурентни цени.",
};

export default async function HomePage() {
  // Fully static marketing content. Under Cache Components `export const
  // revalidate` is unavailable, so the cache strategy is declared here: cache
  // the rendered shell and revalidate on a slow (daily) cadence.
  "use cache";
  cacheLife("days");

  return (
    <div className="bg-canvas">
      <HeroSection />
      <CategoryGrid />
    </div>
  );
}
