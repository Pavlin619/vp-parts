import { Injectable } from '@nestjs/common';
import { CustomerIdentity, CustomersRepository } from './customers.repository';

/**
 * Resolves the Clerk identity on a request into the `Customer` row the rest of
 * the shop is keyed on.
 *
 * Clerk owns who someone is; this table owns what they have done with us. The
 * two are joined only here, so no other feature has to know that `clerkId` is
 * not our own primary key.
 */
@Injectable()
export class CustomersService {
  constructor(private readonly customers: CustomersRepository) {}

  /**
   * Null when Clerk has authenticated someone we have no row for yet — the
   * `user.created` webhook has not landed, or is not built. A caller decides
   * for itself whether that is an error; a cart treats them as a guest.
   */
  findByClerkId(clerkId: string): Promise<CustomerIdentity | null> {
    return this.customers.findByClerkId(clerkId);
  }
}
