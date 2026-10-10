import { AppErrorCode, type DeliveryQuoteDto } from "@vp-parts-shop/shared";
import { ApiError } from "@/lib/api";
import type { DeliveryMethod } from "./delivery-methods";
import type { ParcelCheck } from "./office-availability";

/** What the order summary can say about delivery. */
export type DeliverySummary =
  | { kind: "not-quoted" }
  | { kind: "awaiting-office" }
  | { kind: "pending" }
  | { kind: "office-unusable" }
  | { kind: "failed" }
  | { kind: "quoted"; priceIncVatCents: number; expectedDeliveryDate: string | null };

/** The slice of a query the summary reads; null when no quote was asked for. */
export interface QuoteState {
  data: DeliveryQuoteDto | undefined;
  error: Error | null;
  isPending: boolean;
}

interface DeliverySummaryInput {
  method: DeliveryMethod;
  officeCode: string | null;
  parcelCheck: ParcelCheck;
  quote: QuoteState | null;
}

const OFFICE_UNUSABLE_CODES: readonly string[] = [
  AppErrorCode.DELIVERY_OFFICE_REFUSED,
  AppErrorCode.DELIVERY_LOCKER_INELIGIBLE,
  AppErrorCode.DELIVERY_OFFICE_NOT_FOUND,
];

const GRAMS_PER_KILOGRAM = 1000;

export function resolveDeliverySummary({
  method,
  officeCode,
  parcelCheck,
  quote,
}: DeliverySummaryInput): DeliverySummary {
  if (method !== "courier-office") {
    return { kind: "not-quoted" };
  }

  if (officeCode === null) {
    return { kind: "awaiting-office" };
  }

  if (parcelCheck.state !== "ready") {
    return { kind: parcelCheck.state === "checking" ? "pending" : "failed" };
  }

  return summariseQuote(quote);
}

/** Goods plus the delivery price, once there is one. */
export function summaryTotal(goodsIncVatCents: number, delivery: DeliverySummary): number {
  return delivery.kind === "quoted"
    ? goodsIncVatCents + delivery.priceIncVatCents
    : goodsIncVatCents;
}

/** "850 г" under a kilo, else kilograms with a decimal comma and no needless zeros. */
export function formatWeight(grams: number): string {
  if (grams < GRAMS_PER_KILOGRAM) {
    return `${grams} г`;
  }

  const kilograms = new Intl.NumberFormat("bg-BG", { maximumFractionDigits: 2 }).format(
    grams / GRAMS_PER_KILOGRAM,
  );

  return `${kilograms} кг`;
}

function summariseQuote(quote: QuoteState | null): DeliverySummary {
  if (quote === null || quote.isPending) {
    return { kind: "pending" };
  }

  if (quote.data) {
    const { priceIncVatCents, expectedDeliveryDate } = quote.data;

    return { kind: "quoted", priceIncVatCents, expectedDeliveryDate };
  }

  return { kind: summariseQuoteError(quote.error) };
}

function summariseQuoteError(error: Error | null): "office-unusable" | "failed" {
  if (!(error instanceof ApiError)) {
    return "failed";
  }

  return OFFICE_UNUSABLE_CODES.includes(error.errorCode) ? "office-unusable" : "failed";
}
