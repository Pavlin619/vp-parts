import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeliveryOfficeRefusedException,
  DeliveryUnavailableException,
} from '../delivery.exceptions';
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
};

const SEND_DATE = '2026-09-28';

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
    await quotes.quote('9035', PARCEL, SEND_DATE);

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
    await quotes.quote('9035', PARCEL, null);

    const [, body] = call.mock.calls[0];
    expect(body.label).not.toHaveProperty('sendDate');
  });

  it('sends the box size when the parcel has one', async () => {
    await quotes.quote(
      '9035',
      { ...PARCEL, unitsCm: [{ length: 30, width: 20, height: 10 }] },
      SEND_DATE,
    );

    const [, body] = call.mock.calls[0];
    expect(body.label).toMatchObject({
      shipmentDimensionsL: 30,
      shipmentDimensionsW: 20,
      shipmentDimensionsH: 10,
    });
  });

  it('sends no box size for several units, whose packing is unknown', async () => {
    const box = { length: 30, width: 20, height: 10 };

    await quotes.quote('9035', { ...PARCEL, unitsCm: [box, box] }, SEND_DATE);

    const [, body] = call.mock.calls[0];
    expect(body.label).not.toHaveProperty('shipmentDimensionsL');
  });

  it('answers the price in cents and the Bulgarian delivery date', async () => {
    expect(await quotes.quote('9035', PARCEL, SEND_DATE)).toEqual({
      priceIncVatCents: 413,
      expectedDeliveryDate: '2026-09-25',
    });
  });

  it('has no delivery date when Econt gives none', async () => {
    call.mockResolvedValueOnce({
      label: { totalPrice: 4.13, currency: 'EUR', expectedDeliveryDate: null },
    });

    expect(
      (await quotes.quote('9035', PARCEL, SEND_DATE)).expectedDeliveryDate,
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

    await expect(
      quotes.quote('9035', PARCEL, SEND_DATE),
    ).rejects.toBeInstanceOf(DeliveryUnavailableException);
  });

  it('blames the office when Econt refuses the receiver', async () => {
    call.mockRejectedValueOnce(
      new EcontRefusedException({
        type: 'ExInvalidParam',
        message: 'получател: ',
        innerErrors: [],
      }),
    );

    await expect(
      quotes.quote('9035', PARCEL, SEND_DATE),
    ).rejects.toBeInstanceOf(DeliveryOfficeRefusedException);
  });

  it('keeps any other refusal ours to fix', async () => {
    const refusal = new EcontRefusedException({
      type: 'ExInvalidParam',
      message: 'подател: ',
    });
    call.mockRejectedValueOnce(refusal);

    await expect(quotes.quote('9035', PARCEL, SEND_DATE)).rejects.toBe(refusal);
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

    await quotes.quote('9035', PARCEL, SEND_DATE);

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

    await quotes.quote('9035', PARCEL, SEND_DATE);

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

    await quotes.quote('9035', PARCEL, SEND_DATE);

    expect(warn).not.toHaveBeenCalled();
  });

  it('refuses a price in a currency the shop does not charge in', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    call.mockResolvedValueOnce({
      label: { totalPrice: 8.08, currency: 'BGN', expectedDeliveryDate: null },
    });

    await expect(
      quotes.quote('9035', PARCEL, SEND_DATE),
    ).rejects.toBeInstanceOf(DeliveryUnavailableException);
  });
});
