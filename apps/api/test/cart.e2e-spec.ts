import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  AppErrorCode,
  CART_TOKEN_HEADER,
  CartDto,
  MAX_CART_LINES,
} from '@vp-parts-shop/shared';
import { createTestApp, resetRateLimits } from './helpers/create-test-app';
import { ArticleNotFoundException, ArticlesTecDoc } from '../src/catalog';
import { PrismaService } from '../src/prisma';

const LINE = {
  brandId: '30',
  articleNumber: '0986479061',
  quantity: 2,
  brandName: 'BOSCH',
  brandLogoUrl: null,
  description: 'Спирачен диск',
  thumbnailUrl: null,
  addedAtPriceIncVat: 4500,
};

const UNKNOWN_ARTICLE = 'NOT-IN-TECDOC';

const articles = {
  getArticleDetails: (_brandId: number, articleNumber: string) =>
    articleNumber === UNKNOWN_ARTICLE
      ? Promise.reject(new ArticleNotFoundException())
      : Promise.resolve({
          detail: {},
          genericArticleIds: [],
          shippingProfile: {
            weightGrams: 2000,
            packageCm: { length: 30, width: 20, height: 7.5 },
          },
        }),
};

describe('Cart (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const mintedTokens: string[] = [];

  beforeAll(async () => {
    app = await createTestApp((builder) => {
      builder.overrideProvider(ArticlesTecDoc).useValue(articles);
    });
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.cart.deleteMany({ where: { token: { in: mintedTokens } } });
    await app.close();
  });

  beforeEach(() => resetRateLimits(app));

  /** Adds one line to a brand-new cart and returns the token it minted. */
  async function openCart(
    overrides: Partial<typeof LINE> = {},
  ): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/cart/items')
      .send({ ...LINE, ...overrides })
      .expect(201);

    const token = response.headers[CART_TOKEN_HEADER];
    mintedTokens.push(token);

    return token;
  }

  const withToken = (token: string) => (agent: request.Test) =>
    agent.set(CART_TOKEN_HEADER, token);

  describe('a visitor with no cart', () => {
    it('reads an empty cart', async () => {
      const response = await request(app.getHttpServer())
        .get('/cart')
        .expect(200);

      expect(response.body).toEqual({ id: '', version: 0, lines: [] });
    });

    it('is not given a cart just for looking', async () => {
      const before = await prisma.cart.count();

      await request(app.getHttpServer()).get('/cart').expect(200);

      expect(await prisma.cart.count()).toBe(before);
    });

    it('is never handed a token on a read', async () => {
      const response = await request(app.getHttpServer())
        .get('/cart')
        .expect(200);

      expect(response.headers[CART_TOKEN_HEADER]).toBeUndefined();
    });
  });

  describe('the first add', () => {
    it('mints a cart and returns its token in a header', async () => {
      const response = await request(app.getHttpServer())
        .post('/cart/items')
        .send(LINE)
        .expect(201);

      const token = response.headers[CART_TOKEN_HEADER];
      mintedTokens.push(token);

      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect((response.body as CartDto).lines).toHaveLength(1);
      expect((response.body as CartDto).version).toBe(1);
    });

    it('stores what the catalogue says the part weighs', async () => {
      const token = await openCart();

      const item = await prisma.cartItem.findFirstOrThrow({
        where: { cart: { token } },
      });

      expect(item).toMatchObject({
        weightGrams: 2000,
        packageLengthCm: 30,
        packageWidthCm: 20,
        packageHeightCm: 7.5,
      });
    });

    it('refuses a part the catalogue does not know, and mints no cart', async () => {
      const before = await prisma.cart.count();

      const response = await request(app.getHttpServer())
        .post('/cart/items')
        .send({ ...LINE, articleNumber: UNKNOWN_ARTICLE })
        .expect(404);

      expect(response.body).toEqual({
        statusCode: 404,
        errorCode: AppErrorCode.ARTICLE_NOT_FOUND,
      });
      expect(response.headers[CART_TOKEN_HEADER]).toBeUndefined();
      expect(await prisma.cart.count()).toBe(before);
    });

    it('never prices the cart it returns', async () => {
      const token = await openCart();
      const response = await withToken(token)(
        request(app.getHttpServer()).get('/cart'),
      ).expect(200);

      const [line] = (response.body as CartDto).lines;
      expect(line).toEqual({
        brandId: '30',
        articleNumber: '0986479061',
        brandName: 'BOSCH',
        brandLogoUrl: null,
        description: 'Спирачен диск',
        thumbnailUrl: null,
        quantity: 2,
        isSelected: true,
        addedAtPriceIncVat: 4500,
        addedAt: expect.any(String),
      });
    });

    it('is never cached', async () => {
      const response = await request(app.getHttpServer())
        .get('/cart')
        .expect(200);

      expect(response.headers['cache-control']).toBe('no-store');
    });
  });

  describe('a token in hand', () => {
    it('reads back the same cart', async () => {
      const token = await openCart();

      const response = await withToken(token)(
        request(app.getHttpServer()).get('/cart'),
      ).expect(200);

      expect((response.body as CartDto).lines).toHaveLength(1);
    });

    it('does not reach another visitor’s cart', async () => {
      const mine = await openCart();
      const theirs = await openCart({ articleNumber: 'OTHER-VISITOR' });

      const response = await withToken(theirs)(
        request(app.getHttpServer()).get('/cart'),
      ).expect(200);

      expect(response.body).not.toMatchObject({ id: mine });
      expect((response.body as CartDto).lines[0].articleNumber).toBe(
        'OTHER-VISITOR',
      );
    });

    it('raises an existing line rather than adding a second one', async () => {
      const token = await openCart();

      const response = await withToken(token)(
        request(app.getHttpServer()).post('/cart/items'),
      )
        .send({ ...LINE, quantity: 3 })
        .expect(201);

      expect((response.body as CartDto).lines).toHaveLength(1);
      expect((response.body as CartDto).lines[0].quantity).toBe(5);
      expect(response.headers[CART_TOKEN_HEADER]).toBeUndefined();
    });

    it('keeps the same number under two brands apart', async () => {
      const token = await openCart();

      const response = await withToken(token)(
        request(app.getHttpServer()).post('/cart/items'),
      )
        .send({ ...LINE, brandId: '77', brandName: 'MAHLE' })
        .expect(201);

      expect((response.body as CartDto).lines).toHaveLength(2);
    });

    it('raises the version on every change', async () => {
      const token = await openCart();

      const patched = await withToken(token)(
        request(app.getHttpServer()).patch('/cart/items/30/0986479061'),
      )
        .send({ quantity: 4 })
        .expect(200);

      expect((patched.body as CartDto).version).toBe(2);
      expect((patched.body as CartDto).lines[0].quantity).toBe(4);
    });

    it('deselects a line without removing it', async () => {
      const token = await openCart();

      const response = await withToken(token)(
        request(app.getHttpServer()).patch('/cart/items/30/0986479061'),
      )
        .send({ isSelected: false })
        .expect(200);

      expect((response.body as CartDto).lines[0].isSelected).toBe(false);
    });

    it('sets every line at once', async () => {
      const token = await openCart();
      await withToken(token)(request(app.getHttpServer()).post('/cart/items'))
        .send({ ...LINE, brandId: '77', brandName: 'MAHLE' })
        .expect(201);

      const response = await withToken(token)(
        request(app.getHttpServer()).post('/cart/selection'),
      )
        .send({ isSelected: false })
        .expect(200);

      expect(
        (response.body as CartDto).lines.every((line) => !line.isSelected),
      ).toBe(true);
    });

    it('removes a line', async () => {
      const token = await openCart();

      const response = await withToken(token)(
        request(app.getHttpServer()).delete('/cart/items/30/0986479061'),
      ).expect(200);

      expect((response.body as CartDto).lines).toEqual([]);
    });

    it('clears the cart', async () => {
      const token = await openCart();

      const response = await withToken(token)(
        request(app.getHttpServer()).delete('/cart'),
      ).expect(200);

      expect((response.body as CartDto).lines).toEqual([]);
    });

    it('reports a patch against a line that is gone', async () => {
      const token = await openCart();

      const response = await withToken(token)(
        request(app.getHttpServer()).patch('/cart/items/30/NOT-IN-CART'),
      )
        .send({ quantity: 2 })
        .expect(404);

      expect(response.body).toMatchObject({
        errorCode: AppErrorCode.CART_ITEM_NOT_FOUND,
      });
    });
  });

  describe('the line limit', () => {
    it('refuses the line past the cap and keeps the rest', async () => {
      const token = await openCart({ articleNumber: 'CAP-0' });

      for (let index = 1; index < MAX_CART_LINES; index += 1) {
        resetRateLimits(app);
        await withToken(token)(request(app.getHttpServer()).post('/cart/items'))
          .send({ ...LINE, articleNumber: `CAP-${index}` })
          .expect(201);
      }

      resetRateLimits(app);
      const refused = await withToken(token)(
        request(app.getHttpServer()).post('/cart/items'),
      )
        .send({ ...LINE, articleNumber: 'ONE-TOO-MANY' })
        .expect(409);

      expect(refused.body).toMatchObject({ errorCode: AppErrorCode.CART_FULL });

      resetRateLimits(app);
      const cart = await withToken(token)(
        request(app.getHttpServer()).get('/cart'),
      ).expect(200);
      expect((cart.body as CartDto).lines).toHaveLength(MAX_CART_LINES);
    }, 30_000);
  });

  describe('input the route will not take', () => {
    it('refuses a brand id that is not a TecDoc data supplier', async () => {
      await request(app.getHttpServer())
        .post('/cart/items')
        .send({ ...LINE, brandId: 'bosch' })
        .expect(400);
    });

    it('refuses a quantity past the line ceiling', async () => {
      await request(app.getHttpServer())
        .post('/cart/items')
        .send({ ...LINE, quantity: 100 })
        .expect(400);
    });

    it('refuses a patch that changes nothing', async () => {
      const token = await openCart();

      await withToken(token)(
        request(app.getHttpServer()).patch('/cart/items/30/0986479061'),
      )
        .send({})
        .expect(404);
    });

    it('ignores a cart token that is not one of ours', async () => {
      const response = await request(app.getHttpServer())
        .get('/cart')
        .set(CART_TOKEN_HEADER, "'; DROP TABLE cart; --")
        .expect(200);

      expect(response.body).toEqual({ id: '', version: 0, lines: [] });
    });
  });

  describe('adopt', () => {
    it('refuses an adopt from someone who is not signed in', async () => {
      const token = await openCart();

      await withToken(token)(
        request(app.getHttpServer()).post('/cart/adopt'),
      ).expect(401);
    });
  });
});
