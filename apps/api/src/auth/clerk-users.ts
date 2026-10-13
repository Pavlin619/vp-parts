import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClerkClient, createClerkClient } from '@clerk/backend';

/** Who a Clerk user is, as Clerk holds it. */
export interface ClerkIdentity {
  email: string;
  firstName: string | null;
  lastName: string | null;
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

  /** Null when Clerk holds no primary email for the user. */
  async findIdentity(clerkId: string): Promise<ClerkIdentity | null> {
    const user = await this.clerk.users.getUser(clerkId);
    const email = user.primaryEmailAddress?.emailAddress;

    if (!email) {
      return null;
    }

    return {
      email,
      firstName: presentName(user.firstName),
      lastName: presentName(user.lastName),
      unsafeMetadata: user.unsafeMetadata,
    };
  }
}

function presentName(name: string | null): string | null {
  return name?.trim() || null;
}
