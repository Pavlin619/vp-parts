import { Test } from '@nestjs/testing';
import { CustomerIdentity, CustomersRepository } from './customers.repository';
import { CustomersService } from './customers.service';

describe('CustomersService', () => {
  const findByClerkId = jest.fn();

  let service: CustomersService;

  beforeEach(async () => {
    jest.resetAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [
        CustomersService,
        { provide: CustomersRepository, useValue: { findByClerkId } },
      ],
    }).compile();

    service = moduleRef.get(CustomersService);
  });

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
