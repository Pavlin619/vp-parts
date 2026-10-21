import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { formatPrice } from "@vp-parts-shop/shared";
import type { PlaceOrderFailure } from "@/lib/checkout/place-order";

const FAILURE_COPY: Record<Exclude<PlaceOrderFailure["kind"], "price-changed">, string> = {
  "cart-stale": "Кошницата беше променена междувременно. Прегледайте поръчката и опитайте отново.",
  unavailable: "Някои от артикулите вече не могат да бъдат поръчани в това количество.",
  "details-required": "Попълнете данните за контакт, за да поръчате.",
  delivery: "Куриерът не може да достави на избраното място. Изберете друг офис или адрес.",
  "rate-limited": "Твърде много опити. Изчакайте минута и опитайте отново.",
  "bot-check": "Проверката за сигурност не беше приета. Опитайте отново.",
  retry: "Поръчката не беше изпратена заради временен проблем. Опитайте отново.",
};

interface PlaceOrderFailureNoticeProps {
  failure: PlaceOrderFailure;
  /** The total the summary shows now; null while it is read again. */
  currentTotal: number | null;
}

/** Why the order was refused, said where the customer just clicked. */
export function PlaceOrderFailureNotice({ failure, currentTotal }: PlaceOrderFailureNoticeProps) {
  return (
    <p
      role="alert"
      className="mt-3 flex items-start gap-[7px] rounded-[10px] bg-bg-sunken px-3 py-2.5 text-[12px] leading-[1.45] text-danger"
    >
      <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>
        {failure.kind === "price-changed" ? (
          <PriceChangedText shownTotal={failure.shownTotal} currentTotal={currentTotal} />
        ) : (
          FAILURE_COPY[failure.kind]
        )}
        {failure.kind === "unavailable" && (
          <>
            {" "}
            <Link href="/cart" className="font-semibold underline underline-offset-2">
              Прегледайте кошницата
            </Link>
          </>
        )}
      </span>
    </p>
  );
}

function PriceChangedText({
  shownTotal,
  currentTotal,
}: {
  shownTotal: number;
  currentTotal: number | null;
}) {
  const hasNewTotal = currentTotal !== null && currentTotal !== shownTotal;

  return (
    <>
      Цената на поръчката е променена
      {hasNewTotal && ` от ${formatPrice(shownTotal)} на ${formatPrice(currentTotal)}`}.
      Прегледайте я и потвърдете отново.
    </>
  );
}
