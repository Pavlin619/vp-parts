import type { ArticleCategoryNodeDto } from "@vp-parts-shop/shared";
import { markLastAsCurrent, type BreadcrumbItem } from "../breadcrumbs";

const HOME_CRUMB: BreadcrumbItem = { key: "home", label: "Начало", href: "/" };

/** Reads as the search's own root crumb, so the two trails start alike. */
const ALL_CATEGORIES_LABEL = "Всички категории";

interface ArticleBreadcrumbsInput {
  categoryPaths: ArticleCategoryNodeDto[][];
  brandName: string;
  articleNumber: string;
  /** The category the visitor drilled to reach the part, when they drilled one. */
  categoryNodeId?: string;
}

/**
 * The trail from the catalogue root down to the part on screen.
 *
 * Only the home crumb links anywhere. Nothing yet serves a category on its own
 * — `/search` needs a query and there is no catalogue page — and a crumb whose
 * link lands on an empty state is worse than one that is plainly text.
 */
export function buildArticleBreadcrumbs({
  categoryPaths,
  brandName,
  articleNumber,
  categoryNodeId,
}: ArticleBreadcrumbsInput): BreadcrumbItem[] {
  const categoryPath = selectArticleCategoryPath(categoryPaths, categoryNodeId);

  return markLastAsCurrent([
    HOME_CRUMB,
    { key: "all-categories", label: ALL_CATEGORIES_LABEL },
    ...categoryPath.map((node) => ({
      key: `category-${node.id}`,
      label: node.label,
    })),
    { key: "article", label: `${brandName} ${articleNumber}` },
  ]);
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
