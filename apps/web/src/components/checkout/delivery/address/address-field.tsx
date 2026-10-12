import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface AddressFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "id"> {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  isOptional?: boolean;
  /** Names offered while typing; anything else typed is still accepted. */
  suggestions?: string[];
  error?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function AddressField({
  label,
  value,
  onValueChange,
  isOptional = false,
  suggestions,
  error,
  icon,
  action,
  className,
  ...inputProps
}: AddressFieldProps) {
  const inputId = useId();
  const errorId = useId();
  const suggestionsId = useId();

  return (
    <div className={cn("flex min-w-0 flex-col gap-[5px]", className)}>
      <label
        htmlFor={inputId}
        className="flex justify-between gap-2 text-[12px] font-semibold text-ink-2"
      >
        {label}
        {isOptional && <span className="font-medium text-ink-4">по желание</span>}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          {icon && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3 [&_svg]:h-4 [&_svg]:w-4"
            >
              {icon}
            </span>
          )}
          <input
            {...inputProps}
            id={inputId}
            value={value}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            list={suggestions?.length ? suggestionsId : undefined}
            onChange={(event) => onValueChange(event.target.value)}
            className={cn(
              "h-[42px] w-full rounded-lg border border-line bg-bg-card px-3 text-[13.5px] text-ink placeholder:text-ink-4 focus:border-ink focus:outline-none focus:ring-[3px] focus:ring-ink/5",
              icon && "pl-9",
              error && "border-danger",
            )}
          />
        </div>
        {action}
      </div>
      {suggestions && (
        <datalist id={suggestionsId}>
          {suggestions.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      )}
      {error && (
        <span id={errorId} className="text-[11.5px] text-danger">
          {error}
        </span>
      )}
    </div>
  );
}
