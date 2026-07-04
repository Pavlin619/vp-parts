import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers/create-test-app';
import { AutopartsRepository } from '../src/inventory/autoparts.repository';
import { SupplierStockRepository } from '../src/inventory/supplier-stock.repository';
import { DeliverySpeedResolver } from '../src/inventory/delivery-speed.resolver';
import { DeliveryRule, outcomeForStatus } from '../src/inventory/delivery';
import { StockStatus } from '@vp-parts-shop/shared';
import { ClerkJwtStrategy } from '../src/auth/clerk-jwt.strategy';

const ownFindByNumber = jest.fn();
const supplierFindByNumber = jest.fn();

const mockAutopartsRepository = {
  findByTecdocNumber: ownFindByNumber,
  findByTecdocNumbers: jest.fn(),
};

const mockSupplierStockRepository = {
  findByTecdocNumber: supplierFindByNumber,
  findByTecdocNumbers: jest.fn(),
};

// Deterministic delivery mapping for the e2e: known suppliers ship within the
// hour so the own-stock-first path is exercised predictably; an unknown
// supplier resolves to null so the drop-and-treat-as-out-of-stock path is too.
const mockDeliverySpeedResolver = {
  resolve: (source: string) =>
    source === 'MYSTERY'
      ? null
      : {
          rule: DeliveryRule.WITHIN_HOUR,
          outcome: outcomeForStatus(StockStatus.DELIVERY_WITHIN_HOUR),
        },
};

// Drives the real JwtGuard without calling Clerk: the returned payload is what
// the guard reads to populate request.user (clerkId + role).
const verifyToken = jest.fn();
const mockClerkJwtStrategy = { verifyToken };

describe('InventoryController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp((builder) => {
      builder
        .overrideProvider(AutopartsRepository)
        .useValue(mockAutopartsRepository);
      builder
        .overrideProvider(SupplierStockRepository)
        .useValue(mockSupplierStockRepository);
      builder
        .overrideProvider(DeliverySpeedResolver)
        .useValue(mockDeliverySpeedResolver);
      builder.overrideProvider(ClerkJwtStrategy).useValue(mockClerkJwtStrategy);
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    verifyToken.mockResolvedValue({ sub: 'clerk_test', publicMetadata: {} });
  });

  describe('GET /inventory/articles/:articleNumber/availability', () => {
    it('rejects unauthenticated requests with 401', async () => {
      await request(app.getHttpServer())
        .get('/inventory/articles/WL6340/availability')
        .expect(401);

      expect(ownFindByNumber).not.toHaveBeenCalled();
      expect(supplierFindByNumber).not.toHaveBeenCalled();
    });

    it('locks the price to our own stock and ships it immediately (IN_STOCK)', async () => {
      ownFindByNumber.mockResolvedValueOnce([
        {
          tecdocNumber: 'WL6340',
          availableQuantity: 4,
          sellPriceExVatCents: 5000,
          sellPriceIncVatCents: 6000,
        },
      ]);
      supplierFindByNumber.mockResolvedValueOnce([
        {
          supplierSource: 'INTERCARS',
          warehouseCode: 'B24',
          availability: 3,
          buyPriceCents: 4000,
          sellPriceCents: 5200,
          tecdocNumber: 'WL6340',
        },
      ]);

      const res = await request(app.getHttpServer())
        .get('/inventory/articles/WL6340/availability')
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      expect(res.body).toEqual({
        articleNumber: 'WL6340',
        available: true,
        stockStatus: 'IN_STOCK',
        estimatedDeliveryDays: 0,
        priceExVat: 5000,
        priceIncVat: 6000,
        // Own stock (4) + within-hour supplier (3) unite into Central, with
        // request-time delivery dates. Asserted loosely as they track the clock.
        availabilityByWarehouse: [
          expect.objectContaining({ warehouseId: 'CENTRAL', quantity: 7 }),
        ],
        computedAt: expect.any(String),
      });
    });

    it('never returns a cacheable response (Cache-Control: no-store)', async () => {
      ownFindByNumber.mockResolvedValueOnce([]);
      supplierFindByNumber.mockResolvedValueOnce([]);

      const res = await request(app.getHttpServer())
        .get('/inventory/articles/WL6340/availability')
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      expect(res.headers['cache-control']).toBe('no-store');
    });

    it('drops an unknown supplier/warehouse line and reports out of stock', async () => {
      ownFindByNumber.mockResolvedValueOnce([]);
      supplierFindByNumber.mockResolvedValueOnce([
        {
          supplierSource: 'MYSTERY',
          warehouseCode: 'XYZ',
          availability: 9,
          buyPriceCents: 4000,
          sellPriceCents: 5200,
          tecdocNumber: 'WL6340',
        },
      ]);

      const res = await request(app.getHttpServer())
        .get('/inventory/articles/WL6340/availability')
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      expect(res.body.available).toBe(false);
      expect(res.body.stockStatus).toBe('OUT_OF_STOCK');
      expect(res.body.availabilityByWarehouse).toEqual([]);
    });

    it('returns 503 INVENTORY_UNAVAILABLE when the live read fails', async () => {
      ownFindByNumber.mockRejectedValueOnce(new Error('db down'));
      supplierFindByNumber.mockResolvedValueOnce([]);

      const res = await request(app.getHttpServer())
        .get('/inventory/articles/WL6340/availability')
        .set('Authorization', 'Bearer test-token')
        .expect(503);

      expect(res.body.errorCode).toBe('INVENTORY_UNAVAILABLE');
    });
  });
});
