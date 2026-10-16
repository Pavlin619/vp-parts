import { Inject, Injectable } from '@nestjs/common';
import {
  CartDto,
  DeliveryAddressDto,
  DeliveryAddressValidationDto,
  DeliveryDestinationDto,
  DeliveryDestinationType,
  DeliveryQuarterDto,
  DeliveryStreetDto,
  DeliveryOfficeDto,
  DeliveryOfficeType,
  DeliveryPlaceDto,
  DeliveryQuoteDto,
  DeliveryQuoteRequestDto,
  ParcelEstimateDto,
  ShippingMethod,
} from '@vp-parts-shop/shared';
import type { CartRequester, CartShippingLine } from '../cart';
import { CartEmptyException, CartService } from '../cart';
import { InventoryService } from '../inventory';
import type { AvailabilityByArticle } from '../inventory';
import { RedisCache } from '../redis';
import {
  amountToCollectCents,
  goodsTotalIncVatCents,
} from './cash-on-delivery';
import {
  CarrierQuote,
  DELIVERY_CARRIERS,
  DeliveryCarrier,
  Shipment,
} from './delivery-carrier';
import {
  DeliveryAddressNotServedException,
  DeliveryLockerIneligibleException,
  DeliveryOfficeNotFoundException,
} from './delivery.exceptions';
import { fitsLocker } from './parcel/locker-fit';
import { estimateParcel, Parcel, singleBoxOf } from './parcel/parcel-estimate';
import { parcelReadyDate } from './parcel/parcel-ready-date';

/** Short because the expected delivery date moves at the courier's daily cut-off. */
const QUOTE_TTL = 5 * 60;

interface CartParcel {
  cart: CartDto;
  lines: CartShippingLine[];
  estimate: Parcel;
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

  listPlaces(carrier: ShippingMethod): Promise<DeliveryPlaceDto[]> {
    return this.carrierFor(carrier).listPlaces();
  }

  listAddressPlaces(carrier: ShippingMethod): Promise<DeliveryPlaceDto[]> {
    return this.carrierFor(carrier).listAddressPlaces();
  }

  findStreets(
    carrier: ShippingMethod,
    placeId: string,
    query: string,
  ): Promise<DeliveryStreetDto[]> {
    return this.carrierFor(carrier).findStreets(placeId, query);
  }

  findQuarters(
    carrier: ShippingMethod,
    placeId: string,
    query: string,
  ): Promise<DeliveryQuarterDto[]> {
    return this.carrierFor(carrier).findQuarters(placeId, query);
  }

  validateAddress(
    carrier: ShippingMethod,
    address: DeliveryAddressDto,
  ): Promise<DeliveryAddressValidationDto> {
    return this.carrierFor(carrier).validateAddress(address);
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
    { carrier, destination, isCashOnDelivery }: DeliveryQuoteRequestDto,
  ): Promise<DeliveryQuoteDto> {
    const courier = this.carrierFor(carrier);
    const { cart, lines, estimate } = await this.parcelOf(requester);
    const parcelDto = toParcelEstimateDto(estimate, courier);

    await this.checkDestination(courier, destination, parcelDto);

    const availability = await this.availabilityOf(lines);
    const shipment: Shipment = {
      parcel: estimate,
      sendDate: parcelReadyDate(lines, availability),
      cashOnDeliveryCents: null,
    };
    const { expectedDeliveryDate, ...price } = isCashOnDelivery
      ? await this.cashOnDeliveryQuote(courier, destination, {
          shipment,
          goodsCents: goodsTotalIncVatCents(lines, availability),
        })
      : await this.cachedQuote(courier, destination, shipment);

    return {
      carrier,
      destination,
      ...price,
      expectedDeliveryDate:
        shipment.sendDate === null ? null : expectedDeliveryDate,
      parcel: parcelDto,
      cartVersion: cart.version,
    };
  }

  private async checkDestination(
    courier: DeliveryCarrier,
    destination: DeliveryDestinationDto,
    parcel: ParcelEstimateDto,
  ): Promise<void> {
    if (destination.type === DeliveryDestinationType.ADDRESS) {
      return this.checkAddressPlace(courier, destination.address.placeId);
    }

    const office = await courier.findOffice(destination.officeCode);

    if (!office) {
      throw new DeliveryOfficeNotFoundException();
    }

    if (office.type === DeliveryOfficeType.LOCKER && !parcel.isLockerEligible) {
      throw new DeliveryLockerIneligibleException();
    }
  }

  /** The carrier prices an unknown place id instead of refusing it, so only our list guards it. */
  private async checkAddressPlace(
    courier: DeliveryCarrier,
    placeId: string,
  ): Promise<void> {
    const places = await courier.listAddressPlaces();

    if (!places.some(({ id }) => id === placeId)) {
      throw new DeliveryAddressNotServedException();
    }
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

  private availabilityOf(
    lines: CartShippingLine[],
  ): Promise<AvailabilityByArticle> {
    return this.inventory.getAvailability(lines.map((line) => line.article));
  }

  /**
   * The fee is a share of the amount collected, and that amount includes the
   * fee, so the fee on the parts alone prices the amount the second ask uses.
   */
  private async cashOnDeliveryQuote(
    courier: DeliveryCarrier,
    destination: DeliveryDestinationDto,
    { shipment, goodsCents }: { shipment: Shipment; goodsCents: number },
  ): Promise<CarrierQuote> {
    const onGoods = await this.cachedQuote(courier, destination, {
      ...shipment,
      cashOnDeliveryCents: goodsCents,
    });

    return this.cachedQuote(courier, destination, {
      ...shipment,
      cashOnDeliveryCents: amountToCollectCents(goodsCents, onGoods),
    });
  }

  private cachedQuote(
    courier: DeliveryCarrier,
    destination: DeliveryDestinationDto,
    shipment: Shipment,
  ): Promise<CarrierQuote> {
    return this.cache.cached(
      quoteCacheKey(courier.carrier, destination, shipment),
      QUOTE_TTL,
      () => courier.quote(destination, shipment),
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
  destination: DeliveryDestinationDto,
  { parcel, sendDate, cashOnDeliveryCents }: Shipment,
): string {
  const box = singleBoxOf(parcel);
  const boxKey = box ? `${box.length}x${box.width}x${box.height}` : 'nobox';
  const collectKey = cashOnDeliveryCents ?? 'none';

  return `delivery:quote:${carrier}:${destinationKey(destination)}:${parcel.weightGrams}:${boxKey}:${sendDate ?? 'undated'}:collect:${collectKey}`;
}

/** The price follows the place alone; the street never changes it. */
function destinationKey(destination: DeliveryDestinationDto): string {
  return destination.type === DeliveryDestinationType.ADDRESS
    ? `place:${destination.address.placeId}`
    : `office:${destination.officeCode}`;
}

function toParcelEstimateDto(
  parcel: Parcel,
  { lockerLimits }: DeliveryCarrier,
): ParcelEstimateDto {
  // A locker cell refuses an oversize parcel at drop-off, so only measured figures may claim a fit.
  const isLockerEligible =
    lockerLimits !== null &&
    !parcel.hasEstimatedUnits &&
    fitsLocker(parcel, lockerLimits);

  return { weightGrams: parcel.weightGrams, isLockerEligible };
}
