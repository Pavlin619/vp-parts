import { OrderStatus, ShippingMethod, PaymentMethod } from '../enums';

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

export interface OrderItemDto {
  articleNumber: string;
  brandName: string;
  description: string;
  quantity: number;
  unitPriceIncVat: number;
  lineTotalIncVat: number;
}

export interface OrderStatusHistoryEntryDto {
  status: OrderStatus;
  occurredAt: string;
}

export interface DeliveryAddressSnapshotDto {
  fullName: string;
  city: string;
  postcode: string;
  street: string;
  streetNumber: string;
  apartment?: string;
  phoneNumber: string;
}

export interface OrderDetailDto {
  orderId: string;
  orderReference: string;
  status: OrderStatus;
  createdAt: string;
  items: OrderItemDto[];
  deliveryAddress: DeliveryAddressSnapshotDto;
  shippingMethod: ShippingMethod;
  shippingCostIncVat: number;
  subtotalExVat: number;
  vatAmount: number;
  totalIncVat: number;
  paymentMethod: PaymentMethod;
  courierName: string | null;
  trackingReference: string | null;
  vehicleTag: string | null;
  jobReference: string | null;
  statusHistory: OrderStatusHistoryEntryDto[];
}

export interface OrderStatusSseEventDto {
  orderId: string;
  status: OrderStatus;
  occurredAt: string;
}

// AvailabilityDto is the canonical live price/availability contract and lives in
// dto/inventory.dto.ts (it is a superset: nullable prices + optional trade fields).
