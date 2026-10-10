import { Logger } from '@nestjs/common';
import { DeliveryAddressValidationStatus } from '@vp-parts-shop/shared';
import type { RedisCache } from '../../redis';
import { DeliveryUnavailableException } from '../delivery.exceptions';
import { EcontAddresses } from './econt-addresses';
import { EcontRefusedException } from './econt.transport';
import type { EcontTransport } from './econt.transport';

const SOFIA = '41';

function row(id: number, name: string) {
  return { id, cityID: 41, name, nameEn: name };
}

function validated(
  validationStatus: string,
  address: Partial<{
    street: string | null;
    num: string | null;
    quarter: string | null;
    other: string | null;
  }>,
) {
  return {
    validationStatus,
    address: { street: null, num: null, quarter: '', other: null, ...address },
  };
}

describe('EcontAddresses', () => {
  let readNomenclature: jest.Mock;
  let cached: jest.Mock;
  let addresses: EcontAddresses;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    readNomenclature = jest.fn();
    cached = jest.fn((_key: string, _ttl: number, loader: () => unknown) =>
      loader(),
    );
    addresses = new EcontAddresses(
      { readNomenclature } as unknown as EcontTransport,
      { cached } as unknown as RedisCache,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  describe('streets', () => {
    beforeEach(() => {
      readNomenclature.mockResolvedValue({
        streets: [
          row(1, 'бул. Витоша'),
          row(2, 'ул. Витошка'),
          row(3, 'бул. Цар Борис III'),
        ],
      });
    });

    it('asks Econt for the place as a number and caches the list per place', async () => {
      await addresses.streets(SOFIA, 'вит');

      expect(readNomenclature).toHaveBeenCalledWith(
        'Nomenclatures/NomenclaturesService.getStreets',
        { countryCode: 'BGR', cityID: 41 },
      );
      expect(cached).toHaveBeenCalledWith(
        'econt:streets:41',
        24 * 60 * 60,
        expect.any(Function),
      );
    });

    it('keeps the streets containing the query, ignoring case', async () => {
      expect(await addresses.streets(SOFIA, 'ВИТОШ')).toEqual([
        { id: '1', name: 'бул. Витоша' },
        { id: '2', name: 'ул. Витошка' },
      ]);
    });

    it('matches words in any order', async () => {
      expect(await addresses.streets(SOFIA, 'борис цар')).toEqual([
        { id: '3', name: 'бул. Цар Борис III' },
      ]);
    });

    it('answers at most 20 streets', async () => {
      readNomenclature.mockResolvedValue({
        streets: Array.from({ length: 50 }, (_, index) =>
          row(index, `ул. Липа ${index}`),
        ),
      });

      expect(await addresses.streets(SOFIA, 'липа')).toHaveLength(20);
    });

    it('skips a malformed row and keeps the rest', async () => {
      readNomenclature.mockResolvedValue({
        streets: [{ id: 'x' }, row(1, 'бул. Витоша')],
      });

      expect(await addresses.streets(SOFIA, 'вит')).toHaveLength(1);
    });

    it('answers nothing for a place Econt lists no streets for', async () => {
      readNomenclature.mockResolvedValue({ streets: [] });

      expect(await addresses.streets('27183', 'вит')).toEqual([]);
    });

    it('is unavailable when Econt answers without a list', async () => {
      readNomenclature.mockResolvedValue({});

      await expect(addresses.streets(SOFIA, 'вит')).rejects.toBeInstanceOf(
        DeliveryUnavailableException,
      );
    });
  });

  describe('quarters', () => {
    it('reads the quarter list, cached under its own key', async () => {
      readNomenclature.mockResolvedValue({
        quarters: [row(210, 'кв. Слатина'), row(211, 'кв. Младост-1')],
      });

      expect(await addresses.quarters(SOFIA, 'млад')).toEqual([
        { id: '211', name: 'кв. Младост-1' },
      ]);
      expect(readNomenclature).toHaveBeenCalledWith(
        'Nomenclatures/NomenclaturesService.getQuarters',
        { countryCode: 'BGR', cityID: 41 },
      );
      expect(cached.mock.calls[0][0]).toBe('econt:quarters:41');
    });
  });

  describe('validate', () => {
    const sent = { placeId: SOFIA, street: 'бул. Витоша', streetNumber: '10' };

    it('sends the place as a number and the street number as num', async () => {
      readNomenclature.mockResolvedValue(
        validated('normal', { street: 'бул. Витоша', num: '10' }),
      );

      await addresses.validate({ ...sent, other: 'вх. А' });

      expect(readNomenclature).toHaveBeenCalledWith(
        'Nomenclatures/AddressService.validateAddress',
        {
          address: {
            city: { id: 41 },
            street: 'бул. Витоша',
            num: '10',
            other: 'вх. А',
          },
        },
      );
    });

    it('calls an address Econt kept as sent valid', async () => {
      readNomenclature.mockResolvedValue(
        validated('normal', { street: 'бул. Витоша', num: '10' }),
      );

      expect(await addresses.validate(sent)).toEqual({
        status: DeliveryAddressValidationStatus.VALID,
        suggested: null,
      });
    });

    it('ignores case when comparing the street Econt returns', async () => {
      readNomenclature.mockResolvedValue(
        validated('normal', { street: 'бул. витоша', num: '10' }),
      );

      const { status } = await addresses.validate(sent);

      expect(status).toBe(DeliveryAddressValidationStatus.VALID);
    });

    it('offers the corrected street when Econt silently fixes a typo', async () => {
      readNomenclature.mockResolvedValue(
        validated('normal', { street: 'бул. Витоша', num: '10' }),
      );

      expect(await addresses.validate({ ...sent, street: 'Витошаа' })).toEqual({
        status: DeliveryAddressValidationStatus.UNCERTAIN,
        suggested: {
          placeId: SOFIA,
          street: 'бул. Витоша',
          streetNumber: '10',
        },
      });
    });

    it('offers the corrected quarter', async () => {
      readNomenclature.mockResolvedValue(
        validated('normal', { quarter: 'кв. Младост-1', other: 'бл. 5' }),
      );

      const { status, suggested } = await addresses.validate({
        placeId: SOFIA,
        quarter: 'младост 1',
        other: 'бл. 5',
      });

      expect(status).toBe(DeliveryAddressValidationStatus.UNCERTAIN);
      expect(suggested).toEqual({
        placeId: SOFIA,
        quarter: 'кв. Младост-1',
        other: 'бл. 5',
      });
    });

    it('calls an invalid answer invalid', async () => {
      readNomenclature.mockResolvedValue(validated('invalid', {}));

      expect(await addresses.validate(sent)).toEqual({
        status: DeliveryAddressValidationStatus.INVALID,
        suggested: null,
      });
    });

    it('calls an unknown street Econt refuses invalid', async () => {
      readNomenclature.mockRejectedValue(
        new EcontRefusedException({
          type: 'ExInvalidParam',
          innerErrors: [{ type: 'ExInvalidAddress', message: 'Не открихме' }],
        }),
      );

      expect((await addresses.validate(sent)).status).toBe(
        DeliveryAddressValidationStatus.INVALID,
      );
    });

    it('lets any other refusal through', async () => {
      const refusal = new EcontRefusedException({ type: 'ExAccessDenied' });
      readNomenclature.mockRejectedValue(refusal);

      await expect(addresses.validate(sent)).rejects.toBe(refusal);
    });

    it('lets an unreachable Econt through as unavailable', async () => {
      readNomenclature.mockRejectedValue(new DeliveryUnavailableException());

      await expect(addresses.validate(sent)).rejects.toBeInstanceOf(
        DeliveryUnavailableException,
      );
    });

    it('is unavailable when Econt answers without a status', async () => {
      readNomenclature.mockResolvedValue({});

      await expect(addresses.validate(sent)).rejects.toBeInstanceOf(
        DeliveryUnavailableException,
      );
    });
  });
});
