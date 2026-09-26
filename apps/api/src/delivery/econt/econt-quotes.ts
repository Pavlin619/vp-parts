import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CarrierQuote } from '../delivery-carrier';
import {
  DeliveryOfficeRefusedException,
  DeliveryUnavailableException,
} from '../delivery.exceptions';
import { Parcel, singleBoxOf } from '../parcel/parcel-estimate';
import { shopDateOf } from '../shop-date';
import {
  EcontCalculatedLabel,
  isCalculatedLabel,
  refusesReceiver,
} from './econt-response';
import { EcontRefusedException, EcontTransport } from './econt.transport';

const SHOP_CURRENCY = 'EUR';

const SHIPMENT_TYPE = 'pack';

@Injectable()
export class EcontQuotes {
  private readonly logger = new Logger(EcontQuotes.name);
  private readonly senderOfficeCode: string;
  private readonly senderPaymentMethod: string;

  constructor(
    private readonly transport: EcontTransport,
    config: ConfigService,
  ) {
    this.senderOfficeCode = config.get<string>('ECONT_SENDER_OFFICE_CODE')!;
    this.senderPaymentMethod = config.get<string>(
      'ECONT_SENDER_PAYMENT_METHOD',
    )!;
  }

  async quote(
    receiverOfficeCode: string,
    parcel: Parcel,
    sendDate: string | null,
  ): Promise<CarrierQuote> {
    const response = await this.calculate(
      receiverOfficeCode,
      this.labelFor(receiverOfficeCode, parcel, sendDate),
    );
    const calculated = this.calculatedLabelOf(response);
    const { label } = calculated;

    if (label.currency !== SHOP_CURRENCY) {
      this.logger.error(
        `Econt priced a parcel in ${label.currency}, not ${SHOP_CURRENCY}`,
      );
      throw new DeliveryUnavailableException();
    }

    this.warnAboutSurprises(receiverOfficeCode, calculated);

    return {
      priceIncVatCents: Math.round(label.totalPrice * 100),
      expectedDeliveryDate:
        label.expectedDeliveryDate === null
          ? null
          : shopDateOf(label.expectedDeliveryDate),
    };
  }

  private async calculate(
    receiverOfficeCode: string,
    label: object,
  ): Promise<unknown> {
    try {
      return await this.transport.call('Shipments/LabelService.createLabel', {
        mode: 'calculate',
        label,
      });
    } catch (error) {
      if (
        error instanceof EcontRefusedException &&
        refusesReceiver(error.refusal)
      ) {
        throw new DeliveryOfficeRefusedException();
      }

      throw error;
    }
  }

  private calculatedLabelOf(response: unknown): EcontCalculatedLabel {
    if (!isCalculatedLabel(response)) {
      this.logger.error('Econt answered a price calculation without a price');
      throw new DeliveryUnavailableException();
    }

    return response;
  }

  /** Econt reprices a heavy parcel as cargo on its own; see docs/DELIVERY-PROVIDERS.md. */
  private warnAboutSurprises(
    receiverOfficeCode: string,
    { label, delayedDeliveryWarning }: EcontCalculatedLabel,
  ): void {
    if (
      typeof label.shipmentType === 'string' &&
      label.shipmentType !== SHIPMENT_TYPE
    ) {
      this.logger.warn(
        `Econt priced a ${SHIPMENT_TYPE} to ${receiverOfficeCode} as ${label.shipmentType}`,
      );
    }

    if (
      typeof delayedDeliveryWarning === 'string' &&
      delayedDeliveryWarning.trim()
    ) {
      this.logger.warn(
        `Econt expects a late delivery to ${receiverOfficeCode}: ${delayedDeliveryWarning.trim()}`,
      );
    }
  }

  private labelFor(
    receiverOfficeCode: string,
    parcel: Parcel,
    sendDate: string | null,
  ) {
    const box = singleBoxOf(parcel);

    return {
      senderOfficeCode: this.senderOfficeCode,
      receiverOfficeCode,
      shipmentType: SHIPMENT_TYPE,
      packCount: 1,
      weight: parcel.weightGrams / 1000,
      paymentSenderMethod: this.senderPaymentMethod,
      ...(sendDate && { sendDate }),
      ...(box && {
        shipmentDimensionsL: box.length,
        shipmentDimensionsW: box.width,
        shipmentDimensionsH: box.height,
      }),
    };
  }
}
