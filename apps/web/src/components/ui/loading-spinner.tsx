import { cn } from "@/lib/utils";

interface LoadingSpinnerProps {
  className?: string;
  fullPage?: boolean;
}

export function LoadingSpinner({ className, fullPage = false }: LoadingSpinnerProps) {
  const spinner = (
    <div
      className={cn(
        "w-8 h-8 border-2 border-line border-t-accent rounded-full animate-spin",
        className,
      )}
      role="status"
      aria-label="Зареждане..."
    />
  );

  if (!fullPage) return spinner;

  return (
    <div className="flex items-center justify-center min-h-[40vh]">{spinner}</div>
  );
}
