import { Injectable } from '@nestjs/common';
import type { CustomerAddressInputDto } from '@vp-parts-shop/shared';
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
  address?: CustomerAddressInputDto;
}

const PROFILE_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phoneNumber: true,
  role: true,
  createdAt: true,
  addresses: {
    where: { isDefault: true },
    take: 1,
    select: {
      id: true,
      carrier: true,
      placeId: true,
      city: true,
      postCode: true,
      street: true,
      streetNumber: true,
      quarter: true,
      block: true,
      entrance: true,
      floor: true,
      apartment: true,
      note: true,
    },
  },
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

  async create({
    address,
    ...customer
  }: NewCustomer): Promise<CustomerCreateResult> {
    const data: Prisma.CustomerCreateInput = address
      ? { ...customer, addresses: { create: { ...address, isDefault: true } } }
      : customer;

    try {
      const profile = await this.prisma.customer.create({
        data,
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
