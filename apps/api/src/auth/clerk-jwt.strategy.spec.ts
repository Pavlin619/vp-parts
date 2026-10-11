import { ConfigService } from '@nestjs/config';
import { verifyToken } from '@clerk/backend';
import { ClerkJwtStrategy } from './clerk-jwt.strategy';

jest.mock('@clerk/backend', () => ({ verifyToken: jest.fn() }));

describe('ClerkJwtStrategy', () => {
  const config = {
    getOrThrow: (key: string) =>
      key === 'CORS_ORIGIN' ? 'https://shop.example' : `${key}-value`,
  } as unknown as ConfigService;

  // A token Clerk minted for another app on the same instance carries a
  // different `azp`; without this it would be accepted here too.
  it('accepts only tokens issued to our own web origin', async () => {
    (verifyToken as jest.Mock).mockResolvedValue({ sub: 'clerk-1' });

    await new ClerkJwtStrategy(config).verifyToken('token');

    expect(verifyToken).toHaveBeenCalledWith('token', {
      secretKey: 'CLERK_SECRET_KEY-value',
      authorizedParties: ['https://shop.example'],
    });
  });
});
