import { Inject, Injectable } from '@nestjs/common';
import {
  DeliveryAddressDto,
  DeliveryAddressValidationDto,
  DeliveryAddressValidationStatus,
  DeliveryDestinationDto,
  DeliveryDestinationType,
  DeliveryQuarterDto,
  DeliveryStreetDto,
  DeliveryOfficeDto,
  DeliveryOfficeType,
  DeliveryPlaceDto,
  DeliveryMethod,
  OrderAddressDto,
  OrderOfficeDto,
  ParcelEstimateDto,
  PlaceOrderDeliveryDto,
  ShippingMethod,
} from '@vp-parts-shop/shared';
import type { CartShippingLine } from '../cart';
import type { AvailabilityByArticle } from '../inventory';
import { RedisCache } from '../redis';
import { amountToCollectCents } from './cash-on-delivery';
import {
  CarrierQuote,
  DELIVERY_CARRIERS,
  DeliveryCarrier,
  Shipment,
} from './delivery-carrier';
import {
  DeliveryAddressNotServedException,
  DeliveryAddressRefusedException,
  DeliveryLockerIneligibleException,
  DeliveryOfficeNotFoundException,
} from './delivery.exceptions';
import { fitsLocker } from './parcel/locker-fit';
import { estimateParcel, Parcel, singleBoxOf } from './parcel/parcel-estimate';
import { parcelReadyDate } from './parcel/parcel-ready-date';

/** Short because the expected delivery date moves at the courier's daily cut-off. */
const QUOTE_TTL = 5 * 60;

/** The selected lines and what the stock says of each. */
export interface StockedLines {
  lines: CartShippingLine[];
  availability: AvailabilityByArticle;
}

/** Where the order goes, as the customer chose it, named as well as located. */
export type OrderDestination =
  | { office: OrderOfficeDto }
  | { address: OrderAddressDto }
  | null;

/** A priced delivery: the figures a quote shows and an order freezes. */
export interface DeliveryPrice {
  method: DeliveryMethod;
  /** Null for store pickup. */
  carrier: ShippingMethod | null;
  destination: OrderDestination;
  deliveryPrice: number;
  /** Zero when the courier collects nothing. */
  cashOnDeliveryFee: number;
  expectedDeliveryDate: string | null;
  parcelWeightGrams: number | null;
}

export interface DeliveryTerms {
  /** What the courier collects for the parts; null when it collects nothing. */
  goodsToCollectCents: number | null;
  /** An order's delivery: a waybill must be possible, so an address is also checked with the carrier. */
  isBinding: boolean;
}

/** What the destination check found, which an order snapshots. */
type CheckedDestination =
  | { type: DeliveryDestinationType.OFFICE; office: DeliveryOfficeDto }
  | {
      type: DeliveryDestinationType.ADDRESS;
      address: DeliveryAddressDto;
      place: DeliveryPlaceDto;
    };

/** The parcel the lines make, the destination it was checked against, and its price. */
interface QuotedParcel {
  parcel: ParcelEstimateDto;
  checked: CheckedDestination;
  quote: CarrierQuote;
}

interface ShipmentToQuote {
  estimate: Parcel;
  stocked: StockedLines;
  /** What the courier collects for the parts; null when it collects nothing. */
  goodsToCollectCents: number | null;
}

type CourierDelivery = Exclude<
  PlaceOrderDeliveryDto,
  { method: DeliveryMethod.STORE_PICKUP }
>;

@Injectable()
export class DeliveryService {
  private readonly carriers: ReadonlyMap<ShippingMethod, DeliveryCarrier>;

  constructor(
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

  estimateParcel(
    lines: CartShippingLine[],
    carrier: ShippingMethod,
  ): ParcelEstimateDto {
    return toParcelEstimateDto(estimateParcel(lines), this.carrierFor(carrier));
  }

  /**
   * The one path every delivery figure takes, so an order charges what its
   * quote showed: destination check, parcel, then the carrier's price.
   */
  async price(
    stocked: StockedLines,
    delivery: PlaceOrderDeliveryDto,
    { goodsToCollectCents, isBinding }: DeliveryTerms,
  ): Promise<DeliveryPrice> {
    if (delivery.method === DeliveryMethod.STORE_PICKUP) {
      return storePickupOf(stocked);
    }

    const courier = this.carrierFor(delivery.carrier);
    const [{ quote, parcel, checked }] = await Promise.all([
      this.checkAndQuote(courier, toDestination(delivery), {
        stocked,
        goodsToCollectCents,
      }),
      isBinding ? this.requireDeliverableAddress(courier, delivery) : null,
    ]);

    return {
      method: delivery.method,
      carrier: delivery.carrier,
      destination: toOrderDestination(checked),
      deliveryPrice: quote.priceIncVatCents,
      cashOnDeliveryFee: quote.cashOnDeliveryFeeIncVatCents ?? 0,
      expectedDeliveryDate: quote.expectedDeliveryDate,
      parcelWeightGrams: parcel.weightGrams,
    };
  }

  private async checkAndQuote(
    courier: DeliveryCarrier,
    destination: DeliveryDestinationDto,
    shipment: Omit<ShipmentToQuote, 'estimate'>,
  ): Promise<QuotedParcel> {
    const estimate = estimateParcel(shipment.stocked.lines);
    const parcel = toParcelEstimateDto(estimate, courier);
    const checked = await this.checkDestination(courier, destination, parcel);
    const quote = await this.quoteShipment(courier, destination, {
      ...shipment,
      estimate,
    });

    return { parcel, checked, quote };
  }

  private async quoteShipment(
    courier: DeliveryCarrier,
    destination: DeliveryDestinationDto,
    { estimate, stocked, goodsToCollectCents }: ShipmentToQuote,
  ): Promise<CarrierQuote> {
    const shipment: Shipment = {
      parcel: estimate,
      sendDate: parcelReadyDate(stocked.lines, stocked.availability),
      cashOnDeliveryCents: null,
    };
    const quote =
      goodsToCollectCents === null
        ? await this.cachedQuote(courier, destination, shipment)
        : await this.cashOnDeliveryQuote(courier, destination, {
            shipment,
            goodsCents: goodsToCollectCents,
          });

    return {
      ...quote,
      expectedDeliveryDate:
        shipment.sendDate === null ? null : quote.expectedDeliveryDate,
    };
  }

  /** A waybill cannot be made for an address the carrier refuses. */
  private async requireDeliverableAddress(
    courier: DeliveryCarrier,
    delivery: CourierDelivery,
  ): Promise<void> {
    if (delivery.method !== DeliveryMethod.COURIER_ADDRESS) {
      return;
    }

    const { status } = await courier.validateAddress(delivery.address);

    if (status === DeliveryAddressValidationStatus.INVALID) {
      throw new DeliveryAddressRefusedException();
    }
  }

  private async checkDestination(
    courier: DeliveryCarrier,
    destination: DeliveryDestinationDto,
    parcel: ParcelEstimateDto,
  ): Promise<CheckedDestination> {
    if (destination.type === DeliveryDestinationType.ADDRESS) {
      return {
        type: DeliveryDestinationType.ADDRESS,
        address: destination.address,
        place: await this.findAddressPlace(
          courier,
          destination.address.placeId,
        ),
      };
    }

    const office = await courier.findOffice(destination.officeCode);

    if (!office) {
      throw new DeliveryOfficeNotFoundException();
    }

    if (office.type === DeliveryOfficeType.LOCKER && !parcel.isLockerEligible) {
      throw new DeliveryLockerIneligibleException();
    }

    return { type: DeliveryDestinationType.OFFICE, office };
  }

  /** The carrier prices an unknown place id instead of refusing it, so only our list guards it. */
  private async findAddressPlace(
    courier: DeliveryCarrier,
    placeId: string,
  ): Promise<DeliveryPlaceDto> {
    const places = await courier.listAddressPlaces();
    const place = places.find(({ id }) => id === placeId);

    if (!place) {
      throw new DeliveryAddressNotServedException();
    }

    return place;
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

function toDestination(delivery: CourierDelivery): DeliveryDestinationDto {
  return delivery.method === DeliveryMethod.COURIER_ADDRESS
    ? { type: DeliveryDestinationType.ADDRESS, address: delivery.address }
    : { type: DeliveryDestinationType.OFFICE, officeCode: delivery.officeCode };
}

function toOrderDestination(checked: CheckedDestination): OrderDestination {
  if (checked.type === DeliveryDestinationType.OFFICE) {
    const { code, name, address, weekdayHours, saturdayHours } = checked.office;

    return { office: { code, name, address, weekdayHours, saturdayHours } };
  }

  const { address, place } = checked;

  return {
    address: { ...address, city: place.name, postCode: place.postCode },
  };
}

/** Collected at our counter: no carrier, no parcel, and the day every part is in. */
function storePickupOf({ lines, availability }: StockedLines): DeliveryPrice {
  return {
    method: DeliveryMethod.STORE_PICKUP,
    carrier: null,
    destination: null,
    deliveryPrice: 0,
    cashOnDeliveryFee: 0,
    expectedDeliveryDate: parcelReadyDate(lines, availability),
    parcelWeightGrams: null,
  };
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
