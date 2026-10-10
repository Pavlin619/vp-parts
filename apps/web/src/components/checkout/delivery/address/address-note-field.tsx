import { useId } from "react";
import { cn } from "@/lib/utils";

interface AddressNoteFieldProps {
  label: string;
  value: string;
  maxLength: number;
  onValueChange: (value: string) => void;
  className?: string;
}

/** A free-text box with a count, for what the customer wants the courier to know. */
export function AddressNoteField({
  label,
  value,
  maxLength,
  onValueChange,
  className,
}: AddressNoteFieldProps) {
  const inputId = useId();

  return (
    <div className={cn("flex min-w-0 flex-col gap-[5px]", className)}>
      <label htmlFor={inputId} className="flex justify-between gap-2 text-[12px] font-semibold text-ink-2">
        {label}
        <span className="font-medium text-ink-4">по желание</span>
      </label>
      <textarea
        id={inputId}
        value={value}
        maxLength={maxLength}
        rows={2}
        placeholder="Звънец, код на входа, удобно време…"
        onChange={(event) => onValueChange(event.target.value)}
        className="min-h-16 w-full resize-y rounded-lg border border-line bg-bg-card px-3 py-2.5 text-[13.5px] text-ink placeholder:text-ink-4 focus:border-ink focus:outline-none focus:ring-[3px] focus:ring-ink/5"
      />
      <span className="self-end text-[11px] text-ink-4">
        {value.length}/{maxLength}
      </span>
    </div>
  );
}
