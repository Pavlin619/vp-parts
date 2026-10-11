import { Test } from '@nestjs/testing';
import { Prisma } from '../generated/prisma';
import { PrismaService } from '../prisma';
import { CustomersRepository, NewCustomer } from './customers.repository';

const PROFILE_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phoneNumber: true,
  role: true,
  createdAt: true,
};

function uniqueViolation(field: string) {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target: [field] },
  });
}

describe('CustomersRepository', () => {
  const findUnique = jest.fn();
  const create = jest.fn();
  const prisma = {
    customer: { findUnique, create },
  } as unknown as PrismaService;

  let repository: CustomersRepository;

  beforeEach(async () => {
    jest.resetAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [
        CustomersRepository,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    repository = moduleRef.get(CustomersRepository);
  });

  it('looks a customer up by their Clerk identity, selecting only what a caller needs to act on their behalf', async () => {
    findUnique.mockResolvedValue({
      id: 'customer-1',
      clerkId: 'clerk-1',
      role: 'CUSTOMER',
    });

    await expect(repository.findByClerkId('clerk-1')).resolves.toEqual({
      id: 'customer-1',
      clerkId: 'clerk-1',
      role: 'CUSTOMER',
    });
    expect(findUnique).toHaveBeenCalledWith({
      where: { clerkId: 'clerk-1' },
      select: { id: true, clerkId: true, role: true },
    });
  });

  it('returns null when Clerk has authenticated someone with no customer row yet', async () => {
    findUnique.mockResolvedValue(null);

    await expect(repository.findByClerkId('clerk-unknown')).resolves.toBeNull();
  });

  describe('findProfileByClerkId', () => {
    it('reads the profile', async () => {
      findUnique.mockResolvedValue({ id: 'customer-1' });

      await expect(repository.findProfileByClerkId('clerk-1')).resolves.toEqual(
        { id: 'customer-1' },
      );
      expect(findUnique).toHaveBeenCalledWith({
        where: { clerkId: 'clerk-1' },
        select: PROFILE_SELECT,
      });
    });
  });

  describe('create', () => {
    const CUSTOMER: NewCustomer = {
      clerkId: 'clerk-1',
      email: 'ivan@example.com',
      firstName: 'Иван',
      lastName: 'Петров',
      phoneNumber: '+359888123456',
    };

    it('creates the customer', async () => {
      create.mockResolvedValue({ id: 'customer-1' });

      await expect(repository.create(CUSTOMER)).resolves.toEqual({
        kind: 'created',
        profile: { id: 'customer-1' },
      });
      expect(create).toHaveBeenCalledWith({
        data: CUSTOMER,
        select: PROFILE_SELECT,
      });
    });

    it.each(['clerkId', 'email'] as const)(
      'reports a %s that is already taken instead of throwing',
      async (field) => {
        create.mockRejectedValue(uniqueViolation(field));

        await expect(repository.create(CUSTOMER)).resolves.toEqual({
          kind: 'conflict',
          field,
        });
      },
    );

    it('rethrows anything else', async () => {
      const failure = new Error('connection lost');
      create.mockRejectedValue(failure);

      await expect(repository.create(CUSTOMER)).rejects.toBe(failure);
    });
  });
});
