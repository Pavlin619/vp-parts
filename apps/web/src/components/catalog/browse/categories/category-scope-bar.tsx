import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CATALOG_PATH } from "@/lib/catalog/catalog-url";
import { plural } from "@/lib/utils";

interface CategoryScopeBarProps {
  /** The roots the car's tree has — what dropping the narrowing goes back to. */
  rootCount: number;
}

/**
 * The way out of a catalogue narrowed to one category.
 *
 * The only element the narrowed page adds. Without it a visitor who arrived
 * from a homepage tile sees one card and no sign the catalogue holds anything
 * else; with it, the full grid is one click away on the same screen.
 */
export function CategoryScopeBar({ rootCount }: CategoryScopeBarProps) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2">
      <Link
        href={CATALOG_PATH}
        className="inline-flex items-center gap-1.5 rounded-full border border-line bg-bg-card py-1.5 pl-2.5 pr-3.5 text-[12.5px] font-medium text-ink-2 transition-colors hover:border-ink hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Всички категории
      </Link>

      <span className="text-[12.5px] text-ink-4">
        {rootCount} {plural(rootCount, "категория", "категории")} в каталога
      </span>
    </div>
  );
}
