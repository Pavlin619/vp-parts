import type { CategoryScope } from "@/lib/catalog/categories/category-scope";

/**
 * Who the count in front of it belongs to.
 *
 * Every number on the catalogue is either one car's or the whole catalogue's,
 * and the two differ by more than a little — the A3's `филтър` holds 788
 * articles where the catalogue's holds far more — so a count with neither
 * behind it reads as the wrong one.
 */
export function ScopeNote({ scope }: { scope: CategoryScope | null }) {
  if (!scope) {
    return <>в каталога</>;
  }

  return (
    <>
      за <b className="font-medium text-ink">{scope.vehicleName}</b>
    </>
  );
}
