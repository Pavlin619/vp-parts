import { cn } from "@/lib/utils";

const ACTION = "h-12 rounded-[10px] px-6 text-[15px]";

export const PRIMARY_ACTION_CLASS = cn(ACTION, "bg-ink text-white hover:bg-ink/90");

export const SECONDARY_ACTION_CLASS = cn(
  ACTION,
  "border-line-2 bg-bg-card text-ink hover:bg-bg-sunken",
);
