import { Injectable } from '@nestjs/common';
import {
  CartTotalsDto,
  DeliveryDestinationDto,
  DeliveryDestinationType,
  DeliveryMethod,
  DeliveryQuoteDto,
  DeliveryQuoteRequestDto,
  OrderMoneyDto,
  ParcelEstimateDto,
  PaymentMethod,
  PlaceOrderDeliveryDto,
  PlaceOrderRequestDto,
  ShippingMethod,
} from '@vp-parts-shop/shared';
import { CartEmptyException, CartService } from '../cart';
import type { CartRequester, CartShipping, CartShippingLine } from '../cart';
import { DeliveryService } from '../delivery';
import type { DeliveryPrice } from '../delivery';
import {
  ArticleUnavailableException,
  InventoryService,
  priceLines,
} from '../inventory';
import type { AvailabilityByArticle, PricedLine } from '../inventory';
import { goodsTotal } from './order-money';
import { OrderMoneyCalculator } from './order-money.calculator';

/** The lines at their live prices, with those that cannot be ordered set apart. */
interface PricedGoods<T extends CartShippingLine> {
  priced: PricedLine<T>[];
  unorderable: T[];
  availability: AvailabilityByArticle;
}

interface DeliveryChoice {
  delivery: PlaceOrderDeliveryDto;
  isCashOnDelivery: boolean;
  /** An order's price: every line must be orderable, and the address deliverable. */
  isBinding: boolean;
}

interface PricedCheckout<T extends CartShippingLine> extends PricedGoods<T> {
  delivery: DeliveryPrice;
  /** Over the priced lines alone. */
  money: OrderMoneyDto;
}

/** What an order is placed at: every line priced, its delivery, and the money. */
export interface PricedOrder<T extends CartShippingLine> {
  lines: PricedLine<T>[];
  delivery: DeliveryPrice;
  money: OrderMoneyDto;
}

export type OrderTerms = Pick<
  PlaceOrderRequestDto,
  'delivery' | 'paymentMethod'
>;

/**
 * Every figure checkout shows and every order charges, priced on one path —
 * docs/ORDERS.md → "Money". The cart totals, the quote and the order differ
 * only in how strict they are, never in how they price.
 */
@Injectable()
export class CheckoutService {
  constructor(
    private readonly cart: CartService,
    private readonly inventory: InventoryService,
    private readonly delivery: DeliveryService,
    private readonly money: OrderMoneyCalculator,
  ) {}

  /** A line no order could include is left out; the cart shows it blocked instead. */
  async totals(requester: CartRequester): Promise<CartTotalsDto> {
    const { cart, lines } = await this.cart.getShippingLines(requester);
    const { priced } = await this.priceGoods(lines);
    const { goodsTotal, netAmount, vatAmount, total } = this.moneyOf(
      priced,
      null,
    );

    return {
      cartVersion: cart.version,
      goodsTotal,
      netAmount,
      vatAmount,
      total,
    };
  }

  async estimateParcel(
    requester: CartRequester,
    carrier: ShippingMethod,
  ): Promise<ParcelEstimateDto> {
    const { lines } = await this.selectedLinesOf(requester);

    return this.delivery.estimateParcel(lines, carrier);
  }

  async quote(
    requester: CartRequester,
    { carrier, destination, isCashOnDelivery }: DeliveryQuoteRequestDto,
  ): Promise<DeliveryQuoteDto> {
    const { cart, lines } = await this.selectedLinesOf(requester);
    const { unorderable, delivery, money } = await this.priceWithDelivery(
      lines,
      {
        delivery: toCourierDelivery(carrier, destination),
        isCashOnDelivery,
        isBinding: false,
      },
    );

    return {
      carrier,
      destination,
      priceIncVatCents: delivery.deliveryPrice,
      cashOnDeliveryFeeIncVatCents: isCashOnDelivery
        ? delivery.cashOnDeliveryFee
        : null,
      expectedDeliveryDate: delivery.expectedDeliveryDate,
      parcel: this.delivery.estimateParcel(lines, carrier),
      cartVersion: cart.version,
      money: unorderable.length === 0 ? money : null,
    };
  }

  /** The quote's path, refusing whatever an order cannot be placed with. */
  async priceOrder<T extends CartShippingLine>(
    lines: T[],
    { delivery, paymentMethod }: OrderTerms,
  ): Promise<PricedOrder<T>> {
    requireLines(lines);

    const checkout = await this.priceWithDelivery(lines, {
      delivery,
      isCashOnDelivery: paymentMethod === PaymentMethod.CASH_ON_DELIVERY,
      isBinding: true,
    });

    return {
      lines: checkout.priced,
      delivery: checkout.delivery,
      money: checkout.money,
    };
  }

  /**
   * Cash on delivery needs every line priced too: the courier is asked its fee
   * on the amount it collects, which is the whole order.
   */
  private async priceWithDelivery<T extends CartShippingLine>(
    lines: T[],
    { delivery, isCashOnDelivery, isBinding }: DeliveryChoice,
  ): Promise<PricedCheckout<T>> {
    const goods = await this.priceGoods(lines);

    if (goods.unorderable.length > 0 && (isBinding || isCashOnDelivery)) {
      throw new ArticleUnavailableException();
    }

    const price = await this.delivery.price(
      { lines, availability: goods.availability },
      delivery,
      {
        goodsToCollectCents: isCashOnDelivery ? goodsTotal(goods.priced) : null,
        isBinding,
      },
    );

    return {
      ...goods,
      delivery: price,
      money: this.moneyOf(goods.priced, price),
    };
  }

  private async priceGoods<T extends CartShippingLine>(
    lines: T[],
  ): Promise<PricedGoods<T>> {
    const availability = await this.inventory.getAvailability(
      lines.map((line) => line.article),
    );

    return { ...priceLines(lines, availability), availability };
  }

  private moneyOf(
    priced: PricedLine[],
    delivery: DeliveryPrice | null,
  ): OrderMoneyDto {
    return this.money.calculate({
      lines: priced,
      deliveryPrice: delivery?.deliveryPrice ?? 0,
      cashOnDeliveryFee: delivery?.cashOnDeliveryFee ?? 0,
    });
  }

  private async selectedLinesOf(
    requester: CartRequester,
  ): Promise<CartShipping> {
    const shipping = await this.cart.getShippingLines(requester);

    requireLines(shipping.lines);

    return shipping;
  }
}

function requireLines(lines: CartShippingLine[]): void {
  if (lines.length === 0) {
    throw new CartEmptyException();
  }
}

function toCourierDelivery(
  carrier: ShippingMethod,
  destination: DeliveryDestinationDto,
): PlaceOrderDeliveryDto {
  return destination.type === DeliveryDestinationType.ADDRESS
    ? {
        method: DeliveryMethod.COURIER_ADDRESS,
        carrier,
        address: destination.address,
      }
    : {
        method: DeliveryMethod.COURIER_OFFICE,
        carrier,
        officeCode: destination.officeCode,
      };
}
