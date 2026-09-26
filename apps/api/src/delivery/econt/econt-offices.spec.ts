import { Logger } from '@nestjs/common';
import { DeliveryOfficeType, ShippingMethod } from '@vp-parts-shop/shared';
import type { RedisCache } from '../../redis';
import { DeliveryUnavailableException } from '../delivery.exceptions';
import { EcontOffices } from './econt-offices';
import type { EcontOfficeRecord } from './econt-response';
import type { EcontTransport } from './econt.transport';

const NINE = new Date('2026-09-24T06:00:00Z').getTime();
const SIX_PM = new Date('2026-09-24T15:00:00Z').getTime();
const THREE_PM = new Date('2026-09-24T12:00:00Z').getTime();

function office(overrides: Partial<EcontOfficeRecord> = {}): EcontOfficeRecord {
  return {
    code: '1127',
    name: 'София',
    isAPS: false,
    isMPS: false,
    isDrive: false,
    address: {
      city: { name: 'София', postCode: '1000' },
      fullAddress: ' София ул. Резбарска №11 ',
      location: { latitude: 42.7155, longitude: 23.3594 },
    },
    normalBusinessHoursFrom: NINE,
    normalBusinessHoursTo: SIX_PM,
    halfDayBusinessHoursFrom: NINE,
    halfDayBusinessHoursTo: THREE_PM,
    ...overrides,
  };
}

describe('EcontOffices', () => {
  let readNomenclature: jest.Mock;
  let cached: jest.Mock;
  let offices: EcontOffices;

  beforeEach(() => {
    readNomenclature = jest.fn();
    cached = jest.fn((_key: string, _ttl: number, loader: () => unknown) =>
      loader(),
    );
    offices = new EcontOffices(
      { readNomenclature } as unknown as EcontTransport,
      { cached } as unknown as RedisCache,
    );
  });

  it('maps an office to the carrier-neutral shape', async () => {
    readNomenclature.mockResolvedValueOnce({ offices: [office()] });

    expect(await offices.list()).toEqual([
      {
        carrier: ShippingMethod.ECONT,
        code: '1127',
        name: 'София',
        city: 'София',
        postCode: '1000',
        address: 'София ул. Резбарска №11',
        latitude: 42.7155,
        longitude: 23.3594,
        type: DeliveryOfficeType.OFFICE,
        weekdayHours: { opensAt: '09:00', closesAt: '18:00' },
        saturdayHours: { opensAt: '09:00', closesAt: '15:00' },
      },
    ]);
  });

  it('asks for Bulgarian offices only', async () => {
    readNomenclature.mockResolvedValueOnce({ offices: [office()] });

    await offices.list();

    expect(readNomenclature).toHaveBeenCalledWith(
      'Nomenclatures/NomenclaturesService.getOffices',
      { countryCode: 'BGR' },
    );
  });

  it('marks an Econtomat as a locker', async () => {
    readNomenclature.mockResolvedValueOnce({
      offices: [office({ isAPS: true })],
    });

    const [locker] = await offices.list();

    expect(locker.type).toBe(DeliveryOfficeType.LOCKER);
  });

  it('leaves out mobile stations, drive-throughs and anything that cannot be put on a map', async () => {
    readNomenclature.mockResolvedValueOnce({
      offices: [
        office({ code: 'mobile', isMPS: true }),
        office({ code: 'drive', isDrive: true }),
        office({
          code: 'unmapped',
          address: { ...office().address, location: null },
        }),
        office({ code: 'kept' }),
      ],
    });

    expect((await offices.list()).map((o) => o.code)).toEqual(['kept']);
  });

  it('caches the list for a day', async () => {
    readNomenclature.mockResolvedValueOnce({ offices: [office()] });

    await offices.list();

    expect(cached).toHaveBeenCalledWith(
      'econt:offices:BGR',
      86_400,
      expect.any(Function),
    );
  });

  // Thrown rather than returned so the cache stores nothing and the next request retries.
  describe('when Econt answers with nothing usable', () => {
    beforeEach(() => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation();
      jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    });

    it('is unavailable for an empty list', async () => {
      readNomenclature.mockResolvedValueOnce({ offices: [] });

      await expect(offices.list()).rejects.toBeInstanceOf(
        DeliveryUnavailableException,
      );
    });

    it('is unavailable when no office is a pickup point', async () => {
      readNomenclature.mockResolvedValueOnce({
        offices: [office({ isMPS: true })],
      });

      await expect(offices.list()).rejects.toBeInstanceOf(
        DeliveryUnavailableException,
      );
    });

    it('is unavailable for a body without an office list', async () => {
      readNomenclature.mockResolvedValueOnce({ error: 'maintenance' });

      await expect(offices.list()).rejects.toBeInstanceOf(
        DeliveryUnavailableException,
      );
    });
  });

  it('skips a malformed office and keeps the rest', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    readNomenclature.mockResolvedValueOnce({
      offices: [{ code: 'broken' }, office({ code: 'kept' })],
    });

    expect((await offices.list()).map((o) => o.code)).toEqual(['kept']);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('1'));
  });

  it('reads the cached list once for many lookups', async () => {
    readNomenclature.mockResolvedValue({ offices: [office()] });

    await offices.list();
    await offices.find('1127');
    await offices.find('0000');

    expect(cached).toHaveBeenCalledTimes(1);
  });

  it('finds an office by code, or answers undefined', async () => {
    readNomenclature.mockResolvedValue({ offices: [office()] });

    expect((await offices.find('1127'))?.name).toBe('София');
    expect(await offices.find('0000')).toBeUndefined();
  });
});
