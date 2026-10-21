import { Injectable, Logger } from '@nestjs/common';
import {
  CompleteProfileDetails,
  CustomerProfileDto,
  OrderDetailDto,
  PlaceOrderRequestDto,
  PlaceOrderResponseDto,
  QuickOrderContactDto,
  QuickOrderRequestDto,
  QuickOrderResponseDto,
} from '@vp-parts-shop/shared';
import { TurnstileVerifier } from '../bot-check';
import { CartService, CartStaleException } from '../cart';
import type { CartForOrder, CartOrderLine } from '../cart';
import { CheckoutService } from '../checkout';
import { CustomersService } from '../customers';
import { CartStatus, OrderStatus } from '../generated/prisma';
import type { PricedLine } from '../inventory';
import {
  OrderCartNotFoundException,
  OrderNotFoundException,
  OrdersAwaitingCallLimitException,
  PriceChangedException,
} from './orders.exceptions';
import { OrderAccessKeys } from './order-access-keys';
import { toOrderDetailDto } from './orders.mapper';
import {
  NewOrderItem,
  OrderContact,
  OrderPlacement,
  OrderReference,
  OrdersRepository,
} from './orders.repository';

/** The terms an order is placed under. Raise it whenever the terms page changes. */
export const TERMS_VERSION = '2026-10-17';

/** A fake cash-on-delivery order costs a shipment, so one phone may hold only a few. */
export const MAX_ORDERS_AWAITING_CALL_PER_PHONE = 3;

export interface PlacedOrder<
  Response extends PlaceOrderResponseDto = PlaceOrderResponseDto,
> {
  order: Response;
  /** True when the cart had been ordered from already: a retry, answered with its order. */
  isReplay: boolean;
}

/** Who an order is placed for, and where it starts. */
interface Orderer {
  customerId: string | null;
  contact: OrderContact;
  initialStatus: OrderStatus;
  /** What a new order must pass before it is priced. A retry skips it to find its order. */
  admit?: () => Promise<void>;
}

/**
 * Turns a cart into an order — docs/ORDERS.md. It is priced by checkout, as
 * the quote was, before the transaction, so no row lock is held across a call
 * to the stock or the courier.
 */
@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly customers: CustomersService,
    private readonly cart: CartService,
    private readonly checkout: CheckoutService,
    private readonly orders: OrdersRepository,
    private readonly accessKeys: OrderAccessKeys,
    private readonly botCheck: TurnstileVerifier,
  ) {}

  async placeOrder(
    clerkId: string,
    request: PlaceOrderRequestDto,
  ): Promise<PlacedOrder> {
    const customer = await this.customers.requireCompleteProfile(clerkId);
    const cart = await this.cart.findOwnedCart(customer.id, request.cartId);

    return this.placeFromCart(cart, request, {
      customerId: customer.id,
      contact: contactOf(customer),
      initialStatus: OrderStatus.PROCESSING,
    });
  }

  /**
   * A guest's order, owned through the cart token; the office calls to confirm
   * it. A retry is answered with the same access key, since the key is derived.
   */
  async placeQuickOrder(
    token: string | null,
    request: QuickOrderRequestDto,
  ): Promise<PlacedOrder<QuickOrderResponseDto>> {
    const cart = token
      ? await this.cart.findGuestCart(token, request.cartId)
      : null;
    const contact = guestContactOf(request.contact);

    const { order, isReplay } = await this.placeFromCart(cart, request, {
      customerId: null,
      contact,
      initialStatus: OrderStatus.AWAITING_CONFIRMATION,
      admit: () => this.admitQuickOrder(request.botCheckToken, contact.phone),
    });

    return {
      order: { ...order, accessKey: this.accessKeys.keyFor(order.orderId) },
      isReplay,
    };
  }

  async getOrder(
    clerkId: string,
    orderReference: string,
  ): Promise<OrderDetailDto> {
    const customer = await this.customers.findByClerkId(clerkId);
    const order = customer
      ? await this.orders.findOwned(orderReference, customer.id)
      : null;

    if (!order) {
      throw new OrderNotFoundException();
    }

    return toOrderDetailDto(order);
  }

  /** A wrong key answers as a missing order does, so a guess reveals nothing. */
  async getGuestOrder(
    orderReference: string,
    accessKey: string | undefined,
  ): Promise<OrderDetailDto> {
    const order = await this.orders.findGuest(orderReference);

    if (!order || !this.accessKeys.matches(order.id, accessKey)) {
      throw new OrderNotFoundException();
    }

    return toOrderDetailDto(order);
  }

  private async placeFromCart(
    cart: CartForOrder | null,
    request: PlaceOrderRequestDto,
    { admit, ...orderer }: Orderer,
  ): Promise<PlacedOrder> {
    if (!cart) {
      throw new OrderCartNotFoundException();
    }

    if (cart.orderId) {
      return this.replay(cart.orderId);
    }

    assertPricedVersion(cart, request.cartVersion);
    await admit?.();

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
      ...orderer,
      items: lines.map(toOrderItem),
      delivery,
      money,
      paymentMethod: request.paymentMethod,
      termsVersion: TERMS_VERSION,
    });

    return this.settle(placement);
  }

  /** After the replay and version checks, so neither spends the bot check's token. */
  private async admitQuickOrder(
    botCheckToken: string,
    phone: string,
  ): Promise<void> {
    await this.botCheck.verify(botCheckToken);

    const awaiting = await this.orders.countAwaitingConfirmation(phone);

    if (awaiting >= MAX_ORDERS_AWAITING_CALL_PER_PHONE) {
      throw new OrdersAwaitingCallLimitException();
    }
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
    thumbnailUrl: line.thumbnailUrl,
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
}: CompleteProfileDetails<CustomerProfileDto>): OrderContact {
  return { firstName, lastName, phone: phoneNumber, email };
}

function guestContactOf({
  firstName,
  lastName,
  phoneNumber,
  email,
}: QuickOrderContactDto): OrderContact {
  return { firstName, lastName, phone: phoneNumber, email: email ?? null };
}

function toResponse({ id, orderReference }: OrderReference) {
  return { orderId: id, orderReference };
}
