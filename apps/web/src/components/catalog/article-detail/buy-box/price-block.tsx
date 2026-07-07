import { formatPrice } from "@vp-parts-shop/shared";

interface PriceBlockProps {
  priceIncVat: number;
  priceExVat: number | null;
}

/** VAT-inclusive headline price with the VAT-exclusive hint underneath. */
export function PriceBlock({ priceIncVat, priceExVat }: PriceBlockProps) {
  return (
    <div className="flex flex-col gap-1">
      <p className="font-display text-3xl font-semibold leading-none tabular-nums text-ink">
        {formatPrice(priceIncVat)}
      </p>

      <p className="text-xs text-muted">
        с ДДС
        {priceExVat != null && (
          <span className="tabular-nums">
            {" · без ДДС "}
            {formatPrice(priceExVat)}
          </span>
        )}
      </p>
    </div>
  );
}
