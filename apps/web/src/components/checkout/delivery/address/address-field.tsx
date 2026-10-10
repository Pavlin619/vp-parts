import { useId, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface AddressFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "id"> {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  isOptional?: boolean;
  error?: string;
  className?: string;
}

export function AddressField({
  label,
  value,
  onValueChange,
  isOptional = false,
  error,
  className,
  ...inputProps
}: AddressFieldProps) {
  const inputId = useId();
  const errorId = useId();

  return (
    <div className={cn("flex min-w-0 flex-col gap-[5px]", className)}>
      <label
        htmlFor={inputId}
        className="flex justify-between gap-2 text-[12px] font-semibold text-ink-2"
      >
        {label}
        {isOptional && <span className="font-medium text-ink-4">по желание</span>}
      </label>
      <input
        {...inputProps}
        id={inputId}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => onValueChange(event.target.value)}
        className={cn(
          "h-[42px] w-full rounded-lg border border-line bg-bg-card px-3 text-[13.5px] text-ink placeholder:text-ink-4 focus:border-ink focus:outline-none focus:ring-[3px] focus:ring-ink/5",
          error && "border-danger",
        )}
      />
      {error && (
        <span id={errorId} className="text-[11.5px] text-danger">
          {error}
        </span>
      )}
    </div>
  );
}
