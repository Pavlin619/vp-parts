import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type {
  CategoryNavigationDto,
  CategoryOptionDto,
  FacetValueDto,
} from "@vp-parts-shop/shared";
import {
  buildSearchUrl,
  categoryUp,
  clearCategory,
  clearProductType,
  drillIntoCategory,
  selectProductType,
  type SearchUrlState,
} from "@/lib/catalog/search-url";

interface CategoryFilterProps {
  state: SearchUrlState;
  navigation?: CategoryNavigationDto;
  productTypes?: FacetValueDto[];
}

/** One selectable row of the drill, whichever level it came from. */
interface DrillRow {
  id: string;
  label: string;
  count: number | null;
  href: string;
  hasChildren: boolean;
}

/**
 * The single narrowing path through TecDoc's product tree: assembly groups
 * while the tree still branches, then the generic articles beneath the leaf —
 * "Маслен филтър", "Корпус, маслен филтър" and so on, which is where a leaf
 * assembly group stops being one kind of part. Both levels are a descent
 * rather than a filter, so they share one block and one "up" trail.
 *
 * The API returns a single level at a time and no breadcrumb, so the path back
 * up lives in the URL (see `categoryPath`) and is walked one step at a time.
 */
export function CategoryFilter({
  state,
  navigation,
  productTypes = [],
}: CategoryFilterProps) {
  const categoryOptions = navigation?.options ?? [];
  const isAtProductTypes = showsProductTypes(state, categoryOptions, productTypes);
  const rows = isAtProductTypes
    ? productTypeRows(state, productTypes)
    : categoryRows(state, categoryOptions);

  const isDrilled =
    state.categoryPath.length > 0 || state.productTypeId !== undefined;

  if (!isDrilled && rows.length === 0) {
    return null;
  }

  const selectedType = productTypes.find(
    (value) => value.id === state.productTypeId,
  );
  const current = selectedType ?? navigation?.current ?? null;

  return (
    <section className="rounded-md border border-line bg-bg-card p-4">
      <div className="mb-3.5 flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold text-ink">
          {isAtProductTypes ? "Вид част" : "Категории"}
        </h2>
        {isDrilled && (
          <Link
            href={buildSearchUrl(clearCategory(state))}
            prefetch={false}
            className="text-xs text-ink-3 transition-colors hover:text-brand"
          >
            Изчисти
          </Link>
        )}
      </div>

      {isDrilled && (
        <div className="mb-2 border-b border-line pb-2">
          <Link
            href={buildSearchUrl(upFrom(state))}
            prefetch={false}
            className="flex items-center gap-1.5 rounded-sm px-2 py-1.5 text-xs text-ink-3 transition-colors hover:bg-canvas hover:text-ink"
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
            {drillDepth(state) > 1 ? "Едно ниво нагоре" : "Всички категории"}
          </Link>

          {current && (
            <p className="mt-1 flex items-center justify-between gap-2 px-2 py-1 text-[13px] font-medium text-ink">
              <span>{current.label}</span>
              {current.count !== null && (
                <span className="font-display text-xs text-ink-4">
                  {current.count}
                </span>
              )}
            </p>
          )}
        </div>
      )}

      {rows.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                href={row.href}
                prefetch={false}
                className="flex items-center gap-2 rounded-sm px-2 py-[7px] text-[13px] text-ink-2 transition-colors hover:bg-canvas hover:text-ink"
              >
                <span className="flex-1">{row.label}</span>
                {row.count !== null && (
                  <span className="font-display text-xs text-ink-4">
                    {row.count}
                  </span>
                )}
                {row.hasChildren && (
                  <ChevronRight
                    className="h-3.5 w-3.5 shrink-0 text-ink-4"
                    aria-hidden="true"
                  />
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {rows.length === 0 && state.productTypeId === undefined && (
        <p className="px-2 text-xs text-ink-3">
          Няма по-подробни подкатегории.
        </p>
      )}
    </section>
  );
}

/**
 * The generic articles take over once the assembly-group tree runs out, which
 * is normally at a leaf but also covers a search whose results carry no
 * category counts at all — there the product type is the only descent on offer
 * and hiding it behind a tree that never appears would strand the visitor.
 */
function showsProductTypes(
  state: SearchUrlState,
  categoryOptions: CategoryOptionDto[],
  productTypes: FacetValueDto[],
): boolean {
  if (categoryOptions.length > 0) {
    return false;
  }

  return productTypes.length > 0 || state.productTypeId !== undefined;
}

function categoryRows(
  state: SearchUrlState,
  options: CategoryOptionDto[],
): DrillRow[] {
  return options.map((option) => ({
    id: option.id,
    label: option.label,
    count: option.count,
    href: buildSearchUrl(drillIntoCategory(state, option)),
    hasChildren: option.hasChildren,
  }));
}

/** Nothing is left to offer once a type is picked: it is the deepest level. */
function productTypeRows(
  state: SearchUrlState,
  productTypes: FacetValueDto[],
): DrillRow[] {
  if (state.productTypeId !== undefined) {
    return [];
  }

  return productTypes.map((value) => ({
    id: value.id,
    label: value.label,
    count: value.count,
    href: buildSearchUrl(selectProductType(state, value.id)),
    hasChildren: false,
  }));
}

function drillDepth(state: SearchUrlState): number {
  return state.categoryPath.length + (state.productTypeId ? 1 : 0);
}

function upFrom(state: SearchUrlState): SearchUrlState {
  return state.productTypeId !== undefined
    ? clearProductType(state)
    : categoryUp(state);
}
