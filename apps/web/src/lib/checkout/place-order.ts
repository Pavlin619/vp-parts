import {
  AppErrorCode,
  DeliveryMethod as OrderDeliveryMethod,
  PaymentMethod,
  type DeliveryAddressDto,
  type PlaceOrderDeliveryDto,
  type PlaceOrderRequestDto,
  type QuickOrderContactDto,
  type QuickOrderRequestDto,
} from "@vp-parts-shop/shared";
import { ApiError } from "@/lib/api";
import { CHECKOUT_CARRIER, type DeliveryMethod } from "./delivery/delivery-methods";
import type { SummaryMoney } from "./delivery/delivery-summary";

export interface PlaceOrderInput {
  cartId: string;
  /** The version the browser holds now; money priced for another is not this cart's total. */
  cartVersion: number;
  method: DeliveryMethod | null;
  officeCode: string | null;
  /** The accepted address, note included: the courier reads it from the order. */
  address: DeliveryAddressDto | null;
  paymentMethod: PaymentMethod | null;
  /** The money the summary shows; null until it is read. */
  money: SummaryMoney | null;
  /** Who the order is for is known: a complete profile, or a quick order's valid contact. */
  isContactComplete: boolean;
  /** Live availability has loaded and no selected line is blocked or unpriced. */
  areLinesOrderable: boolean;
}

/** Where the customer acts on a refused order — docs/ORDERS.md → "Refusals". */
export type PlaceOrderFailure =
  | { kind: "price-changed"; shownTotal: number }
  | { kind: "cart-stale" }
  | { kind: "unavailable" }
  | { kind: "details-required" }
  | { kind: "delivery" }
  | { kind: "rate-limited" }
  | { kind: "bot-check" }
  | { kind: "retry" };

const FAILURE_KINDS: Partial<Record<string, PlaceOrderFailure["kind"]>> = {
  [AppErrorCode.PRICE_CHANGED]: "price-changed",
  [AppErrorCode.CART_STALE]: "cart-stale",
  [AppErrorCode.CART_EMPTY]: "cart-stale",
  [AppErrorCode.NOT_FOUND]: "cart-stale",
  [AppErrorCode.ARTICLE_UNAVAILABLE]: "unavailable",
  [AppErrorCode.CUSTOMER_DETAILS_REQUIRED]: "details-required",
  [AppErrorCode.DELIVERY_OFFICE_NOT_FOUND]: "delivery",
  [AppErrorCode.DELIVERY_OFFICE_REFUSED]: "delivery",
  [AppErrorCode.DELIVERY_ADDRESS_REFUSED]: "delivery",
  [AppErrorCode.DELIVERY_ADDRESS_NOT_SERVED]: "delivery",
  [AppErrorCode.DELIVERY_LOCKER_INELIGIBLE]: "delivery",
  [AppErrorCode.RATE_LIMITED]: "rate-limited",
  [AppErrorCode.BOT_CHECK_FAILED]: "bot-check",
};

/** What a guest's quick order adds to the order the button would place. */
export interface QuickOrderGuest {
  /** Null while the contact form is not valid. */
  contact: QuickOrderContactDto | null;
  /** Null until the Turnstile widget hands over a fresh token. */
  botCheckToken: string | null;
}

/**
 * The order the button would place, or null while one cannot be: every choice
 * made, and a total on screen that is the whole order's for the cart as it
 * stands. The browser sends no
 * lines or prices; the total is what the server checks it against.
 */
export function placeOrderRequestOf(input: PlaceOrderInput): PlaceOrderRequestDto | null {
  const { cartId, cartVersion, paymentMethod, money, isContactComplete, areLinesOrderable } =
    input;
  const delivery = deliveryOf(input);

  const isReady =
    cartId !== "" &&
    paymentMethod === PaymentMethod.CASH_ON_DELIVERY &&
    money?.isDeliveryIncluded === true &&
    money.cartVersion === cartVersion &&
    isContactComplete &&
    areLinesOrderable;

  if (!isReady || delivery === null) {
    return null;
  }

  return {
    cartId,
    cartVersion: money.cartVersion,
    expectedTotalCents: money.total,
    paymentMethod,
    delivery,
  };
}

export function quickOrderRequestOf(
  order: PlaceOrderRequestDto | null,
  { contact, botCheckToken }: QuickOrderGuest,
): QuickOrderRequestDto | null {
  if (!order || !contact || !botCheckToken) {
    return null;
  }

  return { ...order, contact, botCheckToken };
}

export function placeOrderFailureOf(
  error: unknown,
  sent: PlaceOrderRequestDto,
): PlaceOrderFailure {
  const kind = error instanceof ApiError ? FAILURE_KINDS[error.errorCode] : undefined;

  if (kind === "price-changed") {
    return { kind, shownTotal: sent.expectedTotalCents };
  }

  return { kind: kind ?? "retry" };
}

/**
 * Whether a refusal still describes the order the button would place. A
 * delivery refusal is answered by choosing another office or address; the rest
 * stand until the next attempt, and a price change waits for the new total.
 */
export function isFailureCurrent(
  failure: PlaceOrderFailure,
  sent: PlaceOrderRequestDto,
  input: PlaceOrderInput,
): boolean {
  if (failure.kind !== "delivery") {
    return true;
  }

  return JSON.stringify(deliveryOf(input)) === JSON.stringify(sent.delivery);
}

function deliveryOf({
  method,
  officeCode,
  address,
}: PlaceOrderInput): PlaceOrderDeliveryDto | null {
  switch (method) {
    case "courier-office":
      return officeCode
        ? { method: OrderDeliveryMethod.COURIER_OFFICE, carrier: CHECKOUT_CARRIER, officeCode }
        : null;
    case "courier-address":
      return address
        ? { method: OrderDeliveryMethod.COURIER_ADDRESS, carrier: CHECKOUT_CARRIER, address }
        : null;
    case "store-pickup":
      return { method: OrderDeliveryMethod.STORE_PICKUP };
    case null:
      return null;
  }
}
