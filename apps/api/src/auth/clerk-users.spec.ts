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

  it('reads the primary email and names of a user', async () => {
    getUser.mockResolvedValue({
      primaryEmailAddress: { emailAddress: 'ivan@example.com' },
      firstName: 'Иван',
      lastName: 'Петров',
    });

    await expect(users.findIdentity('clerk-1')).resolves.toEqual({
      email: 'ivan@example.com',
      firstName: 'Иван',
      lastName: 'Петров',
    });
    expect(getUser).toHaveBeenCalledWith('clerk-1');
  });

  it.each([
    ['no primary email', { primaryEmailAddress: null }],
    ['no first name', { firstName: null }],
    ['a blank last name', { lastName: '  ' }],
  ])('returns null for a user with %s', async (_case, gap) => {
    getUser.mockResolvedValue({
      primaryEmailAddress: { emailAddress: 'ivan@example.com' },
      firstName: 'Иван',
      lastName: 'Петров',
      ...gap,
    });

    await expect(users.findIdentity('clerk-1')).resolves.toBeNull();
  });
});
