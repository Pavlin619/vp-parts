import {
  DeliveryMethod,
  OrderStatus,
  PaymentMethod,
  ShippingMethod,
} from '../enums';
import type { DeliveryAddressDto, DeliveryOfficeHoursDto } from './delivery.dto';
import type { ArticleIdentityDto } from './inventory.dto';

/**
 * An order's money, every amount in EUR cents including VAT. The total is an
 * exact sum; only its split into net and VAT is rounded — see docs/ORDERS.md → "Money".
 */
export interface OrderMoneyDto {
  goodsTotal: number;
  deliveryPrice: number;
  cashOnDeliveryFee: number;
  total: number;
  netAmount: number;
  vatAmount: number;
}

export type PlaceOrderDeliveryDto =
  | {
      method: DeliveryMethod.COURIER_OFFICE;
      carrier: ShippingMethod;
      officeCode: string;
    }
  | {
      method: DeliveryMethod.COURIER_ADDRESS;
      carrier: ShippingMethod;
      address: DeliveryAddressDto;
    }
  | { method: DeliveryMethod.STORE_PICKUP };

/**
 * No lines, weights or prices: the server reads those itself and refuses the
 * order when they are not what the customer was shown.
 */
export interface PlaceOrderRequestDto {
  cartId: string;
  /** The cart version the checkout page priced. */
  cartVersion: number;
  /** The total the checkout summary showed. */
  expectedTotalCents: number;
  /** Card is for signed-in customers only; a card order waits for its payment. */
  paymentMethod: PaymentMethod.CASH_ON_DELIVERY | PaymentMethod.CARD;
  delivery: PlaceOrderDeliveryDto;
}

/** All a quick order knows a guest by. The office calls the phone to confirm it. */
export interface QuickOrderContactDto {
  firstName: string;
  lastName: string;
  phoneNumber: string;
  email?: string;
}

/** A guest's order of the cart their device holds, owned through the cart token. */
export interface QuickOrderRequestDto extends PlaceOrderRequestDto {
  /** The office confirms a quick order by phone, and it is paid at the door. */
  paymentMethod: PaymentMethod.CASH_ON_DELIVERY;
  contact: QuickOrderContactDto;
  /** The Turnstile widget's token. The server spends it, so a refused order needs a fresh one. */
  botCheckToken: string;
}

export interface PlaceOrderResponseDto {
  orderId: string;
  orderReference: string;
}

export interface QuickOrderResponseDto extends PlaceOrderResponseDto {
  /** Reads the order back with no account; see `ORDER_KEY_HEADER`. */
  accessKey: string;
}

/** What the payment widget is started with, for a card order's open session. */
export interface OrderPaymentSessionDto {
  cashierKey: string;
  cashierToken: string;
  /** When the session ends; an order still unpaid then is cancelled. */
  expiresAt: string;
}

export interface OrderListItemDto {
  orderId: string;
  orderReference: string;
  createdAt: string;
  itemCount: number;
  totalIncVat: number;
  status: OrderStatus;
}

export interface OrderListResponseDto {
  total: number;
  orders: OrderListItemDto[];
}

export interface OrderItemDto extends ArticleIdentityDto {
  brandName: string;
  description: string;
  thumbnailUrl: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface OrderStatusHistoryEntryDto {
  status: OrderStatus;
  occurredAt: string;
}

export interface OrderOfficeDto {
  code: string;
  name: string;
  address: string;
  weekdayHours: DeliveryOfficeHoursDto | null;
  saturdayHours: DeliveryOfficeHoursDto | null;
}

/** The address as the customer gave it, named as well as located. */
export interface OrderAddressDto extends DeliveryAddressDto {
  city: string;
  postCode: string;
}

export type OrderDeliveryDto =
  | {
      method: DeliveryMethod.COURIER_OFFICE;
      carrier: ShippingMethod;
      office: OrderOfficeDto;
      expectedDeliveryDate: string | null;
    }
  | {
      method: DeliveryMethod.COURIER_ADDRESS;
      carrier: ShippingMethod;
      address: OrderAddressDto;
      expectedDeliveryDate: string | null;
    }
  | {
      method: DeliveryMethod.STORE_PICKUP;
      expectedDeliveryDate: string | null;
    };

export interface OrderContactDto {
  firstName: string;
  lastName: string;
  phoneNumber: string;
  /** Null when a guest ordered with a name and a phone only. */
  email: string | null;
}

export interface OrderDetailDto extends OrderMoneyDto {
  orderId: string;
  orderReference: string;
  status: OrderStatus;
  createdAt: string;
  items: OrderItemDto[];
  delivery: OrderDeliveryDto;
  paymentMethod: PaymentMethod;
  contact: OrderContactDto;
  statusHistory: OrderStatusHistoryEntryDto[];
}

export interface OrderStatusSseEventDto {
  orderId: string;
  status: OrderStatus;
  occurredAt: string;
}
