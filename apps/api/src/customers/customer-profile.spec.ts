import {
  completeProfileSchema,
  isProfileComplete,
  missingProfileDetails,
} from '@vp-parts-shop/shared';

const COMPLETE = {
  firstName: 'Иван',
  lastName: 'Петров',
  phoneNumber: '+359888123456',
};

describe('missingProfileDetails', () => {
  it('names nothing for a complete profile', () => {
    expect(missingProfileDetails(COMPLETE)).toEqual([]);
  });

  // A Google account need not have a last name, and never carries a phone.
  it('names each detail the profile lacks, in form order', () => {
    expect(
      missingProfileDetails({ ...COMPLETE, lastName: null, phoneNumber: null }),
    ).toEqual(['lastName', 'phoneNumber']);
  });
});

describe('isProfileComplete', () => {
  it('holds when the names and the phone are all present', () => {
    expect(isProfileComplete(COMPLETE)).toBe(true);
  });

  it.each(['firstName', 'lastName', 'phoneNumber'] as const)(
    'fails without a %s',
    (detail) => {
      expect(isProfileComplete({ ...COMPLETE, [detail]: null })).toBe(false);
    },
  );
});

describe('completeProfileSchema', () => {
  it('accepts any subset of the details, an empty one included', () => {
    expect(completeProfileSchema.safeParse({}).success).toBe(true);
    expect(
      completeProfileSchema.safeParse({ phoneNumber: '0888 123 456' }).data,
    ).toEqual({ phoneNumber: '+359888123456' });
  });

  it.each([
    ['a landline', { phoneNumber: '02 987 6543' }],
    ['a blank first name', { firstName: '' }],
    ['a last name with digits', { lastName: 'Петров2' }],
  ])('refuses %s', (_case, patch) => {
    expect(completeProfileSchema.safeParse(patch).success).toBe(false);
  });
});
