import {
  AppErrorCode,
  DeliveryDestinationType,
  type DeliveryDestinationDto,
  type DeliveryQuoteDto,
  type OrderMoneyDto,
} from "@vp-parts-shop/shared";
import { ApiError } from "@/lib/api";
import type { CartTotals } from "@/lib/cart/cart-totals";
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
  | { kind: "pickup"; readyAt: string | null }
  | {
      kind: "quoted";
      priceIncVatCents: number;
      /** Null unless the courier collects the money on delivery. */
      cashOnDeliveryFeeIncVatCents: number | null;
      expectedDeliveryDate: string | null;
      /** The whole order's money with this delivery; null while a selected line cannot be ordered. */
      money: OrderMoneyDto | null;
    };

/** The money the summary shows. */
export interface SummaryMoney {
  netAmount: number;
  vatAmount: number;
  total: number;
  isDeliveryIncluded: boolean;
}

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
  /** When a store pickup is ready to collect (ISO UTC); null when we cannot promise it. */
  pickupReadyAt: string | null;
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
  pickupReadyAt,
}: DeliverySummaryInput): DeliverySummary {
  if (method === null) {
    return { kind: "awaiting-method" };
  }

  if (method === "store-pickup") {
    return { kind: "pickup", readyAt: pickupReadyAt };
  }

  if (destination === null) {
    return { kind: method === "courier-office" ? "awaiting-office" : "awaiting-address" };
  }

  if (parcelCheck.state !== "ready") {
    return { kind: parcelCheck.state === "checking" ? "pending" : "failed" };
  }

  return summariseQuote(quote, destination.type);
}

/**
 * The quote's money once a delivery is priced, else the goods alone. Never a
 * sum made here: the order is charged the quote's total, VAT on delivery included.
 */
export function summaryMoney(goods: CartTotals, delivery: DeliverySummary): SummaryMoney {
  if (delivery.kind === "quoted" && delivery.money) {
    const { netAmount, vatAmount, total } = delivery.money;

    return { netAmount, vatAmount, total, isDeliveryIncluded: true };
  }

  return {
    netAmount: goods.subtotalExVat,
    vatAmount: goods.vatAmount,
    total: goods.totalIncVat,
    isDeliveryIncluded: delivery.kind === "pickup",
  };
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
    const { priceIncVatCents, cashOnDeliveryFeeIncVatCents, expectedDeliveryDate, money } =
      quote.data;

    return {
      kind: "quoted",
      priceIncVatCents,
      cashOnDeliveryFeeIncVatCents,
      expectedDeliveryDate,
      money,
    };
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
