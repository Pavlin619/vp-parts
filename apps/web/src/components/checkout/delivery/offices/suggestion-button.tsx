import type { ReactNode } from "react";

interface SuggestionButtonProps {
  children: ReactNode;
  onClick: () => void;
}

/** One entry in a search box's suggestions. */
export function SuggestionButton({ children, onClick }: SuggestionButtonProps) {
  return (
    <button
      type="button"
      // Safari does not focus a clicked button, so the search box's blur would close
      // the list before the click lands; keeping focus in the box lets it through.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className="flex min-h-10 items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] text-ink hover:bg-canvas focus-visible:bg-canvas focus-visible:outline-none"
    >
      {children}
    </button>
  );
}
