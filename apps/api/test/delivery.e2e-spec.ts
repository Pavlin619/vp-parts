import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  DeliveryAddressValidationStatus,
  DeliveryOfficeType,
  ShippingMethod,
} from '@vp-parts-shop/shared';
import { createTestApp, resetRateLimits } from './helpers/create-test-app';
import { econt, SOFIA_ADDRESS, SOFIA_ID } from './helpers/econt-fake';
import {
  EcontRefusedException,
  EcontTransport,
} from '../src/delivery/econt/econt.transport';

describe('Delivery (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp((builder) => {
      builder.overrideProvider(EcontTransport).useValue(econt);
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    resetRateLimits(app);
  });

  describe('GET /delivery/offices', () => {
    it('lists Econt offices and lockers', async () => {
      const response = await request(app.getHttpServer())
        .get('/delivery/offices')
        .query({ carrier: ShippingMethod.ECONT })
        .expect(200);

      expect(response.body).toHaveLength(2);
      expect(response.body[1]).toMatchObject({
        code: '9010',
        placeId: '9000',
        type: DeliveryOfficeType.LOCKER,
        weekdayHours: { opensAt: '09:00', closesAt: '18:00' },
      });
      expect(response.headers['cache-control']).toBe('public, max-age=3600');
    });

    it('refuses a carrier it does not deliver with yet', async () => {
      await request(app.getHttpServer())
        .get('/delivery/offices')
        .query({ carrier: ShippingMethod.SPEEDY })
        .expect(400);
    });
  });

  describe('GET /delivery/places', () => {
    it('lists the places an Econt parcel can be collected for', async () => {
      const response = await request(app.getHttpServer())
        .get('/delivery/places')
        .query({ carrier: ShippingMethod.ECONT })
        .expect(200);

      expect(response.body).toEqual([
        expect.objectContaining({ id: '9000', servingOfficeCode: null }),
        expect.objectContaining({
          id: '9154',
          name: 'Константиново',
          region: 'Варна',
          servingOfficeCode: '9035',
        }),
      ]);
      expect(response.headers['cache-control']).toBe('public, max-age=3600');
    });

    it('refuses a carrier it does not deliver with yet', async () => {
      await request(app.getHttpServer())
        .get('/delivery/places')
        .query({ carrier: ShippingMethod.SPEEDY })
        .expect(400);
    });
  });

  describe('GET /delivery/address-places', () => {
    it('lists the places Econt delivers to at the door', async () => {
      const response = await request(app.getHttpServer())
        .get('/delivery/address-places')
        .query({ carrier: ShippingMethod.ECONT })
        .expect(200);

      expect(response.body).toEqual([
        expect.objectContaining({
          id: String(SOFIA_ID),
          servingOfficeCode: null,
        }),
      ]);
      expect(response.headers['cache-control']).toBe('public, max-age=3600');
    });
  });

  describe('GET /delivery/streets and /delivery/quarters', () => {
    it('suggests the streets of a place that match the query', async () => {
      const response = await request(app.getHttpServer())
        .get('/delivery/streets')
        .query({ carrier: ShippingMethod.ECONT, placeId: SOFIA_ID, q: 'вит' })
        .expect(200);

      expect(response.body).toEqual([{ id: '1', name: 'бул. Витоша' }]);
      expect(response.headers['cache-control']).toBe('public, max-age=3600');
    });

    it('suggests the quarters of a place', async () => {
      const response = await request(app.getHttpServer())
        .get('/delivery/quarters')
        .query({ carrier: ShippingMethod.ECONT, placeId: SOFIA_ID, q: 'сла' })
        .expect(200);

      expect(response.body).toEqual([{ id: '210', name: 'кв. Слатина' }]);
    });

    it.each([
      ['a missing query', { placeId: SOFIA_ID }],
      ['an over-long query', { placeId: SOFIA_ID, q: 'a'.repeat(51) }],
      ['a place id that is not a number', { placeId: 'sofia', q: 'вит' }],
    ])('refuses %s', async (_case, query) => {
      await request(app.getHttpServer())
        .get('/delivery/streets')
        .query({ carrier: ShippingMethod.ECONT, ...query })
        .expect(400);
    });
  });

  describe('POST /delivery/address/validate', () => {
    it('calls an address Econt keeps as sent valid', async () => {
      const response = await request(app.getHttpServer())
        .post('/delivery/address/validate')
        .send({ carrier: ShippingMethod.ECONT, address: SOFIA_ADDRESS })
        .expect(200);

      expect(response.body).toEqual({
        status: DeliveryAddressValidationStatus.VALID,
        suggested: null,
      });
    });

    it('offers the street Econt corrects a typo to', async () => {
      const response = await request(app.getHttpServer())
        .post('/delivery/address/validate')
        .send({
          carrier: ShippingMethod.ECONT,
          address: { ...SOFIA_ADDRESS, street: 'Витошаа' },
        })
        .expect(200);

      expect(response.body).toEqual({
        status: DeliveryAddressValidationStatus.UNCERTAIN,
        suggested: SOFIA_ADDRESS,
      });
    });

    it('calls an unknown street invalid', async () => {
      econt.readNomenclature.mockRejectedValueOnce(
        new EcontRefusedException({
          type: 'ExInvalidParam',
          innerErrors: [{ type: 'ExInvalidAddress', message: 'Не открихме' }],
        }),
      );

      const response = await request(app.getHttpServer())
        .post('/delivery/address/validate')
        .send({ carrier: ShippingMethod.ECONT, address: SOFIA_ADDRESS })
        .expect(200);

      expect(response.body.status).toBe(
        DeliveryAddressValidationStatus.INVALID,
      );
    });

    it('refuses an address naming neither a street nor a quarter', async () => {
      await request(app.getHttpServer())
        .post('/delivery/address/validate')
        .send({
          carrier: ShippingMethod.ECONT,
          address: { placeId: String(SOFIA_ID) },
        })
        .expect(400);
    });
  });
});
