import { ConfigService } from '@nestjs/config';
import { createClerkClient } from '@clerk/backend';
import { ClerkUsers } from './clerk-users';

jest.mock('@clerk/backend', () => ({ createClerkClient: jest.fn() }));

describe('ClerkUsers', () => {
  const getUser = jest.fn();
  const config = {
    getOrThrow: (key: string) => `${key}-value`,
  } as unknown as ConfigService;

  let users: ClerkUsers;

  beforeEach(() => {
    jest.resetAllMocks();
    (createClerkClient as jest.Mock).mockReturnValue({ users: { getUser } });

    users = new ClerkUsers(config);
  });

  it('talks to Clerk with the secret key', () => {
    expect(createClerkClient).toHaveBeenCalledWith({
      secretKey: 'CLERK_SECRET_KEY-value',
    });
  });

  it('reads the primary email, names and unsafe metadata of a user', async () => {
    getUser.mockResolvedValue({
      primaryEmailAddress: { emailAddress: 'ivan@example.com' },
      firstName: 'Иван',
      lastName: 'Петров',
      unsafeMetadata: { phoneNumber: '0888123456' },
    });

    await expect(users.findIdentity('clerk-1')).resolves.toEqual({
      email: 'ivan@example.com',
      firstName: 'Иван',
      lastName: 'Петров',
      unsafeMetadata: { phoneNumber: '0888123456' },
    });
    expect(getUser).toHaveBeenCalledWith('clerk-1');
  });

  it('returns null for a user with no primary email', async () => {
    getUser.mockResolvedValue({
      primaryEmailAddress: null,
      firstName: 'Иван',
      lastName: 'Петров',
      unsafeMetadata: {},
    });

    await expect(users.findIdentity('clerk-1')).resolves.toBeNull();
  });

  // A Google account need not have a last name; the customer gives it at checkout.
  it.each([
    ['no first name', { firstName: null }, { firstName: null }],
    ['a blank last name', { lastName: '  ' }, { lastName: null }],
  ])(
    'reads a missing name as null for a user with %s',
    async (_case, gap, read) => {
      getUser.mockResolvedValue({
        primaryEmailAddress: { emailAddress: 'ivan@example.com' },
        firstName: 'Иван',
        lastName: 'Петров',
        unsafeMetadata: {},
        ...gap,
      });

      await expect(users.findIdentity('clerk-1')).resolves.toEqual({
        email: 'ivan@example.com',
        firstName: 'Иван',
        lastName: 'Петров',
        unsafeMetadata: {},
        ...read,
      });
    },
  );
});
