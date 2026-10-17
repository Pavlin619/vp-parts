import type { OrderMoneyDto } from '@vp-parts-shop/shared';

export interface OrderMoneyLine {
  /** Gross EUR cents, including VAT. */
  unitPrice: number;
  quantity: number;
}

export interface OrderMoneyInput {
  lines: OrderMoneyLine[];
  deliveryPrice: number;
  cashOnDeliveryFee: number;
}

/**
 * The one place an order's total and VAT are computed — docs/ORDERS.md → "Money".
 * Never derive a total from net prices or add VAT onto one.
 */
export function orderMoney(
  { lines, deliveryPrice, cashOnDeliveryFee }: OrderMoneyInput,
  vatRate: number,
): OrderMoneyDto {
  const goodsTotal = lines.reduce(
    (sum, { unitPrice, quantity }) => sum + unitPrice * quantity,
    0,
  );
  const total = goodsTotal + deliveryPrice + cashOnDeliveryFee;

  const netAmount = Math.round(total / (1 + vatRate));

  return {
    goodsTotal,
    deliveryPrice,
    cashOnDeliveryFee,
    total,
    netAmount,
    vatAmount: total - netAmount,
  };
}
