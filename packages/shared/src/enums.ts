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

/**
 * Availability of an article, derived from the fastest delivery option across
 * our own stock and supplier stock. Ordered from fastest to slowest so the
 * frontend can present a precise delivery expectation to the customer:
 * - IN_STOCK            — we physically hold it (ships immediately)
 * - DELIVERY_WITHIN_HOUR — a local warehouse can deliver within the hour
 * - DELIVERY_SAME_DAY   — delivered today (ordered before the daily cut-off)
 * - DELIVERY_NEXT_DAY   — delivered the next business day
 * - DELIVERY_IN_2_DAYS  — delivered within two business days
 * - DELIVERY_IN_3_DAYS  — delivered within three business days
 * - OUT_OF_STOCK        — no stock anywhere
 */
export enum StockStatus {
  IN_STOCK = 'IN_STOCK',
  DELIVERY_WITHIN_HOUR = 'DELIVERY_WITHIN_HOUR',
  DELIVERY_SAME_DAY = 'DELIVERY_SAME_DAY',
  DELIVERY_NEXT_DAY = 'DELIVERY_NEXT_DAY',
  DELIVERY_IN_2_DAYS = 'DELIVERY_IN_2_DAYS',
  DELIVERY_IN_3_DAYS = 'DELIVERY_IN_3_DAYS',
  OUT_OF_STOCK = 'OUT_OF_STOCK',
}
