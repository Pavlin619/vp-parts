import { Logger } from '@nestjs/common';
import {
  DeliveryOfficeDto,
  DeliveryOfficeType,
  ShippingMethod,
} from '@vp-parts-shop/shared';
import type { RedisCache } from '../../redis';
import { DeliveryUnavailableException } from '../delivery.exceptions';
import type { EcontOffices } from './econt-offices';
import { EcontPlaces } from './econt-places';
import type { EcontCityRecord } from './econt-response';
import type { EcontTransport } from './econt.transport';

function city(overrides: Partial<EcontCityRecord> = {}): EcontCityRecord {
  return {
    id: 27183,
    name: 'Ясен',
    regionName: 'Плевен',
    postCode: '5850',
    servingOffices: [
      { officeCode: '5817', servingType: 'from_door_courier' },
      { officeCode: '5817', servingType: 'to_office_courier' },
    ],
    ...overrides,
  };
}

function office(code: string, placeId: string): DeliveryOfficeDto {
  return {
    carrier: ShippingMethod.ECONT,
    code,
    name: 'Плевен Метро',
    placeId,
    city: 'Плевен',
    postCode: '5800',
    address: 'Плевен ул. Дойран 1',
    latitude: 43.41,
    longitude: 24.61,
    type: DeliveryOfficeType.OFFICE,
    weekdayHours: null,
    saturdayHours: null,
  };
}

const PLEVEN_METRO = office('5817', '1500');

describe('EcontPlaces', () => {
  let readNomenclature: jest.Mock;
  let cached: jest.Mock;
  let listOffices: jest.Mock;
  let places: EcontPlaces;

  beforeEach(() => {
    readNomenclature = jest.fn();
    cached = jest.fn((_key: string, _ttl: number, loader: () => unknown) =>
      loader(),
    );
    listOffices = jest.fn().mockResolvedValue([PLEVEN_METRO]);
    places = new EcontPlaces(
      { readNomenclature } as unknown as EcontTransport,
      { cached } as unknown as RedisCache,
      { list: listOffices } as unknown as EcontOffices,
    );
  });

  it('names the office a village without one collects from', async () => {
    readNomenclature.mockResolvedValueOnce({ cities: [city()] });

    expect(await places.list()).toEqual([
      {
        carrier: ShippingMethod.ECONT,
        id: '27183',
        name: 'Ясен',
        region: 'Плевен',
        postCode: '5850',
        servingOfficeCode: '5817',
      },
    ]);
  });

  it('names no serving office for a place with an office of its own', async () => {
    readNomenclature.mockResolvedValueOnce({
      cities: [city({ id: 1500, name: 'Плевен', postCode: '5800' })],
    });

    const [pleven] = await places.list();

    expect(pleven).toMatchObject({ id: '1500', servingOfficeCode: null });
  });

  it('asks for Bulgarian places only', async () => {
    readNomenclature.mockResolvedValueOnce({ cities: [city()] });

    await places.list();

    expect(readNomenclature).toHaveBeenCalledWith(
      'Nomenclatures/NomenclaturesService.getCities',
      { countryCode: 'BGR' },
    );
  });

  // Econt names mobile stations and codes getOffices does not list; neither is a place to collect from.
  it('leaves out a place whose only serving office is not one we list', async () => {
    readNomenclature.mockResolvedValueOnce({
      cities: [
        city({
          id: 1,
          name: 'Иваново',
          servingOffices: [
            { officeCode: '70088', servingType: 'to_office_courier' },
          ],
        }),
        city({ id: 2, name: 'Без офис', servingOffices: null }),
        city({ id: 3, name: 'Ясен' }),
      ],
    });

    expect((await places.list()).map(({ name }) => name)).toEqual(['Ясен']);
  });

  it('reads only the office Econt delivers parcels to, not the ones it collects from', async () => {
    readNomenclature.mockResolvedValueOnce({
      cities: [
        city({
          servingOffices: [
            { officeCode: '5817', servingType: 'from_office_courier' },
          ],
        }),
      ],
    });

    expect(await places.list()).toEqual([]);
  });

  // Econt files holiday areas and a "Мобилен РЦ" entry without a region; none is a settlement.
  it('leaves out a place with no region', async () => {
    readNomenclature.mockResolvedValueOnce({
      cities: [
        city({ id: 1, name: 'Бяла нива (вилна зона) Сoфия', regionName: null }),
        city({ id: 2, regionName: ' ' }),
        city({ id: 3 }),
      ],
    });

    expect((await places.list()).map(({ id }) => id)).toEqual(['3']);
  });

  it.each([
    ['София', 'София-град'],
    ['София Област', 'Софийска област'],
    ['Плевен', 'Плевен'],
  ])('names the region Econt calls %s as %s', async (econtRegion, region) => {
    readNomenclature.mockResolvedValueOnce({
      cities: [city({ regionName: econtRegion })],
    });

    expect((await places.list()).map((place) => place.region)).toEqual([
      region,
    ]);
  });

  it('caches what Econt lists for a day, apart from the offices', async () => {
    readNomenclature.mockResolvedValueOnce({ cities: [city()] });

    await places.list();

    expect(cached).toHaveBeenCalledWith(
      'econt:places:BGR',
      86_400,
      expect.any(Function),
    );
  });

  it('reads the cache once for many lists', async () => {
    readNomenclature.mockResolvedValue({ cities: [city()] });

    await places.list();
    await places.list();

    expect(cached).toHaveBeenCalledTimes(1);
  });

  // Thrown rather than returned so the cache stores nothing and the next request retries.
  describe('when Econt answers with nothing usable', () => {
    beforeEach(() => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation();
      jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    });

    it('is unavailable for an empty list', async () => {
      readNomenclature.mockResolvedValueOnce({ cities: [] });

      await expect(places.list()).rejects.toBeInstanceOf(
        DeliveryUnavailableException,
      );
    });

    it('is unavailable for a body without a place list', async () => {
      readNomenclature.mockResolvedValueOnce({ error: 'maintenance' });

      await expect(places.list()).rejects.toBeInstanceOf(
        DeliveryUnavailableException,
      );
    });
  });

  it('skips a malformed place and keeps the rest', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    readNomenclature.mockResolvedValueOnce({
      cities: [{ id: 'broken' }, city()],
    });

    expect((await places.list()).map(({ name }) => name)).toEqual(['Ясен']);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('1'));
  });
});
