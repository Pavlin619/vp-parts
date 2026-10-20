import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  AppErrorCode,
  CART_TOKEN_HEADER,
  DELIVERY_ADDRESS_LIMITS,
  ShippingMethod,
} from '@vp-parts-shop/shared';
import { createTestApp, resetRateLimits } from './helpers/create-test-app';
import {
  addressTo,
  econt,
  officeTo,
  SIX_PM,
  SOFIA_ADDRESS,
  SOFIA_ID,
} from './helpers/econt-fake';
import type Redis from 'ioredis';
import { ArticlesTecDoc, CrossReferencesTecDoc } from '../src/catalog';
import {
  EcontRefusedException,
  EcontTransport,
} from '../src/delivery/econt/econt.transport';
import { InventoryService, SupplierCatalogRepository } from '../src/inventory';
import { PrismaService } from '../src/prisma';
import { REDIS_CLIENT } from '../src/redis';
import { CatalogUnavailableException } from '../src/tecdoc';

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
  EQUIVALENT_DISC: { weightGrams: null, packageCm: null },
};

const BRAKE_DISC = 82;
const BUMPER = 9001;
const BUMPER_WEIGHT_GRAMS = 3000;

function genericArticleIdsOf(articleNumber: string): number[] {
  if (articleNumber === 'EQUIVALENT_DISC') {
    return [BRAKE_DISC];
  }

  return articleNumber === 'DISC' ? [BUMPER] : [];
}

const readArticle = (_brandId: number, articleNumber: string) =>
  Promise.resolve({
    detail: {},
    genericArticleIds: genericArticleIdsOf(articleNumber),
    shippingProfile: PROFILES[articleNumber],
  });

/** Three parts citing EQUIVALENT_DISC, which the supplier catalogue weighs. */
const EQUIVALENT_NUMBERS = ['DF1', 'DF2', 'DF3'];

const crossReferences = {
  getCrossReferenceCandidates: jest.fn(() =>
    Promise.resolve(
      EQUIVALENT_NUMBERS.map((articleNumber) => ({
        brandId: '101',
        brandName: 'FERODO',
        articleNumber,
        description: 'Спирачен диск',
        legacyArticleIds: [],
        articleStatusId: 1,
        citedNumbers: [{ brandId: '30', articleNumber: 'EQUIVALENT_DISC' }],
      })),
    ),
  ),
};

const EQUIVALENT_BOX = { length: 30, width: 30, height: 6 };

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

describe('Checkout (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const mintedTokens: string[] = [];

  beforeAll(async () => {
    app = await createTestApp((builder) => {
      builder.overrideProvider(EcontTransport).useValue(econt);
      builder.overrideProvider(ArticlesTecDoc).useValue(articles);
      builder.overrideProvider(InventoryService).useValue(inventory);
      builder.overrideProvider(CrossReferencesTecDoc).useValue(crossReferences);
    });
    prisma = app.get(PrismaService);
    await prisma.productTypeParcelProfile.create({
      data: {
        genericArticleId: BUMPER,
        productTypeName: 'Бронь',
        weightGrams: BUMPER_WEIGHT_GRAMS,
        sampleSize: 5,
        computedAt: new Date(),
      },
    });
    jest
      .spyOn(app.get(SupplierCatalogRepository), 'findPackageProfiles')
      .mockImplementation((identities) =>
        Promise.resolve(
          identities
            .filter(({ articleNumber }) =>
              EQUIVALENT_NUMBERS.includes(articleNumber),
            )
            .map((_, index) => ({
              weightGrams: 6600 + index * 100,
              packageCm: EQUIVALENT_BOX,
            })),
        ),
      );
  });

  afterAll(async () => {
    await prisma.cart.deleteMany({ where: { token: { in: mintedTokens } } });
    await prisma.productTypeParcelProfile.deleteMany({
      where: { genericArticleId: BUMPER },
    });
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

  describe('GET /checkout/parcel', () => {
    it('weighs the cart and keeps an unboxed part out of a locker', async () => {
      const token = await openCart('FILTER', 'PAD');

      const response = await request(app.getHttpServer())
        .get('/checkout/parcel')
        .query({ carrier: ShippingMethod.ECONT })
        .set(CART_TOKEN_HEADER, token)
        .expect(200);

      expect(response.body).toEqual({
        weightGrams: 47 + 2000,
        isLockerEligible: false,
      });
    });

    it('weighs a part nothing else weighs by its product type, out of a locker', async () => {
      const token = await openCart('FILTER', 'DISC');

      const response = await request(app.getHttpServer())
        .get('/checkout/parcel')
        .query({ carrier: ShippingMethod.ECONT })
        .set(CART_TOKEN_HEADER, token)
        .expect(200);

      expect(response.body).toEqual({
        weightGrams: 47 + BUMPER_WEIGHT_GRAMS,
        isLockerEligible: false,
      });
    });

    it('estimates a part from its equivalents and keeps it out of a locker', async () => {
      const token = await openCart('EQUIVALENT_DISC');

      const stored = await prisma.cartItem.findFirstOrThrow({
        where: { cart: { token }, articleNumber: 'EQUIVALENT_DISC' },
      });
      expect(stored).toMatchObject({
        weightGrams: 6700,
        packageLengthCm: 30,
        isShippingEstimated: true,
      });

      const response = await request(app.getHttpServer())
        .get('/checkout/parcel')
        .query({ carrier: ShippingMethod.ECONT })
        .set(CART_TOKEN_HEADER, token)
        .expect(200);

      expect(response.body).toEqual({
        weightGrams: 6700,
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
        .get('/checkout/parcel')
        .query({ carrier: ShippingMethod.ECONT })
        .set(CART_TOKEN_HEADER, token)
        .expect(200);

      expect(response.body.weightGrams).toBe(47 + 2000);
    });

    it('refuses to weigh a cart with nothing in it', async () => {
      const response = await request(app.getHttpServer())
        .get('/checkout/parcel')
        .query({ carrier: ShippingMethod.ECONT })
        .expect(422);

      expect(response.body).toEqual({
        statusCode: 422,
        errorCode: AppErrorCode.CART_EMPTY,
      });
    });
  });

  describe('GET /checkout/parcel without a carrier', () => {
    it('is refused, since locker eligibility depends on the carrier', async () => {
      const token = await openCart('FILTER');

      await request(app.getHttpServer())
        .get('/checkout/parcel')
        .set(CART_TOKEN_HEADER, token)
        .expect(400);
    });
  });

  describe('POST /checkout/quote', () => {
    it('prices the cart to an office', async () => {
      const token = await openCart('FILTER', 'PAD');

      const response = await request(app.getHttpServer())
        .post('/checkout/quote')
        .set(CART_TOKEN_HEADER, token)
        .send({
          carrier: ShippingMethod.ECONT,
          destination: officeTo('9035'),
          isCashOnDelivery: false,
        })
        .expect(200);

      expect(response.body).toMatchObject({
        carrier: ShippingMethod.ECONT,
        destination: officeTo('9035'),
        priceIncVatCents: 413,
        expectedDeliveryDate: '2026-09-24',
        cartVersion: expect.any(Number),
      });
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('hands Econt the parcel on the day its slowest part is at the shop', async () => {
      const token = await openCart('FILTER', 'PAD');
      await app.get<Redis>(REDIS_CLIENT).flushall();
      econt.call.mockClear();

      await request(app.getHttpServer())
        .post('/checkout/quote')
        .set(CART_TOKEN_HEADER, token)
        .send({
          carrier: ShippingMethod.ECONT,
          destination: officeTo('9035'),
          isCashOnDelivery: false,
        })
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
        .post('/checkout/quote')
        .set(CART_TOKEN_HEADER, token)
        .send({
          carrier: ShippingMethod.ECONT,
          destination: officeTo('9010'),
          isCashOnDelivery: false,
        })
        .expect(200);
    });

    it('prices an office for a parcel weighed from equivalents', async () => {
      const token = await openCart('EQUIVALENT_DISC');

      const response = await request(app.getHttpServer())
        .post('/checkout/quote')
        .set(CART_TOKEN_HEADER, token)
        .send({
          carrier: ShippingMethod.ECONT,
          destination: officeTo('9035'),
          isCashOnDelivery: false,
        })
        .expect(200);

      expect(response.body.parcel.weightGrams).toBe(6700);
    });

    it('refuses a locker for a parcel weighed from equivalents', async () => {
      const token = await openCart('EQUIVALENT_DISC');

      const response = await request(app.getHttpServer())
        .post('/checkout/quote')
        .set(CART_TOKEN_HEADER, token)
        .send({
          carrier: ShippingMethod.ECONT,
          destination: officeTo('9010'),
          isCashOnDelivery: false,
        })
        .expect(422);

      expect(response.body).toEqual({
        statusCode: 422,
        errorCode: AppErrorCode.DELIVERY_LOCKER_INELIGIBLE,
      });
    });

    it('refuses a locker for a parcel that cannot be shown to fit', async () => {
      const token = await openCart('PAD');

      const response = await request(app.getHttpServer())
        .post('/checkout/quote')
        .set(CART_TOKEN_HEADER, token)
        .send({
          carrier: ShippingMethod.ECONT,
          destination: officeTo('9010'),
          isCashOnDelivery: false,
        })
        .expect(422);

      expect(response.body).toEqual({
        statusCode: 422,
        errorCode: AppErrorCode.DELIVERY_LOCKER_INELIGIBLE,
      });
    });

    it('refuses an office Econt does not list', async () => {
      const token = await openCart('FILTER');

      const response = await request(app.getHttpServer())
        .post('/checkout/quote')
        .set(CART_TOKEN_HEADER, token)
        .send({
          carrier: ShippingMethod.ECONT,
          destination: officeTo('0000'),
          isCashOnDelivery: false,
        })
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
        .post('/checkout/quote')
        .set(CART_TOKEN_HEADER, token)
        .send({
          carrier: ShippingMethod.ECONT,
          destination: officeTo('9035'),
          isCashOnDelivery: false,
        })
        .expect(422);

      expect(response.body.errorCode).toBe(AppErrorCode.CART_EMPTY);
      expect(econt.call).not.toHaveBeenCalled();
    });

    it('applies the quote-specific limit rather than the site-wide one', async () => {
      const token = await openCart('FILTER');

      const response = await request(app.getHttpServer())
        .post('/checkout/quote')
        .set(CART_TOKEN_HEADER, token)
        .send({
          carrier: ShippingMethod.ECONT,
          destination: officeTo('9035'),
          isCashOnDelivery: false,
        })
        .expect(200);

      expect(response.headers['x-ratelimit-limit']).toBe('20');
    });

    it('validates the request body', async () => {
      await request(app.getHttpServer())
        .post('/checkout/quote')
        .send({ carrier: ShippingMethod.ECONT })
        .expect(400);
    });

    describe('cash on delivery', () => {
      function pricedWithFee(feeEuros: number) {
        return {
          label: {
            totalPrice: 4.13 + feeEuros,
            currency: 'EUR',
            expectedDeliveryDate: SIX_PM,
            services: [
              { type: 'C', price: 4.13, currency: 'EUR' },
              { type: 'CD', price: feeEuros, currency: 'EUR' },
            ],
          },
        };
      }

      it('adds the fee for collecting the money at the door', async () => {
        const token = await openCart('FILTER', 'PAD');
        await app.get<Redis>(REDIS_CLIENT).flushall();
        econt.call.mockClear();
        econt.call
          .mockResolvedValueOnce(pricedWithFee(0.05))
          .mockResolvedValueOnce(pricedWithFee(0.07));

        const response = await request(app.getHttpServer())
          .post('/checkout/quote')
          .set(CART_TOKEN_HEADER, token)
          .send({
            carrier: ShippingMethod.ECONT,
            destination: officeTo('9035'),
            isCashOnDelivery: true,
          })
          .expect(200);

        expect(response.body).toMatchObject({
          priceIncVatCents: 413,
          cashOnDeliveryFeeIncVatCents: 7,
        });
        expect(econt.call).toHaveBeenLastCalledWith(
          'Shipments/LabelService.createLabel',
          expect.objectContaining({
            label: expect.objectContaining({
              services: { cdAmount: 4.42, cdType: 'get', cdCurrency: 'EUR' },
            }),
          }),
        );
      });

      it('answers no fee when the customer pays otherwise', async () => {
        const token = await openCart('FILTER');

        const response = await request(app.getHttpServer())
          .post('/checkout/quote')
          .set(CART_TOKEN_HEADER, token)
          .send({
            carrier: ShippingMethod.ECONT,
            destination: officeTo('9035'),
            isCashOnDelivery: false,
          })
          .expect(200);

        expect(response.body.cashOnDeliveryFeeIncVatCents).toBeNull();
      });

      it('refuses a request that does not say how the customer pays', async () => {
        const token = await openCart('FILTER');

        await request(app.getHttpServer())
          .post('/checkout/quote')
          .set(CART_TOKEN_HEADER, token)
          .send({
            carrier: ShippingMethod.ECONT,
            destination: officeTo('9035'),
          })
          .expect(400);
      });
    });

    describe('to an address', () => {
      it('prices the cart to a place Econt delivers to', async () => {
        const token = await openCart('FILTER', 'PAD');
        econt.call.mockClear();

        const response = await request(app.getHttpServer())
          .post('/checkout/quote')
          .set(CART_TOKEN_HEADER, token)
          .send({
            carrier: ShippingMethod.ECONT,
            destination: addressTo(),
            isCashOnDelivery: false,
          })
          .expect(200);

        expect(response.body).toMatchObject({
          destination: addressTo(),
          priceIncVatCents: 413,
        });
        expect(econt.call).toHaveBeenCalledWith(
          'Shipments/LabelService.createLabel',
          expect.objectContaining({
            label: expect.objectContaining({
              receiverAddress: expect.objectContaining({
                city: { id: SOFIA_ID },
              }),
            }),
          }),
        );
      });

      it('refuses an address Econt refuses', async () => {
        const token = await openCart('FILTER');
        await app.get<Redis>(REDIS_CLIENT).flushall();
        econt.call.mockRejectedValueOnce(
          new EcontRefusedException({
            type: 'ExInvalidParam',
            message: 'получател: ',
          }),
        );

        const response = await request(app.getHttpServer())
          .post('/checkout/quote')
          .set(CART_TOKEN_HEADER, token)
          .send({
            carrier: ShippingMethod.ECONT,
            destination: addressTo(),
            isCashOnDelivery: false,
          })
          .expect(422);

        expect(response.body).toEqual({
          statusCode: 422,
          errorCode: AppErrorCode.DELIVERY_ADDRESS_REFUSED,
        });
      });

      it('refuses a place couriers do not deliver to without asking Econt', async () => {
        const token = await openCart('FILTER');
        econt.call.mockClear();

        const response = await request(app.getHttpServer())
          .post('/checkout/quote')
          .set(CART_TOKEN_HEADER, token)
          .send({
            carrier: ShippingMethod.ECONT,
            isCashOnDelivery: false,
            destination: addressTo({ ...SOFIA_ADDRESS, placeId: '999999' }),
          })
          .expect(422);

        expect(response.body.errorCode).toBe(
          AppErrorCode.DELIVERY_ADDRESS_NOT_SERVED,
        );
        expect(econt.call).not.toHaveBeenCalled();
      });

      it('refuses an address naming neither a street nor a quarter', async () => {
        const token = await openCart('FILTER');

        await request(app.getHttpServer())
          .post('/checkout/quote')
          .set(CART_TOKEN_HEADER, token)
          .send({
            carrier: ShippingMethod.ECONT,
            isCashOnDelivery: false,
            destination: addressTo({ placeId: String(SOFIA_ID) }),
          })
          .expect(400);
      });

      it('refuses a street without its number', async () => {
        const token = await openCart('FILTER');

        await request(app.getHttpServer())
          .post('/checkout/quote')
          .set(CART_TOKEN_HEADER, token)
          .send({
            carrier: ShippingMethod.ECONT,
            isCashOnDelivery: false,
            destination: addressTo({
              placeId: String(SOFIA_ID),
              street: 'бул. Витоша',
            }),
          })
          .expect(400);
      });

      it('takes a quarter with where in it instead of a street', async () => {
        const token = await openCart('FILTER');

        await request(app.getHttpServer())
          .post('/checkout/quote')
          .set(CART_TOKEN_HEADER, token)
          .send({
            carrier: ShippingMethod.ECONT,
            isCashOnDelivery: false,
            destination: addressTo({
              placeId: String(SOFIA_ID),
              quarter: 'кв. Слатина',
              block: '5',
            }),
          })
          .expect(200);
      });

      it('refuses a note longer than the address allows', async () => {
        const token = await openCart('FILTER');

        await request(app.getHttpServer())
          .post('/checkout/quote')
          .set(CART_TOKEN_HEADER, token)
          .send({
            carrier: ShippingMethod.ECONT,
            isCashOnDelivery: false,
            destination: addressTo({
              placeId: String(SOFIA_ID),
              street: 'бул. Витоша',
              streetNumber: '10',
              note: 'а'.repeat(DELIVERY_ADDRESS_LIMITS.note + 1),
            }),
          })
          .expect(400);
      });

      it('refuses a destination of an unknown type', async () => {
        const token = await openCart('FILTER');

        await request(app.getHttpServer())
          .post('/checkout/quote')
          .set(CART_TOKEN_HEADER, token)
          .send({
            carrier: ShippingMethod.ECONT,
            isCashOnDelivery: false,
            destination: { type: 'HOME', officeCode: '9035' },
          })
          .expect(400);
      });
    });
  });
});
