import type { CustomerProfileDto } from './dto/customers.dto';

/** What an order needs from a customer's profile, in the order a form asks for it. */
export const PROFILE_DETAILS = ['firstName', 'lastName', 'phoneNumber'] as const;

export type ProfileDetail = (typeof PROFILE_DETAILS)[number];

type ProfileDetails = Pick<CustomerProfileDto, ProfileDetail>;

export type CompleteProfileDetails<T extends ProfileDetails> = T & {
  [Detail in ProfileDetail]: string;
};

export function missingProfileDetails(profile: ProfileDetails): ProfileDetail[] {
  return PROFILE_DETAILS.filter((detail) => !profile[detail]);
}

/** A customer can be filed without these; see docs/AUTH.md → "Incomplete profiles". */
export function isProfileComplete<T extends ProfileDetails>(
  profile: T,
): profile is CompleteProfileDetails<T> {
  return missingProfileDetails(profile).length === 0;
}
