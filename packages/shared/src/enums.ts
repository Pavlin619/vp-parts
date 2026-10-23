export enum CustomerRole {
  CUSTOMER = 'CUSTOMER',
  MECHANIC = 'MECHANIC',
}

export enum MechanicApprovalStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export enum OrderStatus {
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  AWAITING_CONFIRMATION = 'AWAITING_CONFIRMATION',
  PROCESSING = 'PROCESSING',
  ITEMS_PREPARED = 'ITEMS_PREPARED',
  ON_THE_WAY = 'ON_THE_WAY',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
  FULFILLMENT_FAILED = 'FULFILLMENT_FAILED',
}

export enum ShippingMethod {
  ECONT = 'ECONT',
  SPEEDY = 'SPEEDY',
}

export enum DeliveryMethod {
  COURIER_OFFICE = 'COURIER_OFFICE',
  COURIER_ADDRESS = 'COURIER_ADDRESS',
  STORE_PICKUP = 'STORE_PICKUP',
}

export enum PaymentMethod {
  CARD = 'CARD',
  CASH_ON_DELIVERY = 'CASH_ON_DELIVERY',
}

/**
 * The suppliers we read stock from. Mirrors the backoffice `SupplierSource`
 * enum — the constant name is the value stored in `supplier_stock.supplier_source`.
 */
export enum Supplier {
  INTERCARS = 'INTERCARS',
  AUTOPLUS = 'AUTOPLUS',
  AUTO1 = 'AUTO1',
  AUTOKOMERS = 'AUTOKOMERS',
}
