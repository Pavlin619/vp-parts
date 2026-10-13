import { Injectable, Logger } from '@nestjs/common';
import {
  CompleteProfileDetails,
  CompleteProfileInput,
  CustomerProfileDto,
  isProfileComplete,
  registrationMetadataSchema,
} from '@vp-parts-shop/shared';
import { ClerkUsers } from '../auth';
import {
  ClerkIdentityIncompleteException,
  CustomerDetailsRequiredException,
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
   * Files a Clerk user as a customer, from what Clerk holds for them — possibly
   * no names or phone yet (see docs/AUTH.md). The browser and Clerk's webhook
   * both call it, so it is safe to repeat: someone already filed is returned as
   * they are.
   */
  async register(clerkId: string): Promise<CustomerProfileDto> {
    const existing = await this.customers.findProfileByClerkId(clerkId);

    if (existing) {
      return toCustomerProfileDto(existing);
    }

    const created = await this.create(clerkId);

    return toCustomerProfileDto(created);
  }

  /** Sets the details given, whether they were missing or not. */
  async completeProfile(
    clerkId: string,
    details: CompleteProfileInput,
  ): Promise<CustomerProfileDto> {
    const customer = await this.customers.updateProfile(clerkId, details);

    if (!customer) {
      throw new CustomerProfileIncompleteException();
    }

    return toCustomerProfileDto(customer);
  }

  /**
   * The profile of a customer who can order. Every route that needs their
   * contact details must call this; the UI's completion step is not the guard.
   */
  async requireCompleteProfile(
    clerkId: string,
  ): Promise<CompleteProfileDetails<CustomerProfileDto>> {
    const profile = await this.getProfile(clerkId);

    if (!isProfileComplete(profile)) {
      throw new CustomerDetailsRequiredException();
    }

    return profile;
  }

  private async create(clerkId: string): Promise<CustomerProfileRecord> {
    const identity = await this.clerkUsers.findIdentity(clerkId);

    if (!identity) {
      this.logger.warn(`Clerk user ${clerkId} has no email`);
      throw new ClerkIdentityIncompleteException();
    }

    const { unsafeMetadata, ...names } = identity;

    const result = await this.customers.create({
      clerkId,
      ...names,
      phoneNumber: this.registeredPhone(clerkId, unsafeMetadata),
    });

    if (result.kind === 'created') {
      return result.profile;
    }

    if (result.field === 'email') {
      throw new EmailAlreadyExistsException();
    }

    return this.findRegisteredConcurrently(clerkId);
  }

  /** The phone the registration form left; a Google sign-in leaves none. */
  private registeredPhone(
    clerkId: string,
    unsafeMetadata: Record<string, unknown>,
  ): string | null {
    if (unsafeMetadata.phoneNumber === undefined) {
      return null;
    }

    const parsed = registrationMetadataSchema.safeParse(unsafeMetadata);

    if (!parsed.success) {
      // The form refuses such a phone, so only a bypassed form leaves one.
      this.logger.warn(`Clerk user ${clerkId} registered an invalid phone`);
      return null;
    }

    return parsed.data.phoneNumber;
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
