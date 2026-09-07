/** The detail sections an article offers, in display order. */
export type ArticleSectionId = "specs" | "substitutes" | "numbers" | "vehicles";

/**
 * Shared because two surfaces name the same sections — the catalog row's
 * expander and the article detail page's tab strip — and a label renamed in one
 * of them reads as two different features.
 */
export const ARTICLE_SECTION_LABEL: Record<ArticleSectionId, string> = {
  specs: "Технически характеристики",
  substitutes: "Заменяеми",
  numbers: "Алтернативни номера",
  vehicles: "Приложими автомобили",
};
