import { Injectable, Logger } from '@nestjs/common';
import {
  CompleteProfileDetails,
  CustomerProfileDto,
  OrderDetailDto,
  PlaceOrderRequestDto,
  PlaceOrderResponseDto,
} from '@vp-parts-shop/shared';
import { CartService, CartStaleException } from '../cart';
import type { CartForOrder, CartOrderLine } from '../cart';
import { CheckoutService } from '../checkout';
import { CustomersService } from '../customers';
import { CartStatus } from '../generated/prisma';
import type { PricedLine } from '../inventory';
import {
  OrderCartNotFoundException,
  OrderNotFoundException,
  PriceChangedException,
} from './orders.exceptions';
import { toOrderDetailDto } from './orders.mapper';
import {
  NewOrderItem,
  OrderPlacement,
  OrderReference,
  OrdersRepository,
} from './orders.repository';

/** The terms an order is placed under. Raise it whenever the terms page changes. */
export const TERMS_VERSION = '2026-10-17';

export interface PlacedOrder {
  order: PlaceOrderResponseDto;
  /** True when the cart had been ordered from already: a retry, answered with its order. */
  isReplay: boolean;
}

/**
 * Turns a customer's cart into an order — docs/ORDERS.md. It is priced by
 * checkout, as the quote was, before the transaction, so no row lock is held
 * across a call to the stock or the courier.
 */
@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly customers: CustomersService,
    private readonly cart: CartService,
    private readonly checkout: CheckoutService,
    private readonly orders: OrdersRepository,
  ) {}

  async placeOrder(
    clerkId: string,
    request: PlaceOrderRequestDto,
  ): Promise<PlacedOrder> {
    const customer = await this.customers.requireCompleteProfile(clerkId);
    const cart = await this.cart.findOwnedCart(customer.id, request.cartId);

    if (!cart) {
      throw new OrderCartNotFoundException();
    }

    if (cart.orderId) {
      return this.replay(cart.orderId);
    }

    assertPricedVersion(cart, request.cartVersion);

    const { lines, delivery, money } = await this.checkout.priceOrder(
      cart.lines,
      request,
    );

    if (money.total !== request.expectedTotalCents) {
      throw new PriceChangedException();
    }

    const placement = await this.orders.place({
      cartId: cart.id,
      cartVersion: cart.version,
      customerId: customer.id,
      contact: contactOf(customer),
      items: lines.map(toOrderItem),
      delivery,
      money,
      paymentMethod: request.paymentMethod,
      termsVersion: TERMS_VERSION,
    });

    return this.settle(placement);
  }

  async getOrder(clerkId: string, orderId: string): Promise<OrderDetailDto> {
    const customer = await this.customers.findByClerkId(clerkId);
    const order = customer
      ? await this.orders.findOwned(orderId, customer.id)
      : null;

    if (!order) {
      throw new OrderNotFoundException();
    }

    return toOrderDetailDto(order);
  }

  private async replay(orderId: string): Promise<PlacedOrder> {
    const order = await this.orders.findReference(orderId);

    if (!order) {
      throw new Error(`Cart names order ${orderId}, which does not exist`);
    }

    return { order: toResponse(order), isReplay: true };
  }

  private settle(placement: OrderPlacement): PlacedOrder {
    if (placement.kind === 'stale') {
      throw new CartStaleException();
    }

    if (placement.kind === 'placed') {
      this.logger.log(`Order ${placement.order.id} placed`);
    }

    return {
      order: toResponse(placement.order),
      isReplay: placement.kind === 'replayed',
    };
  }
}

function assertPricedVersion(cart: CartForOrder, cartVersion: number): void {
  if (cart.status !== CartStatus.ACTIVE || cart.version !== cartVersion) {
    throw new CartStaleException();
  }
}

function toOrderItem({
  unitPrice,
  ...line
}: PricedLine<CartOrderLine>): NewOrderItem {
  return {
    brandId: line.article.brandId,
    articleNumber: line.article.articleNumber,
    brandName: line.brandName,
    description: line.description,
    quantity: line.quantity,
    unitPrice,
    lineTotal: unitPrice * line.quantity,
  };
}

function contactOf({
  firstName,
  lastName,
  phoneNumber,
  email,
}: CompleteProfileDetails<CustomerProfileDto>) {
  return { firstName, lastName, phone: phoneNumber, email };
}

function toResponse({ id, orderReference }: OrderReference) {
  return { orderId: id, orderReference };
}
