"use client";

import { cn } from "@/lib/utils";

interface ErrorStateProps {
  message: string;
  onRetry: () => void;
  variant?: "card" | "inline";
  className?: string;
}

export function ErrorState({
  message,
  onRetry,
  variant = "card",
  className,
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-4",
        variant === "card" && "justify-center min-h-[40vh] p-8",
        variant === "inline" && "py-4",
        className,
      )}
    >
      <p className="text-muted text-sm text-center">{message}</p>
      <button
        onClick={onRetry}
        className="h-10 px-4 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors"
      >
        Опитай отново
      </button>
    </div>
  );
}
