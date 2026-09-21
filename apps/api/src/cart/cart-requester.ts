import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { CART_TOKEN_HEADER } from '@vp-parts-shop/shared';
import { AuthenticatedUser } from '../auth';

/**
 * Who is asking for a cart, as the request states it — not yet who owns one.
 *
 * Both halves can be present: someone signs in with a guest cart still in hand,
 * which is exactly the case `POST /cart/adopt` exists for. Turning this into an
 * owner needs a database read, so it happens in the service rather than here.
 */
export interface CartRequester {
  clerkId: string | null;
  token: string | null;
}

export const CartRequesterOf = createParamDecorator(
  (_data: unknown, context: ExecutionContext): CartRequester => {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();

    return {
      clerkId: request.user?.clerkId ?? null,
      token: readToken(request),
    };
  },
);

/**
 * A token is 32 random bytes in base64url. Anything else is not one of ours, so
 * it is ignored rather than used to probe for carts.
 */
function readToken(request: Request): string | null {
  const header = request.headers[CART_TOKEN_HEADER];
  const token = Array.isArray(header) ? header[0] : header;

  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}
