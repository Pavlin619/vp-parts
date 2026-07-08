interface UnavailableNoticeProps {
  hasPrice: boolean;
}

/**
 * Shown when the part cannot be delivered. The delivery module and purchase
 * actions are hidden by the caller — we can't fulfil the order in either case.
 * The wording adapts to what we know: a part we normally carry but is out of
 * stock reads "Изчерпан"; a part we have no pricing/stock data for reads
 * "Не е наличен", since we can't claim it is merely sold out.
 */
export function UnavailableNotice({ hasPrice }: UnavailableNoticeProps) {
  const label = hasPrice ? "Изчерпан" : "Не е наличен";

  return (
    <p
      className="flex items-center gap-2 text-sm font-medium text-danger"
      aria-label={label}
    >
      <span className="h-2 w-2 rounded-full bg-danger" aria-hidden="true" />
      {label}
    </p>
  );
}
