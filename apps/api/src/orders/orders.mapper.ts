import {
  DeliveryMethod,
  OrderAddressDto,
  OrderDeliveryDto,
  OrderDetailDto,
  OrderItemDto,
  OrderOfficeDto,
  OrderStatus,
  PaymentMethod,
  ShippingMethod,
} from '@vp-parts-shop/shared';
import type { OrderRecord } from './orders.repository';

/** `deliverySnapshot` as `OrdersRepository.place` writes it; empty for pickup. */
interface DeliverySnapshot {
  office?: OrderOfficeDto;
  address?: OrderAddressDto;
}

export function toOrderDetailDto(order: OrderRecord): OrderDetailDto {
  return {
    orderId: order.id,
    orderReference: order.orderReference,
    status: OrderStatus[order.status],
    createdAt: order.createdAt.toISOString(),
    items: order.items.map(toOrderItemDto),
    delivery: toOrderDeliveryDto(order),
    paymentMethod: PaymentMethod[order.paymentMethod],
    contact: {
      firstName: order.contactFirstName,
      lastName: order.contactLastName,
      phoneNumber: order.contactPhone,
      email: order.contactEmail,
    },
    statusHistory: order.statusHistory.map(({ status, occurredAt }) => ({
      status: OrderStatus[status],
      occurredAt: occurredAt.toISOString(),
    })),
    goodsTotal: order.goodsTotal,
    deliveryPrice: order.deliveryPrice,
    cashOnDeliveryFee: order.cashOnDeliveryFee,
    total: order.total,
    netAmount: order.total - order.vatAmount,
    vatAmount: order.vatAmount,
  };
}

function toOrderItemDto(item: OrderRecord['items'][number]): OrderItemDto {
  return {
    brandId: item.brandId,
    articleNumber: item.articleNumber,
    brandName: item.brandName,
    description: item.description,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    lineTotal: item.lineTotal,
  };
}

function toOrderDeliveryDto(order: OrderRecord): OrderDeliveryDto {
  const expectedDeliveryDate =
    order.expectedDeliveryDate?.toISOString().slice(0, 10) ?? null;
  const snapshot = order.deliverySnapshot as DeliverySnapshot;

  if (order.deliveryMethod === 'STORE_PICKUP') {
    return { method: DeliveryMethod.STORE_PICKUP, expectedDeliveryDate };
  }

  const carrier = carrierOf(order);

  if (order.deliveryMethod === 'COURIER_OFFICE' && snapshot.office) {
    return {
      method: DeliveryMethod.COURIER_OFFICE,
      carrier,
      office: snapshot.office,
      expectedDeliveryDate,
    };
  }

  if (order.deliveryMethod === 'COURIER_ADDRESS' && snapshot.address) {
    return {
      method: DeliveryMethod.COURIER_ADDRESS,
      carrier,
      address: snapshot.address,
      expectedDeliveryDate,
    };
  }

  throw new Error(`Order ${order.id} holds no destination for its delivery`);
}

function carrierOf(order: OrderRecord): ShippingMethod {
  if (!order.shippingMethod) {
    throw new Error(`Order ${order.id} goes by courier but names none`);
  }

  return ShippingMethod[order.shippingMethod];
}
