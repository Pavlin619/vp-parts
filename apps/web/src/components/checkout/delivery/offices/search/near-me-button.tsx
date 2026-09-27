import { Loader2, LocateFixed } from "lucide-react";
import { cn } from "@/lib/utils";

interface NearMeButtonProps {
  isLocating: boolean;
  onClick: () => void;
}

export function NearMeButton({ isLocating, onClick }: NearMeButtonProps) {
  const Icon = isLocating ? Loader2 : LocateFixed;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isLocating}
      aria-busy={isLocating}
      className="inline-flex h-[42px] shrink-0 items-center gap-1.5 rounded-lg border border-line bg-bg-card px-3 text-[12.5px] font-semibold text-ink transition-colors hover:border-ink-3 focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-wait disabled:opacity-70"
    >
      <Icon className={cn("h-4 w-4", isLocating && "animate-spin")} aria-hidden="true" />
      Близо до мен
    </button>
  );
}
