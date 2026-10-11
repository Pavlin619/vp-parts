import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma';
import { PrismaService } from '../prisma';

/** The parts of a customer other features need to act on their behalf. */
export interface CustomerIdentity {
  id: string;
  clerkId: string;
  role: string;
}

export interface NewCustomer {
  clerkId: string;
  email: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
}

const PROFILE_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phoneNumber: true,
  role: true,
  createdAt: true,
} satisfies Prisma.CustomerSelect;

export type CustomerProfileRecord = Prisma.CustomerGetPayload<{
  select: typeof PROFILE_SELECT;
}>;

export type CustomerCreateResult =
  | { kind: 'created'; profile: CustomerProfileRecord }
  | { kind: 'conflict'; field: 'clerkId' | 'email' };

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

  findProfileByClerkId(clerkId: string): Promise<CustomerProfileRecord | null> {
    return this.prisma.customer.findUnique({
      where: { clerkId },
      select: PROFILE_SELECT,
    });
  }

  async create(customer: NewCustomer): Promise<CustomerCreateResult> {
    try {
      const profile = await this.prisma.customer.create({
        data: customer,
        select: PROFILE_SELECT,
      });

      return { kind: 'created', profile };
    } catch (error) {
      const field = takenUniqueField(error);

      if (field) {
        return { kind: 'conflict', field };
      }

      throw error;
    }
  }
}

function takenUniqueField(error: unknown): 'clerkId' | 'email' | null {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== 'P2002'
  ) {
    return null;
  }

  const target = error.meta?.target;
  const fields = Array.isArray(target) ? target : [target];

  if (fields.includes('clerkId')) {
    return 'clerkId';
  }

  return fields.includes('email') ? 'email' : null;
}
