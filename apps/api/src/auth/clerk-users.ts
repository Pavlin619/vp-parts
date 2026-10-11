import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClerkClient, createClerkClient } from '@clerk/backend';

/** Who a Clerk user is, as Clerk holds it. */
export interface ClerkIdentity {
  email: string;
  firstName: string;
  lastName: string;
  /** Written by the browser at sign-up, so the caller must validate it. */
  unsafeMetadata: Record<string, unknown>;
}

@Injectable()
export class ClerkUsers {
  private readonly clerk: ClerkClient;

  constructor(configService: ConfigService) {
    this.clerk = createClerkClient({
      secretKey: configService.getOrThrow<string>('CLERK_SECRET_KEY'),
    });
  }

  /** Null when Clerk holds no primary email or no names for the user. */
  async findIdentity(clerkId: string): Promise<ClerkIdentity | null> {
    const user = await this.clerk.users.getUser(clerkId);

    const email = user.primaryEmailAddress?.emailAddress;
    const firstName = user.firstName?.trim();
    const lastName = user.lastName?.trim();

    if (!email || !firstName || !lastName) {
      return null;
    }

    return { email, firstName, lastName, unsafeMetadata: user.unsafeMetadata };
  }
}
