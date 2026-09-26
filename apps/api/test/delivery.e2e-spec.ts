import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  AppErrorCode,
  CART_TOKEN_HEADER,
  DeliveryOfficeType,
  ShippingMethod,
} from '@vp-parts-shop/shared';
import { createTestApp, resetRateLimits } from './helpers/create-test-app';
import type Redis from 'ioredis';
import { ArticlesTecDoc } from '../src/catalog';
import { EcontTransport } from '../src/delivery/econt/econt.transport';
import { InventoryService } from '../src/inventory';
import { PrismaService } from '../src/prisma';
import { REDIS_CLIENT } from '../src/redis';
import { CatalogUnavailableException } from '../src/tecdoc';

const NINE = new Date('2026-09-24T06:00:00Z').getTime();
const SIX_PM = new Date('2026-09-24T15:00:00Z').getTime();

function econtOffice(code: string, isAPS: boolean) {
  return {
    code,
    name: isAPS ? 'Варна 24/7 Еконтомат' : 'Варна',
    isAPS,
    isMPS: false,
    isDrive: false,
    address: {
      city: { name: 'Варна', postCode: '9000' },
      fullAddress: 'Варна бул. Сливница 1',
      location: { latitude: 43.2, longitude: 27.9 },
    },
    normalBusinessHoursFrom: NINE,
    normalBusinessHoursTo: SIX_PM,
    halfDayBusinessHoursFrom: null,
    halfDayBusinessHoursTo: null,
  };
}

const econt = {
  readNomenclature: jest.fn(() =>
    Promise.resolve({
      offices: [econtOffice('9035', false), econtOffice('9010', true)],
    }),
  ),
  call: jest.fn(() =>
    Promise.resolve({
      label: {
        totalPrice: 4.13,
        currency: 'EUR',
        expectedDeliveryDate: SIX_PM,
      },
    }),
  ),
};

/** Every part is at the shop on Monday 28 September, except the pad, on Tuesday. */
function stockedOn(pickupAt: string) {
  return {
    available: true,
    bestPriceExVat: 10,
    bestPriceIncVat: 12,
    availabilityByWarehouse: [
      {
        warehouseId: 'REGIONAL_2',
        quantity: 10,
        deliveryWorkDays: 1,
        orderCutoffTime: '17:00',
        cutoffAt: '2026-09-28T14:00:00Z',
        pickup: { earliestAt: pickupAt, granularity: 'DAY' },
        courier: { earliestAt: pickupAt, granularity: 'DAY' },
      },
    ],
    computedAt: '2026-09-28T06:00:00Z',
  };
}

const inventory = {
  getAvailability: jest.fn(
    (articles: { brandId: string; articleNumber: string }[]) =>
      Promise.resolve(
        new Map(
          articles.map(({ brandId, articleNumber }) => [
            `${brandId}:${articleNumber}`,
            stockedOn(
              articleNumber === 'PAD'
                ? '2026-09-29T06:00:00Z'
                : '2026-09-28T06:00:00Z',
            ),
          ]),
        ),
      ),
  ),
};

const PROFILES: Record<string, object> = {
  FILTER: {
    weightGrams: 47,
    packageCm: { length: 7.5, width: 7.5, height: 12 },
  },
  PAD: { weightGrams: 2000, packageCm: null },
  DISC: { weightGrams: null, packageCm: null },
};

const readArticle = (_brandId: number, articleNumber: string) =>
  Promise.resolve({
    detail: {},
    genericArticleIds: [],
    shippingProfile: PROFILES[articleNumber],
  });

const articles = { getArticleDetails: jest.fn(readArticle) };

const LINE = {
  brandId: '30',
  quantity: 1,
  brandName: 'BOSCH',
  brandLogoUrl: null,
  description: 'Part',
  thumbnailUrl: null,
  addedAtPriceIncVat: null,
};

describe('Delivery (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const mintedTokens: string[] = [];

  beforeAll(async () => {
    app = await createTestApp((builder) => {
      builder.overrideProvider(EcontTransport).useValue(econt);
      builder.overrideProvider(ArticlesTecDoc).useValue(articles);
      builder.overrideProvider(InventoryService).useValue(inventory);
    });
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.cart.deleteMany({ where: { token: { in: mintedTokens } } });
    await app.close();
  });

  beforeEach(() => {
    resetRateLimits(app);
    articles.getArticleDetails.mockImplementation(readArticle);
  });

  async function openCart(...articleNumbers: string[]): Promise<string> {
    const [first, ...rest] = articleNumbers;
    const response = await request(app.getHttpServer())
      .post('/cart/items')
      .send({ ...LINE, articleNumber: first })
      .expect(201);
    const token: string = response.headers[CART_TOKEN_HEADER];
    mintedTokens.push(token);

    for (const articleNumber of rest) {
      await request(app.getHttpServer())
        .post('/cart/items')
        .set(CART_TOKEN_HEADER, token)
        .send({ ...LINE, articleNumber })
        .expect(201);
    }

    return token;
  }

  describe('GET /delivery/offices', () => {
    it('lists Econt offices and lockers', async () => {
      const response = await request(app.getHttpServer())
        .get('/delivery/offices')
        .query({ carrier: ShippingMethod.ECONT })
        .expect(200);

      expect(response.body).toHaveLength(2);
      expect(response.body[1]).toMatchObject({
        code: '9010',
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

  describe('GET /delivery/parcel', () => {
    it('weighs the cart and keeps an unboxed part out of a locker', async () => {
      const token = await openCart('FILTER', 'PAD');

      const response = await request(app.getHttpServer())
        .get('/delivery/parcel')
        .query({ carrier: ShippingMethod.ECONT })
        .set(CART_TOKEN_HEADER, token)
        .expect(200);

      expect(response.body).toEqual({
        weightGrams: 47 + 2000,
        unmeasuredArticles: [],
        isLockerEligible: false,
      });
    });

    it('gives no weight for a part with none, and names it', async () => {
      const token = await openCart('FILTER', 'DISC');

      const response = await request(app.getHttpServer())
        .get('/delivery/parcel')
        .query({ carrier: ShippingMethod.ECONT })
        .set(CART_TOKEN_HEADER, token)
        .expect(200);

      expect(response.body).toEqual({
        weightGrams: null,
        unmeasuredArticles: [{ brandId: '30', articleNumber: 'DISC' }],
        isLockerEligible: false,
      });
    });

    it('weighs from the cart alone, without reading the catalogue', async () => {
      const token = await openCart('FILTER', 'PAD');
      await app.get<Redis>(REDIS_CLIENT).flushall();
      articles.getArticleDetails.mockRejectedValue(
        new CatalogUnavailableException(),
      );

      const response = await request(app.getHttpServer())
        .get('/delivery/parcel')
        .query({ carrier: ShippingMethod.ECONT })
        .set(CART_TOKEN_HEADER, token)
        .expect(200);

      expect(response.body.weightGrams).toBe(47 + 2000);
    });

    it('refuses to weigh a cart with nothing in it', async () => {
      const response = await request(app.getHttpServer())
        .get('/delivery/parcel')
        .query({ carrier: ShippingMethod.ECONT })
        .expect(422);

      expect(response.body).toEqual({
        statusCode: 422,
        errorCode: AppErrorCode.CART_EMPTY,
      });
    });
  });

  describe('GET /delivery/parcel without a carrier', () => {
    it('is refused, since locker eligibility depends on the carrier', async () => {
      const token = await openCart('FILTER');

      await request(app.getHttpServer())
        .get('/delivery/parcel')
        .set(CART_TOKEN_HEADER, token)
        .expect(400);
    });
  });

  describe('POST /delivery/quote', () => {
    it('prices the cart to an office', async () => {
      const token = await openCart('FILTER', 'PAD');

      const response = await request(app.getHttpServer())
        .post('/delivery/quote')
        .set(CART_TOKEN_HEADER, token)
        .send({ carrier: ShippingMethod.ECONT, officeCode: '9035' })
        .expect(200);

      expect(response.body).toMatchObject({
        carrier: ShippingMethod.ECONT,
        officeCode: '9035',
        priceIncVatCents: 413,
        expectedDeliveryDate: '2026-09-24',
        cartVersion: expect.any(Number),
      });
    });

    it('hands Econt the parcel on the day its slowest part is at the shop', async () => {
      const token = await openCart('FILTER', 'PAD');
      await app.get<Redis>(REDIS_CLIENT).flushall();
      econt.call.mockClear();

      await request(app.getHttpServer())
        .post('/delivery/quote')
        .set(CART_TOKEN_HEADER, token)
        .send({ carrier: ShippingMethod.ECONT, officeCode: '9035' })
        .expect(200);

      expect(econt.call).toHaveBeenCalledWith(
        'Shipments/LabelService.createLabel',
        expect.objectContaining({
          label: expect.objectContaining({ sendDate: '2026-09-29' }),
        }),
      );
    });

    it('prices a locker for a parcel that fits one', async () => {
      const token = await openCart('FILTER');

      await request(app.getHttpServer())
        .post('/delivery/quote')
        .set(CART_TOKEN_HEADER, token)
        .send({ carrier: ShippingMethod.ECONT, officeCode: '9010' })
        .expect(200);
    });

    it('refuses a parcel holding a part with no weight', async () => {
      const token = await openCart('FILTER', 'DISC');
      econt.call.mockClear();

      const response = await request(app.getHttpServer())
        .post('/delivery/quote')
        .set(CART_TOKEN_HEADER, token)
        .send({ carrier: ShippingMethod.ECONT, officeCode: '9035' })
        .expect(422);

      expect(response.body).toEqual({
        statusCode: 422,
        errorCode: AppErrorCode.DELIVERY_PARCEL_UNMEASURED,
      });
      expect(econt.call).not.toHaveBeenCalled();
    });

    it('refuses a locker for a parcel that cannot be shown to fit', async () => {
      const token = await openCart('PAD');

      const response = await request(app.getHttpServer())
        .post('/delivery/quote')
        .set(CART_TOKEN_HEADER, token)
        .send({ carrier: ShippingMethod.ECONT, officeCode: '9010' })
        .expect(422);

      expect(response.body).toEqual({
        statusCode: 422,
        errorCode: AppErrorCode.DELIVERY_LOCKER_INELIGIBLE,
      });
    });

    it('refuses an office Econt does not list', async () => {
      const token = await openCart('FILTER');

      const response = await request(app.getHttpServer())
        .post('/delivery/quote')
        .set(CART_TOKEN_HEADER, token)
        .send({ carrier: ShippingMethod.ECONT, officeCode: '0000' })
        .expect(404);

      expect(response.body.errorCode).toBe(
        AppErrorCode.DELIVERY_OFFICE_NOT_FOUND,
      );
    });

    it('refuses to price a cart with nothing selected', async () => {
      const token = await openCart('FILTER');
      await request(app.getHttpServer())
        .post('/cart/selection')
        .set(CART_TOKEN_HEADER, token)
        .send({ isSelected: false })
        .expect(200);
      econt.call.mockClear();

      const response = await request(app.getHttpServer())
        .post('/delivery/quote')
        .set(CART_TOKEN_HEADER, token)
        .send({ carrier: ShippingMethod.ECONT, officeCode: '9035' })
        .expect(422);

      expect(response.body.errorCode).toBe(AppErrorCode.CART_EMPTY);
      expect(econt.call).not.toHaveBeenCalled();
    });

    it('applies the quote-specific limit rather than the site-wide one', async () => {
      const token = await openCart('FILTER');

      const response = await request(app.getHttpServer())
        .post('/delivery/quote')
        .set(CART_TOKEN_HEADER, token)
        .send({ carrier: ShippingMethod.ECONT, officeCode: '9035' })
        .expect(200);

      expect(response.headers['x-ratelimit-limit']).toBe('20');
    });

    it('validates the request body', async () => {
      await request(app.getHttpServer())
        .post('/delivery/quote')
        .send({ carrier: ShippingMethod.ECONT })
        .expect(400);
    });
  });
});
