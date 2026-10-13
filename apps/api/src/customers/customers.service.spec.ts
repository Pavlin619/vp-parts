import { Test } from '@nestjs/testing';
import { AppErrorCode } from '@vp-parts-shop/shared';
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
  const updateProfile = jest.fn();
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
  };

  const IDENTITY = {
    email: 'ivan@example.com',
    firstName: 'Иван',
    lastName: 'Петров',
  };

  beforeEach(async () => {
    jest.resetAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [
        CustomersService,
        {
          provide: CustomersRepository,
          useValue: {
            findByClerkId,
            findProfileByClerkId,
            create,
            updateProfile,
          },
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
        identityWith({ phoneNumber: '0888 123 456' }),
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
      });
    });

    it('files nothing but the phone from metadata the browser could have added to', async () => {
      findProfileByClerkId.mockResolvedValue(null);
      findIdentity.mockResolvedValue(
        identityWith({
          phoneNumber: '0888123456',
          role: 'MECHANIC',
          address: {},
        }),
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

    it('refuses to file a customer Clerk holds no email for', async () => {
      findProfileByClerkId.mockResolvedValue(null);
      findIdentity.mockResolvedValue(null);

      await expect(service.register('clerk-1')).rejects.toMatchObject({
        response: { errorCode: AppErrorCode.VALIDATION_ERROR },
      });
      expect(create).not.toHaveBeenCalled();
    });

    // A Google sign-in: no registration metadata, and perhaps no last name.
    it('files a customer Clerk holds only an email and a first name for', async () => {
      findProfileByClerkId.mockResolvedValue(null);
      findIdentity.mockResolvedValue({
        email: 'ivan@gmail.com',
        firstName: 'Иван',
        lastName: null,
        unsafeMetadata: {},
      });
      create.mockResolvedValue({ kind: 'created', profile: PROFILE });

      await service.register('clerk-1');

      expect(create).toHaveBeenCalledWith({
        clerkId: 'clerk-1',
        email: 'ivan@gmail.com',
        firstName: 'Иван',
        lastName: null,
        phoneNumber: null,
      });
    });

    // Only a bypassed registration form leaves an invalid phone behind.
    it('files a phone the metadata holds that is not a Bulgarian mobile as missing', async () => {
      findProfileByClerkId.mockResolvedValue(null);
      findIdentity.mockResolvedValue(
        identityWith({ phoneNumber: '02 987 6543' }),
      );
      create.mockResolvedValue({ kind: 'created', profile: PROFILE });

      await service.register('clerk-1');

      expect(create).toHaveBeenCalledWith({
        clerkId: 'clerk-1',
        ...IDENTITY,
        phoneNumber: null,
      });
    });
  });

  describe('completeProfile', () => {
    it('sets only the details given', async () => {
      updateProfile.mockResolvedValue(PROFILE);

      await expect(
        service.completeProfile('clerk-1', { phoneNumber: '+359888123456' }),
      ).resolves.toMatchObject({ phoneNumber: '+359888123456' });

      expect(updateProfile).toHaveBeenCalledWith('clerk-1', {
        phoneNumber: '+359888123456',
      });
    });

    it('may overwrite details the profile already holds', async () => {
      updateProfile.mockResolvedValue(PROFILE);

      await service.completeProfile('clerk-1', {
        firstName: 'Иван',
        lastName: 'Иванов',
      });

      expect(updateProfile).toHaveBeenCalledWith('clerk-1', {
        firstName: 'Иван',
        lastName: 'Иванов',
      });
    });

    it('tells a signed-in user with no customer row to be filed first', async () => {
      updateProfile.mockResolvedValue(null);

      await expect(
        service.completeProfile('clerk-1', { phoneNumber: '0888123456' }),
      ).rejects.toMatchObject({
        response: { errorCode: AppErrorCode.CUSTOMER_PROFILE_INCOMPLETE },
      });
    });
  });

  describe('requireCompleteProfile', () => {
    it('hands back the profile of a customer who can order', async () => {
      findProfileByClerkId.mockResolvedValue(PROFILE);

      await expect(
        service.requireCompleteProfile('clerk-1'),
      ).resolves.toMatchObject({
        firstName: 'Иван',
        lastName: 'Петров',
        phoneNumber: '+359888123456',
      });
    });

    it.each(['firstName', 'lastName', 'phoneNumber'] as const)(
      'refuses a profile without a %s',
      async (detail) => {
        findProfileByClerkId.mockResolvedValue({ ...PROFILE, [detail]: null });

        await expect(
          service.requireCompleteProfile('clerk-1'),
        ).rejects.toMatchObject({
          status: 422,
          response: { errorCode: AppErrorCode.CUSTOMER_DETAILS_REQUIRED },
        });
      },
    );

    it('refuses someone with no customer row', async () => {
      findProfileByClerkId.mockResolvedValue(null);

      await expect(
        service.requireCompleteProfile('clerk-1'),
      ).rejects.toMatchObject({
        response: { errorCode: AppErrorCode.CUSTOMER_PROFILE_INCOMPLETE },
      });
    });
  });
});
