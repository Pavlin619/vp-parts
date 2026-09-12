import type { ArticleCategoryNodeDto } from "@vp-parts-shop/shared";
import { markLastAsCurrent, type BreadcrumbItem } from "../breadcrumbs";
import { CATALOG_PATH, catalogCategoryHref } from "./catalog-url";
import { categoryTrailSearchHref } from "./category-href";

const HOME_CRUMB: BreadcrumbItem = { key: "home", label: "Начало", href: "/" };

/** Reads as the search's own root crumb, so the two trails start alike. */
const ALL_CATEGORIES_LABEL = "Всички категории";

interface ArticleBreadcrumbsInput {
  categoryPaths: ArticleCategoryNodeDto[][];
  brandName: string;
  articleNumber: string;
  /** The category the visitor drilled to reach the part, when they drilled one. */
  categoryNodeId?: string;
  /** The car the article URL arrived scoped to, which its listing then keeps. */
  vehicleId?: string;
}

/** The trail from the catalogue root down to the part on screen. */
export function buildArticleBreadcrumbs({
  categoryPaths,
  brandName,
  articleNumber,
  categoryNodeId,
  vehicleId,
}: ArticleBreadcrumbsInput): BreadcrumbItem[] {
  const categoryPath = selectArticleCategoryPath(categoryPaths, categoryNodeId);

  return markLastAsCurrent([
    HOME_CRUMB,
    { key: "all-categories", label: ALL_CATEGORIES_LABEL, href: CATALOG_PATH },
    ...categoryCrumbs(categoryPath, vehicleId),
    { key: "article", label: `${brandName} ${articleNumber}` },
  ]);
}

/**
 * Where each step of the trail leads, which is two destinations rather than one.
 *
 * Every step above the last has something under it — the trail runs through it
 * — so it opens the catalogue there, with the drill panel already inside that
 * category. The last step is where TecDoc files the part, so it goes to that
 * listing instead, the one search certain to hold the article on screen.
 */
function categoryCrumbs(
  categoryPath: ArticleCategoryNodeDto[],
  vehicleId: string | undefined,
): BreadcrumbItem[] {
  const listingHref = categoryTrailSearchHref(
    vehicleId,
    categoryPath.map((node) => node.id),
  );

  return categoryPath.map((node, index) => ({
    key: `category-${node.id}`,
    label: node.label,
    href:
      index === categoryPath.length - 1
        ? listingHref
        : catalogCategoryHref(node.id),
  }));
}

/**
 * Which of an article's category trails to show.
 *
 * TecDoc files one part under several at once — an oil filter is under
 * `филтър`, under `двигател › смазване` and under the service schedule — so
 * there is no canonical home to read off the data and the choice is ours.
 *
 * The trail the visitor drilled wins, because a breadcrumb that disagrees with
 * the way in is a breadcrumb nobody trusts. Failing that the shortest one, which
 * over every article measured is the one describing what the part *is* rather
 * than where it sits on the car or why it is replaced. The label tie-break is
 * not cosmetic: the page is cached, so a trail chosen by arrival order would
 * outlive the read that chose it.
 */
export function selectArticleCategoryPath(
  categoryPaths: ArticleCategoryNodeDto[][],
  categoryNodeId?: string,
): ArticleCategoryNodeDto[] {
  const drilled = categoryNodeId
    ? categoryPaths.filter((path) =>
        path.some((node) => node.id === categoryNodeId),
      )
    : [];

  const candidates = drilled.length > 0 ? drilled : categoryPaths;

  return [...candidates].sort(byLengthThenLabels)[0] ?? [];
}

function byLengthThenLabels(
  left: ArticleCategoryNodeDto[],
  right: ArticleCategoryNodeDto[],
): number {
  return (
    left.length - right.length ||
    joinLabels(left).localeCompare(joinLabels(right), "bg")
  );
}

function joinLabels(path: ArticleCategoryNodeDto[]): string {
  return path.map((node) => node.label).join("/");
}
