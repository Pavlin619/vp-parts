import {
  AppErrorCode,
  DeliveryDestinationType,
  type DeliveryDestinationDto,
  type DeliveryQuoteDto,
} from "@vp-parts-shop/shared";
import { ApiError } from "@/lib/api";
import type { DeliveryMethod } from "./delivery-methods";
import type { ParcelCheck } from "./office-availability";

/** What the order summary can say about delivery. */
export type DeliverySummary =
  | { kind: "not-quoted" }
  | { kind: "awaiting-method" }
  | { kind: "awaiting-office" }
  | { kind: "awaiting-address" }
  | { kind: "pending" }
  | { kind: "office-unusable" }
  | { kind: "address-unusable" }
  | { kind: "failed" }
  | { kind: "quoted"; priceIncVatCents: number; expectedDeliveryDate: string | null };

/** The slice of a query the summary reads; null when no quote was asked for. */
export interface QuoteState {
  data: DeliveryQuoteDto | undefined;
  error: Error | null;
  isPending: boolean;
}

interface DeliverySummaryInput {
  method: DeliveryMethod | null;
  /** Where the chosen method delivers to; null until the customer has picked it. */
  destination: DeliveryDestinationDto | null;
  parcelCheck: ParcelCheck;
  quote: QuoteState | null;
}

const OFFICE_UNUSABLE_CODES: readonly string[] = [
  AppErrorCode.DELIVERY_OFFICE_REFUSED,
  AppErrorCode.DELIVERY_LOCKER_INELIGIBLE,
  AppErrorCode.DELIVERY_OFFICE_NOT_FOUND,
];

const ADDRESS_UNUSABLE_CODES: readonly string[] = [
  AppErrorCode.DELIVERY_ADDRESS_REFUSED,
  AppErrorCode.DELIVERY_ADDRESS_NOT_SERVED,
];

const GRAMS_PER_KILOGRAM = 1000;

export function resolveDeliverySummary({
  method,
  destination,
  parcelCheck,
  quote,
}: DeliverySummaryInput): DeliverySummary {
  if (method === null) {
    return { kind: "awaiting-method" };
  }

  if (destination === null) {
    return { kind: method === "courier-office" ? "awaiting-office" : "awaiting-address" };
  }

  if (parcelCheck.state !== "ready") {
    return { kind: parcelCheck.state === "checking" ? "pending" : "failed" };
  }

  return summariseQuote(quote, destination.type);
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

function summariseQuote(
  quote: QuoteState | null,
  destinationType: DeliveryDestinationType,
): DeliverySummary {
  if (quote === null || quote.isPending) {
    return { kind: "pending" };
  }

  if (quote.data) {
    const { priceIncVatCents, expectedDeliveryDate } = quote.data;

    return { kind: "quoted", priceIncVatCents, expectedDeliveryDate };
  }

  return { kind: summariseQuoteError(quote.error, destinationType) };
}

function summariseQuoteError(
  error: Error | null,
  destinationType: DeliveryDestinationType,
): "office-unusable" | "address-unusable" | "failed" {
  if (!(error instanceof ApiError)) {
    return "failed";
  }

  if (OFFICE_UNUSABLE_CODES.includes(error.errorCode)) {
    return "office-unusable";
  }

  const isAddressProblem =
    destinationType === DeliveryDestinationType.ADDRESS &&
    ADDRESS_UNUSABLE_CODES.includes(error.errorCode);

  return isAddressProblem ? "address-unusable" : "failed";
}
