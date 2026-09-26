import { Inject, Injectable } from '@nestjs/common';
import {
  CartDto,
  DeliveryOfficeDto,
  DeliveryOfficeType,
  DeliveryQuoteDto,
  DeliveryQuoteRequestDto,
  ParcelEstimateDto,
  ShippingMethod,
} from '@vp-parts-shop/shared';
import type { CartRequester, CartShippingLine } from '../cart';
import { CartEmptyException, CartService } from '../cart';
import { InventoryService } from '../inventory';
import { RedisCache } from '../redis';
import {
  CarrierQuote,
  DELIVERY_CARRIERS,
  DeliveryCarrier,
} from './delivery-carrier';
import {
  DeliveryLockerIneligibleException,
  DeliveryOfficeNotFoundException,
  DeliveryParcelUnmeasuredException,
} from './delivery.exceptions';
import { fitsLocker } from './parcel/locker-fit';
import {
  estimateParcel,
  Parcel,
  ParcelEstimate,
  singleBoxOf,
} from './parcel/parcel-estimate';
import { parcelReadyDate } from './parcel/parcel-ready-date';

/** Short because the expected delivery date moves at the courier's daily cut-off. */
const QUOTE_TTL = 5 * 60;

interface Shipment {
  parcel: Parcel;
  /** The shop-local day the parcel is handed to the courier; null when stock cannot say. */
  sendDate: string | null;
}

interface CartParcel {
  cart: CartDto;
  lines: CartShippingLine[];
  estimate: ParcelEstimate;
}

@Injectable()
export class DeliveryService {
  private readonly carriers: ReadonlyMap<ShippingMethod, DeliveryCarrier>;

  constructor(
    private readonly cart: CartService,
    private readonly inventory: InventoryService,
    @Inject(DELIVERY_CARRIERS) carriers: DeliveryCarrier[],
    private readonly cache: RedisCache,
  ) {
    this.carriers = new Map(carriers.map((each) => [each.carrier, each]));
  }

  listOffices(carrier: ShippingMethod): Promise<DeliveryOfficeDto[]> {
    return this.carrierFor(carrier).listOffices();
  }

  async estimateParcel(
    requester: CartRequester,
    carrier: ShippingMethod,
  ): Promise<ParcelEstimateDto> {
    const courier = this.carrierFor(carrier);
    const { estimate } = await this.parcelOf(requester);

    return toParcelEstimateDto(estimate, courier);
  }

  async quote(
    requester: CartRequester,
    { carrier, officeCode }: DeliveryQuoteRequestDto,
  ): Promise<DeliveryQuoteDto> {
    const courier = this.carrierFor(carrier);
    const office = await courier.findOffice(officeCode);

    if (!office) {
      throw new DeliveryOfficeNotFoundException();
    }

    const { cart, lines, estimate } = await this.parcelOf(requester);

    if (!estimate.isMeasured) {
      throw new DeliveryParcelUnmeasuredException();
    }

    const parcelDto = toParcelEstimateDto(estimate, courier);

    if (
      office.type === DeliveryOfficeType.LOCKER &&
      !parcelDto.isLockerEligible
    ) {
      throw new DeliveryLockerIneligibleException();
    }

    const sendDate = await this.readyDateOf(lines);
    const { priceIncVatCents, expectedDeliveryDate } = await this.cachedQuote(
      courier,
      officeCode,
      { parcel: estimate.parcel, sendDate },
    );

    return {
      carrier,
      officeCode,
      priceIncVatCents,
      expectedDeliveryDate: sendDate === null ? null : expectedDeliveryDate,
      parcel: parcelDto,
      cartVersion: cart.version,
    };
  }

  private async parcelOf(requester: CartRequester): Promise<CartParcel> {
    const { cart, lines } = await this.cart.getShippingLines(requester);

    if (lines.length === 0) {
      throw new CartEmptyException();
    }

    return {
      cart,
      lines,
      estimate: estimateParcel(lines),
    };
  }

  private async readyDateOf(lines: CartShippingLine[]): Promise<string | null> {
    const availability = await this.inventory.getAvailability(
      lines.map((line) => line.article),
    );

    return parcelReadyDate(lines, availability);
  }

  private cachedQuote(
    courier: DeliveryCarrier,
    officeCode: string,
    { parcel, sendDate }: Shipment,
  ): Promise<CarrierQuote> {
    return this.cache.cached(
      quoteCacheKey(courier.carrier, officeCode, { parcel, sendDate }),
      QUOTE_TTL,
      () => courier.quote(officeCode, parcel, sendDate),
    );
  }

  private carrierFor(carrier: ShippingMethod): DeliveryCarrier {
    const registered = this.carriers.get(carrier);

    if (!registered) {
      throw new Error(`No delivery carrier is registered for ${carrier}`);
    }

    return registered;
  }
}

function quoteCacheKey(
  carrier: ShippingMethod,
  officeCode: string,
  { parcel, sendDate }: Shipment,
): string {
  const box = singleBoxOf(parcel);
  const boxKey = box ? `${box.length}x${box.width}x${box.height}` : 'nobox';

  return `delivery:quote:${carrier}:${officeCode}:${parcel.weightGrams}:${boxKey}:${sendDate ?? 'undated'}`;
}

function toParcelEstimateDto(
  estimate: ParcelEstimate,
  { lockerLimits }: DeliveryCarrier,
): ParcelEstimateDto {
  if (!estimate.isMeasured) {
    return {
      weightGrams: null,
      unmeasuredArticles: estimate.unmeasuredArticles,
      isLockerEligible: false,
    };
  }

  const { parcel } = estimate;

  return {
    weightGrams: parcel.weightGrams,
    unmeasuredArticles: [],
    isLockerEligible: lockerLimits !== null && fitsLocker(parcel, lockerLimits),
  };
}
