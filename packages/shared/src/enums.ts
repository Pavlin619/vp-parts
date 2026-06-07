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

export enum PaymentMethod {
  MYPOS = 'MYPOS',
  CASH_ON_DELIVERY = 'CASH_ON_DELIVERY',
}
