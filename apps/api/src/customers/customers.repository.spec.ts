import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma';
import { CustomersRepository } from './customers.repository';

describe('CustomersRepository', () => {
  const findUnique = jest.fn();
  const prisma = {
    customer: { findUnique },
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
});
