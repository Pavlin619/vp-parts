import { Injectable, Logger } from '@nestjs/common';
import {
  CustomerProfileDto,
  RegistrationMetadata,
  registrationMetadataSchema,
} from '@vp-parts-shop/shared';
import { ClerkUsers } from '../auth';
import {
  ClerkIdentityIncompleteException,
  CustomerPhoneRequiredException,
  CustomerProfileIncompleteException,
  EmailAlreadyExistsException,
} from './customers.exceptions';
import { toCustomerProfileDto } from './customers.mapper';
import {
  CustomerIdentity,
  CustomerProfileRecord,
  CustomersRepository,
} from './customers.repository';

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
  private readonly logger = new Logger(CustomersService.name);

  constructor(
    private readonly customers: CustomersRepository,
    private readonly clerkUsers: ClerkUsers,
  ) {}

  /**
   * Null when Clerk has authenticated someone we have no row for yet. A caller
   * decides for itself whether that is an error; a cart treats them as a guest.
   */
  findByClerkId(clerkId: string): Promise<CustomerIdentity | null> {
    return this.customers.findByClerkId(clerkId);
  }

  async getProfile(clerkId: string): Promise<CustomerProfileDto> {
    const customer = await this.customers.findProfileByClerkId(clerkId);

    if (!customer) {
      throw new CustomerProfileIncompleteException();
    }

    return toCustomerProfileDto(customer);
  }

  /**
   * Files a Clerk user as a customer, from what Clerk holds for them. The
   * browser and Clerk's webhooks all call it, so it is safe to repeat: someone
   * already filed is returned as they are.
   */
  async register(clerkId: string): Promise<CustomerProfileDto> {
    const existing = await this.customers.findProfileByClerkId(clerkId);

    if (existing) {
      return toCustomerProfileDto(existing);
    }

    const created = await this.create(clerkId);

    return toCustomerProfileDto(created);
  }

  private async create(clerkId: string): Promise<CustomerProfileRecord> {
    const identity = await this.clerkUsers.findIdentity(clerkId);

    if (!identity) {
      this.logger.warn(`Clerk user ${clerkId} has no email or names`);
      throw new ClerkIdentityIncompleteException();
    }

    const { unsafeMetadata, ...names } = identity;
    const registration = this.parseRegistration(unsafeMetadata);

    const result = await this.customers.create({
      clerkId,
      ...names,
      ...registration,
    });

    if (result.kind === 'created') {
      return result.profile;
    }

    if (result.field === 'email') {
      throw new EmailAlreadyExistsException();
    }

    return this.findRegisteredConcurrently(clerkId);
  }

  private parseRegistration(unsafeMetadata: unknown): RegistrationMetadata {
    const parsed = registrationMetadataSchema.safeParse(unsafeMetadata);

    if (!parsed.success) {
      throw new CustomerPhoneRequiredException();
    }

    return parsed.data;
  }

  private async findRegisteredConcurrently(
    clerkId: string,
  ): Promise<CustomerProfileRecord> {
    const customer = await this.customers.findProfileByClerkId(clerkId);

    if (!customer) {
      throw new CustomerProfileIncompleteException();
    }

    return customer;
  }
}
