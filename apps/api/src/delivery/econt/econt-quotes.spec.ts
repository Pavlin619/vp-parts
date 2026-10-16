import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeliveryAddressRefusedException,
  DeliveryOfficeRefusedException,
  DeliveryUnavailableException,
} from '../delivery.exceptions';
import {
  DeliveryDestinationDto,
  DeliveryDestinationType,
} from '@vp-parts-shop/shared';
import type { Shipment } from '../delivery-carrier';
import type { Parcel } from '../parcel/parcel-estimate';
import { EcontQuotes } from './econt-quotes';
import { EcontRefusedException } from './econt.transport';
import type { EcontTransport } from './econt.transport';

const CONFIG: Record<string, string> = {
  ECONT_SENDER_OFFICE_CODE: '1127',
  ECONT_SENDER_PAYMENT_METHOD: 'cash',
};

const PARCEL: Parcel = {
  weightGrams: 2300,
  unitsCm: null,
  hasEstimatedUnits: false,
};

const OFFICE: DeliveryDestinationDto = {
  type: DeliveryDestinationType.OFFICE,
  officeCode: '9035',
};

const ADDRESS: DeliveryDestinationDto = {
  type: DeliveryDestinationType.ADDRESS,
  address: {
    placeId: '41',
    street: 'бул. Витоша',
    streetNumber: '10',
    quarter: 'кв. Лозенец',
    floor: '3',
  },
};

const RECEIVER_REFUSAL = {
  type: 'ExInvalidParam',
  message: 'получател: ',
  innerErrors: [],
};

const SEND_DATE = '2026-09-28';

const SHIPMENT: Shipment = {
  parcel: PARCEL,
  sendDate: SEND_DATE,
  cashOnDeliveryCents: null,
};

// Econt dates a delivery as Bulgarian midnight.
const EXPECTED_AT = new Date('2026-09-24T21:00:00Z').getTime();

describe('EcontQuotes', () => {
  let call: jest.Mock;
  let quotes: EcontQuotes;

  afterEach(() => jest.restoreAllMocks());

  beforeEach(() => {
    call = jest.fn().mockResolvedValue({
      label: {
        totalPrice: 4.13,
        currency: 'EUR',
        expectedDeliveryDate: EXPECTED_AT,
      },
    });
    quotes = new EcontQuotes(
      { call } as unknown as EcontTransport,
      { get: (key: string) => CONFIG[key] } as unknown as ConfigService,
    );
  });

  it('asks Econt to price, not create, an office-to-office parcel paid by us', async () => {
    await quotes.quote(OFFICE, SHIPMENT);

    expect(call).toHaveBeenCalledWith('Shipments/LabelService.createLabel', {
      mode: 'calculate',
      label: {
        senderOfficeCode: '1127',
        receiverOfficeCode: '9035',
        shipmentType: 'pack',
        packCount: 1,
        weight: 2.3,
        paymentSenderMethod: 'cash',
        sendDate: SEND_DATE,
      },
    });
  });

  it('lets Econt assume today when the parcel has no ready date', async () => {
    await quotes.quote(OFFICE, { ...SHIPMENT, sendDate: null });

    const [, body] = call.mock.calls[0];
    expect(body.label).not.toHaveProperty('sendDate');
  });

  it('sends the box size when the parcel has one', async () => {
    await quotes.quote(OFFICE, {
      ...SHIPMENT,
      parcel: { ...PARCEL, unitsCm: [{ length: 30, width: 20, height: 10 }] },
    });

    const [, body] = call.mock.calls[0];
    expect(body.label).toMatchObject({
      shipmentDimensionsL: 30,
      shipmentDimensionsW: 20,
      shipmentDimensionsH: 10,
    });
  });

  it('sends no box size for several units, whose packing is unknown', async () => {
    const box = { length: 30, width: 20, height: 10 };

    await quotes.quote(OFFICE, {
      ...SHIPMENT,
      parcel: { ...PARCEL, unitsCm: [box, box] },
    });

    const [, body] = call.mock.calls[0];
    expect(body.label).not.toHaveProperty('shipmentDimensionsL');
  });

  it('answers the price in cents and the Bulgarian delivery date', async () => {
    expect(await quotes.quote(OFFICE, SHIPMENT)).toEqual({
      priceIncVatCents: 413,
      cashOnDeliveryFeeIncVatCents: null,
      expectedDeliveryDate: '2026-09-25',
    });
  });

  it('has no delivery date when Econt gives none', async () => {
    call.mockResolvedValueOnce({
      label: { totalPrice: 4.13, currency: 'EUR', expectedDeliveryDate: null },
    });

    expect(
      (await quotes.quote(OFFICE, SHIPMENT)).expectedDeliveryDate,
    ).toBeNull();
  });

  it.each([
    ['a body without a label', { error: 'maintenance' }],
    [
      'a price as text',
      {
        label: {
          totalPrice: '4.13',
          currency: 'EUR',
          expectedDeliveryDate: null,
        },
      },
    ],
  ])('is unavailable for %s', async (_case, body) => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    call.mockResolvedValueOnce(body);

    await expect(quotes.quote(OFFICE, SHIPMENT)).rejects.toBeInstanceOf(
      DeliveryUnavailableException,
    );
  });

  it('blames the office when Econt refuses the receiver', async () => {
    call.mockRejectedValueOnce(
      new EcontRefusedException({
        type: 'ExInvalidParam',
        message: 'получател: ',
        innerErrors: [],
      }),
    );

    await expect(quotes.quote(OFFICE, SHIPMENT)).rejects.toBeInstanceOf(
      DeliveryOfficeRefusedException,
    );
  });

  it('keeps any other refusal ours to fix', async () => {
    const refusal = new EcontRefusedException({
      type: 'ExInvalidParam',
      message: 'подател: ',
    });
    call.mockRejectedValueOnce(refusal);

    await expect(quotes.quote(OFFICE, SHIPMENT)).rejects.toBe(refusal);
  });

  it('warns when Econt priced the parcel as another shipment type', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    call.mockResolvedValueOnce({
      label: {
        shipmentType: 'cargo',
        totalPrice: 20.49,
        currency: 'EUR',
        expectedDeliveryDate: EXPECTED_AT,
      },
    });

    await quotes.quote(OFFICE, SHIPMENT);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('cargo'));
  });

  it('warns when Econt expects the delivery to be late', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    call.mockResolvedValueOnce({
      label: {
        shipmentType: 'pack',
        totalPrice: 4.13,
        currency: 'EUR',
        expectedDeliveryDate: EXPECTED_AT,
      },
      delayedDeliveryWarning: 'Закъснение поради празници',
    });

    await quotes.quote(OFFICE, SHIPMENT);

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Закъснение поради празници'),
    );
  });

  it('stays quiet when Econt priced what was asked, on time', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    call.mockResolvedValueOnce({
      label: {
        shipmentType: 'pack',
        totalPrice: 4.13,
        currency: 'EUR',
        expectedDeliveryDate: EXPECTED_AT,
      },
      delayedDeliveryWarning: '',
    });

    await quotes.quote(OFFICE, SHIPMENT);

    expect(warn).not.toHaveBeenCalled();
  });

  it('refuses a price in a currency the shop does not charge in', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    call.mockResolvedValueOnce({
      label: { totalPrice: 8.08, currency: 'BGN', expectedDeliveryDate: null },
    });

    await expect(quotes.quote(OFFICE, SHIPMENT)).rejects.toBeInstanceOf(
      DeliveryUnavailableException,
    );
  });

  describe('cash on delivery', () => {
    const COLLECTING = { ...SHIPMENT, cashOnDeliveryCents: 10530 };

    // As the demo answered a 2 kg parcel collecting €100, measured 2026-10-15.
    const PRICED_WITH_FEE = {
      label: {
        totalPrice: 5.3,
        currency: 'EUR',
        expectedDeliveryDate: EXPECTED_AT,
        services: [
          { type: 'C', price: 3.78, currency: 'EUR' },
          { type: 'CD', price: 1.52, currency: 'EUR' },
        ],
      },
    };

    it('asks Econt to collect the amount in euros', async () => {
      call.mockResolvedValueOnce(PRICED_WITH_FEE);

      await quotes.quote(OFFICE, COLLECTING);

      const [, body] = call.mock.calls[0];
      expect(body.label.services).toEqual({
        cdAmount: 105.3,
        cdType: 'get',
        cdCurrency: 'EUR',
      });
    });

    it('asks for no service when nothing is collected', async () => {
      await quotes.quote(OFFICE, SHIPMENT);

      const [, body] = call.mock.calls[0];
      expect(body.label).not.toHaveProperty('services');
    });

    it('answers the fee apart from the delivery it is added to', async () => {
      call.mockResolvedValueOnce(PRICED_WITH_FEE);

      expect(await quotes.quote(OFFICE, COLLECTING)).toEqual({
        priceIncVatCents: 378,
        cashOnDeliveryFeeIncVatCents: 152,
        expectedDeliveryDate: '2026-09-25',
      });
    });

    it('is unavailable when Econt prices no fee for the amount it was asked to collect', async () => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation();

      await expect(quotes.quote(OFFICE, COLLECTING)).rejects.toBeInstanceOf(
        DeliveryUnavailableException,
      );
    });
  });

  describe('to an address', () => {
    it('prices the parcel to the place and street, with no receiver office', async () => {
      await quotes.quote(ADDRESS, SHIPMENT);

      const [, body] = call.mock.calls[0];
      expect(body.label).toEqual({
        senderOfficeCode: '1127',
        receiverAddress: {
          city: { id: 41 },
          street: 'бул. Витоша',
          num: '10',
          quarter: 'кв. Лозенец',
          other: 'ет. 3',
        },
        shipmentType: 'pack',
        packCount: 1,
        weight: 2.3,
        paymentSenderMethod: 'cash',
        sendDate: SEND_DATE,
      });
    });

    it('sends only the place when that is all the address names', async () => {
      await quotes.quote(
        {
          type: DeliveryDestinationType.ADDRESS,
          address: { placeId: '41' },
        },
        SHIPMENT,
      );

      const [, body] = call.mock.calls[0];
      expect(body.label.receiverAddress).toEqual({ city: { id: 41 } });
    });

    it('answers the price in cents and the delivery date', async () => {
      expect(await quotes.quote(ADDRESS, SHIPMENT)).toEqual({
        priceIncVatCents: 413,
        cashOnDeliveryFeeIncVatCents: null,
        expectedDeliveryDate: '2026-09-25',
      });
    });

    it('blames the address when Econt refuses the receiver', async () => {
      call.mockRejectedValueOnce(new EcontRefusedException(RECEIVER_REFUSAL));

      await expect(quotes.quote(ADDRESS, SHIPMENT)).rejects.toBeInstanceOf(
        DeliveryAddressRefusedException,
      );
    });

    it('names the place in the late-delivery warning', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      call.mockResolvedValueOnce({
        label: {
          shipmentType: 'pack',
          totalPrice: 4.13,
          currency: 'EUR',
          expectedDeliveryDate: EXPECTED_AT,
        },
        delayedDeliveryWarning: 'Закъснение',
      });

      await quotes.quote(ADDRESS, SHIPMENT);

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('place 41'));
    });
  });
});
