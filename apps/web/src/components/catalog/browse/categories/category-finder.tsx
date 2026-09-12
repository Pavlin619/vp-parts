"use client";

import { Search, X } from "lucide-react";

interface CategoryFinderProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * Finds a category by name anywhere in the tree.
 *
 * The grid opens one level at a time, which is the only way four levels and
 * hundreds of nodes stay readable — and it is also what makes a category three
 * levels down unfindable without knowing which root holds it. This is that way
 * in.
 */
export function CategoryFinder({ value, onChange }: CategoryFinderProps) {
  return (
    <div className="flex h-12 w-full items-center gap-2 rounded-full border border-line bg-bg-card pl-4 pr-1.5 transition-colors focus-within:border-ink sm:w-[360px]">
      <Search className="h-4 w-4 shrink-0 text-ink-3" aria-hidden="true" />

      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label="Търси категория"
        placeholder="Търси категория… накладки, филтър"
        className="h-full min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-4"
      />

      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Изчисти"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-3 transition-colors hover:bg-bg-sunken hover:text-ink"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
