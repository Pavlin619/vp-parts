import { X } from "lucide-react";
import type { ReactNode } from "react";
import { DeliveryOfficeType } from "@vp-parts-shop/shared";
import type { OfficeSearch, OfficeTypeFilter } from "@/lib/checkout/delivery/office-search";
import { cn } from "@/lib/utils";

const TYPE_FILTERS: { value: OfficeTypeFilter; label: string }[] = [
  { value: "ALL", label: "Всички" },
  { value: DeliveryOfficeType.OFFICE, label: "Офиси" },
  { value: DeliveryOfficeType.LOCKER, label: "Автомати" },
];

interface OfficeFiltersProps {
  search: OfficeSearch;
  onSearchChange: (search: OfficeSearch) => void;
}

export function OfficeFilters({ search, onSearchChange }: OfficeFiltersProps) {
  const update = (change: Partial<OfficeSearch>) => onSearchChange({ ...search, ...change });

  return (
    <div className="flex flex-wrap gap-1.5">
      {search.city && (
        <FilterChip
          isOn
          onClick={() => update({ city: null })}
          ariaLabel={`Премахни града ${search.city}`}
        >
          {search.city}
          <X className="h-3 w-3" aria-hidden="true" />
        </FilterChip>
      )}

      {TYPE_FILTERS.map((filter) => (
        <FilterChip
          key={filter.value}
          isOn={search.type === filter.value}
          onClick={() => update({ type: filter.value })}
        >
          {filter.label}
        </FilterChip>
      ))}
    </div>
  );
}

interface FilterChipProps {
  isOn: boolean;
  onClick: () => void;
  ariaLabel?: string;
  children: ReactNode;
}

function FilterChip({ isOn, onClick, ariaLabel, children }: FilterChipProps) {
  return (
    <button
      type="button"
      aria-pressed={isOn}
      aria-label={ariaLabel}
      onClick={onClick}
      className={cn(
        "inline-flex h-[26px] items-center gap-1 rounded-full bg-bg-sunken px-[11px] text-[11.5px] font-semibold text-ink-3 transition-colors hover:text-ink",
        isOn && "bg-ink text-white hover:text-white",
      )}
    >
      {children}
    </button>
  );
}
