import { ExecutionContext } from '@nestjs/common';
import { currentUserOf } from './current-user.decorator';

function contextWith(request: object): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('currentUserOf', () => {
  it('hands back the user the guard attached', () => {
    const user = { clerkId: 'clerk-1' };

    expect(currentUserOf(contextWith({ user }))).toBe(user);
  });

  // Reaching a handler without a user means the route was marked public by
  // mistake; failing loudly beats acting for nobody.
  it('throws when no user is attached', () => {
    expect(() => currentUserOf(contextWith({}))).toThrow();
  });
});
