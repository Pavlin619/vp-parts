import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma';

/** The parts of a customer other features need to act on their behalf. */
export interface CustomerIdentity {
  id: string;
  clerkId: string;
  role: string;
}

@Injectable()
export class CustomersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByClerkId(clerkId: string): Promise<CustomerIdentity | null> {
    const customer = await this.prisma.customer.findUnique({
      where: { clerkId },
      select: { id: true, clerkId: true, role: true },
    });

    return customer;
  }
}
