"use client";

import { Checkbox } from "@/components/common/checkbox";
import { cn } from "@/lib/utils";

interface CartListHeaderProps {
  areAllSelected: boolean;
  areSomeSelected: boolean;
  onToggleAll: (isSelected: boolean) => void;
}

/**
 * The row above the cart list: the select-all box, and — only where the lines
 * actually lay out as a table — the column names.
 *
 * Below `--container-cart-wide` every cell carries its own label, so the names
 * here would repeat them; the select-all stays, with a label of its own since
 * it has no column to sit under.
 *
 * The track list is duplicated from {@link CartRow} rather than shared through
 * a variable: a heading and a line are two grids, and only identical
 * `grid-template-columns` make them read as one table.
 */
export function CartListHeader({
  areAllSelected,
  areSomeSelected,
  onToggleAll,
}: CartListHeaderProps) {
  return (
    <div className="flex items-center gap-3 px-[17px] pb-2 @cart-wide:grid @cart-wide:grid-cols-[18px_44px_minmax(120px,1fr)_68px_150px_84px_84px_104px_24px] @cart-wide:items-end @cart-wide:gap-x-3">
      <Checkbox
        checked={areAllSelected}
        indeterminate={!areAllSelected && areSomeSelected}
        onChange={onToggleAll}
        label="Избери всички артикули"
        className="@cart-wide:mb-px"
      />

      <span className="text-[11.5px] text-ink-3 @cart-wide:hidden">
        Избери всички
      </span>

      <ColumnName className="@cart-wide:col-span-3">Артикул</ColumnName>
      <ColumnName>Доставка</ColumnName>
      <ColumnName>Количество</ColumnName>
      <ColumnName className="@cart-wide:text-right">Ед. цена</ColumnName>
      <ColumnName className="@cart-wide:text-right">Общо с ДДС</ColumnName>
    </div>
  );
}

function ColumnName({
  className,
  children,
}: {
  className?: string;
  children: string;
}) {
  return (
    <span
      className={cn(
        "hidden text-[9.5px] font-semibold uppercase tracking-[0.05em] text-ink-4 @cart-wide:block",
        className,
      )}
    >
      {children}
    </span>
  );
}
