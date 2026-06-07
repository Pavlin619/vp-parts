import { ShippingMethod, PaymentMethod } from '../enums';

export interface ConfirmedItemDto {
  articleNumber: string;
  confirmedPriceExVat: number;
  quantity: number;
}

export interface CheckoutConfirmResponseDto {
  confirmed: boolean;
  confirmedItems: ConfirmedItemDto[];
  subtotalExVat: number;
  vatAmount: number;
  totalIncVat: number;
}

export interface CreateOrderRequestDto {
  cartId: string;
  addressId: string;
  shippingMethod: ShippingMethod;
  paymentMethod: PaymentMethod;
  paymentReference?: string;
  vehicleTag?: string;
  jobReference?: string;
}

export interface CreateOrderResponseDto {
  orderId: string;
  orderReference: string;
  status: string;
}

export interface MyPosInitiateRequestDto {
  cartId: string;
  confirmedTotal: number;
}

export interface MyPosInitiateResponseDto {
  checkoutUrl: string;
}

export interface CodConfirmRequestDto {
  cartId: string;
  addressId: string;
  shippingMethod: ShippingMethod;
}

export interface CodConfirmResponseDto {
  orderId: string;
  orderReference: string;
}

export interface ShippingRateResponseDto {
  method: ShippingMethod;
  costIncVat: number;
  estimatedDeliveryDays: number;
}

export interface CheckoutConfigDto {
  codMaxOrderTotal: number;
  vatRate: number;
}
