import { Test } from '@nestjs/testing';
import { AppErrorCode, ShippingMethod } from '@vp-parts-shop/shared';
import { ClerkUsers } from '../auth';
import {
  CustomerIdentity,
  CustomerProfileRecord,
  CustomersRepository,
} from './customers.repository';
import { CustomersService } from './customers.service';

describe('CustomersService', () => {
  const findByClerkId = jest.fn();
  const findProfileByClerkId = jest.fn();
  const create = jest.fn();
  const findIdentity = jest.fn();

  let service: CustomersService;

  const PROFILE: CustomerProfileRecord = {
    id: 'customer-1',
    email: 'ivan@example.com',
    firstName: 'Иван',
    lastName: 'Петров',
    phoneNumber: '+359888123456',
    role: 'CUSTOMER',
    createdAt: new Date('2026-10-11T08:00:00.000Z'),
    addresses: [],
  };

  const IDENTITY = {
    email: 'ivan@example.com',
    firstName: 'Иван',
    lastName: 'Петров',
  };

  const ADDRESS = {
    carrier: ShippingMethod.ECONT,
    placeId: '41',
    city: 'София',
    postCode: '1000',
    street: 'бул. Витоша',
    streetNumber: '60',
  };

  beforeEach(async () => {
    jest.resetAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [
        CustomersService,
        {
          provide: CustomersRepository,
          useValue: { findByClerkId, findProfileByClerkId, create },
        },
        { provide: ClerkUsers, useValue: { findIdentity } },
      ],
    }).compile();

    service = moduleRef.get(CustomersService);
  });

  describe('findByClerkId', () => {
    it('delegates to the repository and hands back what it finds', async () => {
      const customer: CustomerIdentity = {
        id: 'customer-1',
        clerkId: 'clerk-1',
        role: 'CUSTOMER',
      };
      findByClerkId.mockResolvedValue(customer);

      await expect(service.findByClerkId('clerk-1')).resolves.toEqual(customer);
      expect(findByClerkId).toHaveBeenCalledWith('clerk-1');
    });

    it('passes a miss straight through rather than turning it into an error', async () => {
      findByClerkId.mockResolvedValue(null);

      await expect(service.findByClerkId('clerk-unknown')).resolves.toBeNull();
    });
  });

  describe('getProfile', () => {
    it('returns the profile of a registered customer', async () => {
      findProfileByClerkId.mockResolvedValue(PROFILE);

      await expect(service.getProfile('clerk-1')).resolves.toMatchObject({
        id: 'customer-1',
        defaultAddress: null,
      });
    });

    it('tells a signed-in user with no customer row to complete their profile', async () => {
      findProfileByClerkId.mockResolvedValue(null);

      await expect(service.getProfile('clerk-1')).rejects.toMatchObject({
        response: { errorCode: AppErrorCode.CUSTOMER_PROFILE_INCOMPLETE },
      });
    });
  });

  describe('register', () => {
    const identityWith = (unsafeMetadata: Record<string, unknown>) => ({
      ...IDENTITY,
      unsafeMetadata,
    });

    it('files the customer under the identity and registration Clerk holds', async () => {
      findProfileByClerkId.mockResolvedValue(null);
      findIdentity.mockResolvedValue(
        identityWith({ phoneNumber: '0888 123 456', address: ADDRESS }),
      );
      create.mockResolvedValue({ kind: 'created', profile: PROFILE });

      await expect(service.register('clerk-1')).resolves.toMatchObject({
        id: 'customer-1',
      });

      expect(findIdentity).toHaveBeenCalledWith('clerk-1');
      expect(create).toHaveBeenCalledWith({
        clerkId: 'clerk-1',
        ...IDENTITY,
        phoneNumber: '+359888123456',
        address: ADDRESS,
      });
    });

    it('files a customer who left no address', async () => {
      findProfileByClerkId.mockResolvedValue(null);
      findIdentity.mockResolvedValue(
        identityWith({ phoneNumber: '0888123456' }),
      );
      create.mockResolvedValue({ kind: 'created', profile: PROFILE });

      await service.register('clerk-1');

      expect(create).toHaveBeenCalledWith({
        clerkId: 'clerk-1',
        ...IDENTITY,
        phoneNumber: '+359888123456',
      });
    });

    // The browser and the webhook both file the same user; the second must not fail.
    it('returns the existing customer unchanged when called again', async () => {
      findProfileByClerkId.mockResolvedValue(PROFILE);

      await expect(service.register('clerk-1')).resolves.toMatchObject({
        phoneNumber: '+359888123456',
      });

      expect(findIdentity).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
    });

    it('returns the customer a concurrent request created first', async () => {
      findProfileByClerkId
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(PROFILE);
      findIdentity.mockResolvedValue(
        identityWith({ phoneNumber: '0888123456' }),
      );
      create.mockResolvedValue({ kind: 'conflict', field: 'clerkId' });

      await expect(service.register('clerk-1')).resolves.toMatchObject({
        id: 'customer-1',
      });
    });

    it('refuses an email another customer already holds', async () => {
      findProfileByClerkId.mockResolvedValue(null);
      findIdentity.mockResolvedValue(
        identityWith({ phoneNumber: '0888123456' }),
      );
      create.mockResolvedValue({ kind: 'conflict', field: 'email' });

      await expect(service.register('clerk-1')).rejects.toMatchObject({
        response: { errorCode: AppErrorCode.EMAIL_ALREADY_EXISTS },
      });
    });

    it('refuses to file a customer Clerk holds no email or names for', async () => {
      findProfileByClerkId.mockResolvedValue(null);
      findIdentity.mockResolvedValue(null);

      await expect(service.register('clerk-1')).rejects.toMatchObject({
        response: { errorCode: AppErrorCode.VALIDATION_ERROR },
      });
      expect(create).not.toHaveBeenCalled();
    });

    it.each([
      ['no registration metadata', {}],
      ['a landline', { phoneNumber: '02 987 6543' }],
      [
        'an address that cannot be located',
        {
          phoneNumber: '0888123456',
          address: { ...ADDRESS, street: undefined },
        },
      ],
    ])(
      'refuses to file a customer whose metadata has %s',
      async (_case, metadata) => {
        findProfileByClerkId.mockResolvedValue(null);
        findIdentity.mockResolvedValue(identityWith(metadata));

        await expect(service.register('clerk-1')).rejects.toMatchObject({
          response: { errorCode: AppErrorCode.VALIDATION_ERROR },
        });
        expect(create).not.toHaveBeenCalled();
      },
    );
  });
});
