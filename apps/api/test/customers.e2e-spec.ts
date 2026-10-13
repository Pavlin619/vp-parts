import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppErrorCode, CustomerProfileDto } from '@vp-parts-shop/shared';
import { createTestApp, resetRateLimits } from './helpers/create-test-app';
import { ClerkJwtStrategy } from '../src/auth/clerk-jwt.strategy';
import { ClerkUsers, ClerkWebhooks } from '../src/auth';
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

interface HeldIdentity {
  firstName: string | null;
  lastName: string | null;
  unsafeMetadata: Record<string, unknown>;
}

/** What Clerk holds for someone who came through the registration form. */
const REGISTERED: HeldIdentity = {
  firstName: 'Иван',
  lastName: 'Петров',
  unsafeMetadata: { phoneNumber: '0888 123 456' },
};

/** A Google account with no last name: no metadata, so no phone either. */
const GOOGLE: HeldIdentity = {
  firstName: 'Иван',
  lastName: null,
  unsafeMetadata: {},
};

/** Who each user is in Clerk, when not REGISTERED. */
const identities = new Map<string, Partial<HeldIdentity>>();

const clerkUsers = {
  findIdentity: (clerkId: string) =>
    Promise.resolve({
      email: `${emailOwner ?? clerkId}@example.com`,
      ...REGISTERED,
      ...identities.get(clerkId),
    }),
};

/** Accepts a body as Clerk-signed when it carries this header. */
const SIGNED = 'x-test-signed';

const clerkWebhooks = {
  verify: (request: { headers: Record<string, string>; body: unknown }) =>
    request.headers[SIGNED]
      ? Promise.resolve(request.body)
      : Promise.reject(new Error('Unable to verify incoming webhook')),
};

describe('Customers (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp((builder) => {
      builder.overrideProvider(ClerkJwtStrategy).useValue(clerkJwtStrategy);
      builder.overrideProvider(ClerkUsers).useValue(clerkUsers);
      builder.overrideProvider(ClerkWebhooks).useValue(clerkWebhooks);
    });
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    const customers = { clerkId: { startsWith: RUN } };

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

  describe('a Google sign-in', () => {
    const clerkId = `${RUN}-google`;

    const completeProfile = (details: Record<string, unknown>) =>
      request(app.getHttpServer())
        .patch('/customers/me')
        .set('Authorization', tokenFor(clerkId))
        .send(details);

    beforeAll(() => identities.set(clerkId, GOOGLE));

    it('cannot complete a profile before it is filed', async () => {
      const response = await completeProfile({ phoneNumber: '0888 123 456' });

      expect(response.status).toBe(404);
      expect(response.body.errorCode).toBe(
        AppErrorCode.CUSTOMER_PROFILE_INCOMPLETE,
      );
    });

    it('is filed at once, with what Clerk does not hold left empty', async () => {
      const response = await request(app.getHttpServer())
        .post('/customers/me')
        .set('Authorization', tokenFor(clerkId))
        .expect(201);

      expect(response.body).toMatchObject({
        email: `${clerkId}@example.com`,
        firstName: 'Иван',
        lastName: null,
        phoneNumber: null,
      });
    });

    it('refuses a phone that is not a Bulgarian mobile', async () => {
      const response = await completeProfile({ phoneNumber: '02 987 6543' });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        statusCode: 400,
        errorCode: AppErrorCode.VALIDATION_ERROR,
      });
    });

    it('refuses a detail the profile does not own', async () => {
      const response = await completeProfile({ email: 'other@example.com' });

      expect(response.status).toBe(400);
    });

    it('completes with what was missing, and reads it back', async () => {
      const response = await completeProfile({
        lastName: ' Петров ',
        phoneNumber: '0888 123 456',
      });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        firstName: 'Иван',
        lastName: 'Петров',
        phoneNumber: '+359888123456',
      });

      const read = await request(app.getHttpServer())
        .get('/customers/me')
        .set('Authorization', tokenFor(clerkId))
        .expect(200);

      expect(read.body).toEqual(response.body);
    });
  });

  it('files a registration phone that is not a Bulgarian mobile as missing', async () => {
    const clerkId = `${RUN}-landline`;
    identities.set(clerkId, { unsafeMetadata: { phoneNumber: '02 987 6543' } });

    const response = await request(app.getHttpServer())
      .post('/customers/me')
      .set('Authorization', tokenFor(clerkId))
      .expect(201);

    expect(response.body.phoneNumber).toBeNull();
  });

  describe('registering', () => {
    const clerkId = `${RUN}-registered`;
    let created: CustomerProfileDto;

    beforeAll(async () => {
      const response = await request(app.getHttpServer())
        .post('/customers/me')
        .set('Authorization', tokenFor(clerkId))
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

    it('reads the same profile back', async () => {
      const response = await request(app.getHttpServer())
        .get('/customers/me')
        .set('Authorization', tokenFor(clerkId))
        .expect(200);

      expect(response.body).toEqual(created);
    });

    it('returns the same customer when the request is retried', async () => {
      identities.set(clerkId, {
        unsafeMetadata: { phoneNumber: '0877 000 000' },
      });

      const response = await request(app.getHttpServer())
        .post('/customers/me')
        .set('Authorization', tokenFor(clerkId))
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

  it('refuses an email another customer already holds', async () => {
    const holder = `${RUN}-holder`;
    await request(app.getHttpServer())
      .post('/customers/me')
      .set('Authorization', tokenFor(holder))
      .expect(201);

    emailOwner = holder;

    try {
      const response = await request(app.getHttpServer())
        .post('/customers/me')
        .set('Authorization', tokenFor(`${RUN}-second-account`))
        .expect(409);

      expect(response.body.errorCode).toBe(AppErrorCode.EMAIL_ALREADY_EXISTS);
    } finally {
      emailOwner = null;
    }
  });

  describe('the Clerk webhook', () => {
    const userCreated = (clerkId: string) => ({
      type: 'user.created',
      data: { id: clerkId },
    });

    const findCustomer = (clerkId: string) =>
      prisma.customer.findUnique({ where: { clerkId } });

    it('refuses a request Clerk did not sign', async () => {
      const clerkId = `${RUN}-unsigned`;

      const response = await request(app.getHttpServer())
        .post('/webhooks/clerk')
        .send(userCreated(clerkId))
        .expect(400);

      expect(response.body.errorCode).toBe(AppErrorCode.VALIDATION_ERROR);
      await expect(findCustomer(clerkId)).resolves.toBeNull();
    });

    it('files the customer a new Clerk user stands for, without a session', async () => {
      const clerkId = `${RUN}-webhook`;

      await request(app.getHttpServer())
        .post('/webhooks/clerk')
        .set(SIGNED, '1')
        .send(userCreated(clerkId))
        .expect(200);

      await expect(findCustomer(clerkId)).resolves.toMatchObject({
        phoneNumber: '+359888123456',
      });
    });

    it("answers a redelivery and the browser's own call with the same customer", async () => {
      const clerkId = `${RUN}-both-paths`;

      await request(app.getHttpServer())
        .post('/webhooks/clerk')
        .set(SIGNED, '1')
        .send(userCreated(clerkId))
        .expect(200);
      await request(app.getHttpServer())
        .post('/webhooks/clerk')
        .set(SIGNED, '1')
        .send(userCreated(clerkId))
        .expect(200);
      const response = await request(app.getHttpServer())
        .post('/customers/me')
        .set('Authorization', tokenFor(clerkId))
        .expect(201);

      const customer = await findCustomer(clerkId);
      expect(response.body.id).toBe(customer?.id);
    });

    it('files a Google user with no phone or last name straight away', async () => {
      const clerkId = `${RUN}-webhook-google`;
      identities.set(clerkId, GOOGLE);

      await request(app.getHttpServer())
        .post('/webhooks/clerk')
        .set(SIGNED, '1')
        .send(userCreated(clerkId))
        .expect(200);

      await expect(findCustomer(clerkId)).resolves.toMatchObject({
        lastName: null,
        phoneNumber: null,
      });
    });

    it('accepts and ignores events it does not handle', async () => {
      const clerkId = `${RUN}-unhandled`;

      for (const type of ['user.updated', 'user.deleted']) {
        await request(app.getHttpServer())
          .post('/webhooks/clerk')
          .set(SIGNED, '1')
          .send({ type, data: { id: clerkId } })
          .expect(200);
      }

      await expect(findCustomer(clerkId)).resolves.toBeNull();
    });
  });
});
