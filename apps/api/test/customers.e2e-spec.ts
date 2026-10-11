import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  AppErrorCode,
  CustomerProfileDto,
  ShippingMethod,
} from '@vp-parts-shop/shared';
import { createTestApp, resetRateLimits } from './helpers/create-test-app';
import { ClerkJwtStrategy } from '../src/auth/clerk-jwt.strategy';
import { ClerkUsers } from '../src/auth';
import { PrismaService } from '../src/prisma';

const RUN = `e2e-customers-${Date.now()}`;

/** A bearer token the fake strategy below accepts as the given Clerk user. */
const tokenFor = (clerkId: string) => `Bearer test:${clerkId}`;

const clerkJwtStrategy = {
  verifyToken: (token: string) =>
    token.startsWith('test:')
      ? Promise.resolve({ sub: token.slice('test:'.length) })
      : Promise.reject(new Error('invalid token')),
};

/** Set to make Clerk report another user's email, as a second account would. */
let emailOwner: string | null = null;

const clerkUsers = {
  findIdentity: (clerkId: string) =>
    Promise.resolve({
      email: `${emailOwner ?? clerkId}@example.com`,
      firstName: 'Иван',
      lastName: 'Петров',
    }),
};

const ADDRESS = {
  carrier: ShippingMethod.ECONT,
  placeId: '41',
  city: 'София',
  postCode: '1000',
  street: 'бул. Витоша',
  streetNumber: '60',
};

describe('Customers (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp((builder) => {
      builder.overrideProvider(ClerkJwtStrategy).useValue(clerkJwtStrategy);
      builder.overrideProvider(ClerkUsers).useValue(clerkUsers);
    });
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    const customers = { clerkId: { startsWith: RUN } };

    await prisma.address.deleteMany({ where: { customer: customers } });
    await prisma.cart.deleteMany({ where: { customer: customers } });
    await prisma.customer.deleteMany({ where: customers });
    await app.close();
  });

  beforeEach(() => resetRateLimits(app));

  it('refuses a visitor who is not signed in', async () => {
    const response = await request(app.getHttpServer())
      .get('/customers/me')
      .expect(401);

    expect(response.body).toEqual({
      statusCode: 401,
      errorCode: AppErrorCode.UNAUTHORIZED,
    });
  });

  it('tells a signed-in user with no customer row to complete their profile', async () => {
    const response = await request(app.getHttpServer())
      .get('/customers/me')
      .set('Authorization', tokenFor(`${RUN}-new`))
      .expect(404);

    expect(response.body.errorCode).toBe(
      AppErrorCode.CUSTOMER_PROFILE_INCOMPLETE,
    );
  });

  it('refuses a phone that is not a Bulgarian mobile', async () => {
    const response = await request(app.getHttpServer())
      .post('/customers/me')
      .set('Authorization', tokenFor(`${RUN}-landline`))
      .send({ phoneNumber: '02 987 6543' })
      .expect(400);

    expect(response.body.errorCode).toBe(AppErrorCode.VALIDATION_ERROR);
  });

  describe('registering', () => {
    const clerkId = `${RUN}-registered`;
    let created: CustomerProfileDto;

    beforeAll(async () => {
      const response = await request(app.getHttpServer())
        .post('/customers/me')
        .set('Authorization', tokenFor(clerkId))
        .send({ phoneNumber: '0888 123 456', address: ADDRESS })
        .expect(201);

      created = response.body as CustomerProfileDto;
    });

    it('files the customer under the identity Clerk holds', () => {
      expect(created).toMatchObject({
        email: `${clerkId}@example.com`,
        firstName: 'Иван',
        lastName: 'Петров',
        phoneNumber: '+359888123456',
        role: 'CUSTOMER',
      });
    });

    it('keeps the address as the default one', () => {
      expect(created.defaultAddress).toMatchObject(ADDRESS);
    });

    it('reads the same profile back', async () => {
      const response = await request(app.getHttpServer())
        .get('/customers/me')
        .set('Authorization', tokenFor(clerkId))
        .expect(200);

      expect(response.body).toEqual(created);
    });

    it('returns the same customer when the request is retried', async () => {
      const response = await request(app.getHttpServer())
        .post('/customers/me')
        .set('Authorization', tokenFor(clerkId))
        .send({ phoneNumber: '0877 000 000' })
        .expect(201);

      expect(response.body).toEqual(created);
    });

    it('lets the new customer adopt a cart', async () => {
      await request(app.getHttpServer())
        .post('/cart/adopt')
        .set('Authorization', tokenFor(clerkId))
        .expect(200);
    });
  });

  it('registers a customer without an address', async () => {
    const response = await request(app.getHttpServer())
      .post('/customers/me')
      .set('Authorization', tokenFor(`${RUN}-no-address`))
      .send({ phoneNumber: '+359 98 812 3456' })
      .expect(201);

    expect(response.body.defaultAddress).toBeNull();
  });

  it('refuses an email another customer already holds', async () => {
    const holder = `${RUN}-holder`;
    await request(app.getHttpServer())
      .post('/customers/me')
      .set('Authorization', tokenFor(holder))
      .send({ phoneNumber: '0888123456' })
      .expect(201);

    emailOwner = holder;

    try {
      const response = await request(app.getHttpServer())
        .post('/customers/me')
        .set('Authorization', tokenFor(`${RUN}-second-account`))
        .send({ phoneNumber: '0888123456' })
        .expect(409);

      expect(response.body.errorCode).toBe(AppErrorCode.EMAIL_ALREADY_EXISTS);
    } finally {
      emailOwner = null;
    }
  });
});
