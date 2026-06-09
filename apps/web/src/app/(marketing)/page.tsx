import type { Metadata } from "next";
import { HeroSection } from "@/components/marketing/hero-section";
import { CategoryGrid } from "@/components/marketing/category-grid";

export const metadata: Metadata = {
  title: "VP Parts — Резервни части за автомобили",
  description:
    "Намерете оригинални и алтернативни резервни части за всички марки автомобили. Бърза доставка, конкурентни цени.",
};

export const revalidate = 21600;

export default function HomePage() {
  return (
    <div className="bg-canvas">
      <HeroSection />
      <CategoryGrid />
    </div>
  );
}
