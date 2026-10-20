import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { randomBytes } from 'node:crypto';
import {
  ArticleIdentityDto,
  CartAdoptResponseDto,
  CartDto,
  EMPTY_CART,
  articleIdentityKey,
} from '@vp-parts-shop/shared';
import { CustomersService } from '../customers';
import { CartRequester } from './cart-requester';
import { mergeCartLines } from './cart-merge';
import {
  CartForOrder,
  CartShippingLine,
  StoredCartLine,
  toCartDto,
  toCartForOrder,
  toSelectedShippingLines,
  toStoredCartLines,
} from './cart.mapper';
import {
  CartFullException,
  CartItemNotFoundException,
  CartStaleException,
} from './cart.exceptions';
import {
  CartCapacityConflictError,
  CartClosedError,
  CartItemNotFoundError,
  CartLineInput,
  CartLinePatch,
  CartRecord,
  CartRepository,
  CartVersionConflictError,
  MergedCartLine,
} from './cart.repository';
import { ShippingProfileResolver } from './shipping-profile/shipping-profile.resolver';

/**
 * What a mutation did. `mintedToken` is set only by the call that created a
 * guest's cart, because that is the one moment the browser has to be told which
 * cart is now theirs.
 */
export interface CartMutationResult {
  cart: CartDto;
  mintedToken: string | null;
}

/** A line as a client asks for it; the shipping profile is never taken from the client. */
export type NewCartLine = Omit<CartLineInput, 'shippingProfile'>;

/** The cart and what its selected lines weigh. */
export interface CartShipping {
  cart: CartDto;
  lines: CartShippingLine[];
}

/** Who a cart belongs to, once the request has been resolved against the database. */
type CartOwner =
  | { kind: 'customer'; customerId: string }
  | { kind: 'guest'; token: string | null };

@Injectable()
export class CartService {
  private readonly logger = new Logger(CartService.name);

  constructor(
    private readonly carts: CartRepository,
    private readonly customers: CustomersService,
    private readonly shippingProfiles: ShippingProfileResolver,
  ) {}

  /**
   * The cart as it stands. Deliberately never creates one: a visitor who has
   * only browsed should not leave a row behind, and a read that mints carts
   * gives every crawler one of its own.
   */
  async getCart(requester: CartRequester): Promise<CartDto> {
    const cart = await this.findCart(await this.resolveOwner(requester));

    return cart ? toCartDto(cart) : EMPTY_CART;
  }

  async getShippingLines(requester: CartRequester): Promise<CartShipping> {
    const cart = await this.findCart(await this.resolveOwner(requester));

    return cart
      ? { cart: toCartDto(cart), lines: toSelectedShippingLines(cart) }
      : { cart: EMPTY_CART, lines: [] };
  }

  /** A customer's cart by its id, in any status; null when it is not theirs. */
  async findOwnedCart(
    customerId: string,
    cartId: string,
  ): Promise<CartForOrder | null> {
    const cart = await this.carts.findById(cartId);

    return cart?.customerId === customerId ? toCartForOrder(cart) : null;
  }

  /**
   * A guest's cart by its id, in any status; null unless the token holds it,
   * or held it when it was ordered.
   */
  async findGuestCart(
    token: string,
    cartId: string,
  ): Promise<CartForOrder | null> {
    const cart = await this.carts.findById(cartId);
    const isHeld = cart?.token === token || cart?.releasedToken === token;

    return cart && isHeld ? toCartForOrder(cart) : null;
  }

  /**
   * The capacity limit is enforced by {@link CartRepository.addLine} itself,
   * inside the same transaction as the insert — a check made here first,
   * against a cart already read, would leave two concurrent adds of two
   * different new parts free to both pass it before either commits.
   *
   * The catalogue is read before any cart is minted, so a part it does not know,
   * or an outage, leaves nothing behind.
   */
  async addLine(
    requester: CartRequester,
    line: NewCartLine,
  ): Promise<CartMutationResult> {
    const shippingProfile = await this.shippingProfiles.resolve(line);
    const owner = await this.resolveOwner(requester);
    const existing = await this.findCart(owner);

    const { cart, mintedToken } = existing
      ? { cart: existing, mintedToken: null }
      : await this.createCart(owner);

    const updated = await this.carts
      .addLine(cart.id, { ...line, shippingProfile })
      .catch(throwAsHttpError);

    return { cart: toCartDto(updated), mintedToken };
  }

  async updateLine(
    requester: CartRequester,
    article: ArticleIdentityDto,
    patch: CartLinePatch,
  ): Promise<CartDto> {
    const cart = await this.findCart(await this.resolveOwner(requester));

    if (!cart || !holdsLine(cart, article) || isEmptyPatch(patch)) {
      throw new CartItemNotFoundException();
    }

    return toCartDto(
      await this.carts
        .updateLine(cart.id, article, patch)
        .catch(throwAsHttpError),
    );
  }

  /**
   * Removing what is already gone succeeded. A tab acting on a cart another tab
   * has emptied is ordinary, and an error there would only prompt a retry of a
   * request whose goal is already met.
   */
  async removeLine(
    requester: CartRequester,
    article: ArticleIdentityDto,
  ): Promise<CartDto> {
    const cart = await this.findCart(await this.resolveOwner(requester));

    return cart
      ? toCartDto(
          await this.carts.removeLine(cart.id, article).catch(throwAsHttpError),
        )
      : EMPTY_CART;
  }

  async setAllSelected(
    requester: CartRequester,
    isSelected: boolean,
  ): Promise<CartDto> {
    const cart = await this.findCart(await this.resolveOwner(requester));

    return cart
      ? toCartDto(
          await this.carts
            .setAllSelected(cart.id, isSelected)
            .catch(throwAsHttpError),
        )
      : EMPTY_CART;
  }

  async clear(requester: CartRequester): Promise<CartDto> {
    const cart = await this.findCart(await this.resolveOwner(requester));

    return cart
      ? toCartDto(await this.carts.clear(cart.id).catch(throwAsHttpError))
      : EMPTY_CART;
  }

  /**
   * Unites the cart a visitor filled anonymously with the one their account
   * already held, at the moment they sign in.
   *
   * Server-side and in one transaction, rather than the browser replaying its
   * lines one request at a time: a merge that can half-fail loses parts the
   * customer chose, and the customer is the one person who cannot tell that it
   * happened.
   */
  async adopt(requester: CartRequester): Promise<CartAdoptResponseDto> {
    const customerId = await this.requireCustomer(requester);

    const [guestCart, accountCart] = await Promise.all([
      requester.token ? this.carts.findActiveByToken(requester.token) : null,
      this.carts.findActiveByCustomer(customerId),
    ]);

    if (!guestCart) {
      return {
        cart: accountCart ? toCartDto(accountCart) : EMPTY_CART,
        droppedLines: [],
      };
    }

    if (!accountCart) {
      const claimed = await this.carts.claimForCustomer(
        guestCart.id,
        customerId,
      );

      return { cart: toCartDto(claimed), droppedLines: [] };
    }

    return this.merge(accountCart, guestCart);
  }

  /**
   * Guest carts nobody came back to. Customer carts are never swept — following
   * a customer between devices is the reason theirs is on the server at all.
   */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async sweepExpiredGuestCarts(): Promise<number> {
    const deleted = await this.carts.deleteExpiredGuestCarts(new Date());

    if (deleted > 0) {
      this.logger.log(`Swept ${deleted} expired guest cart(s).`);
    }

    return deleted;
  }

  private async merge(
    accountCart: CartRecord,
    guestCart: CartRecord,
  ): Promise<CartAdoptResponseDto> {
    const { lines, dropped } = mergeCartLines(
      toStoredCartLines(accountCart),
      toStoredCartLines(guestCart),
    );

    const merged = await this.carts
      .mergeInto(
        accountCart.id,
        accountCart.version,
        guestCart.id,
        lines.map(toMergedLine),
      )
      .catch(throwAsHttpError);

    return { cart: toCartDto(merged), droppedLines: dropped };
  }

  /**
   * A signed-in customer's cart wins over a guest token the browser still
   * happens to be holding. The two are united only by an explicit adopt, so
   * that merge is never a side effect of an ordinary read.
   */
  private async resolveOwner(requester: CartRequester): Promise<CartOwner> {
    if (!requester.clerkId) {
      return { kind: 'guest', token: requester.token };
    }

    const customer = await this.customers.findByClerkId(requester.clerkId);

    return customer
      ? { kind: 'customer', customerId: customer.id }
      : { kind: 'guest', token: requester.token };
  }

  private async requireCustomer(requester: CartRequester): Promise<string> {
    const customer = requester.clerkId
      ? await this.customers.findByClerkId(requester.clerkId)
      : null;

    if (!customer) {
      throw new UnauthorizedException();
    }

    return customer.id;
  }

  private findCart(owner: CartOwner): Promise<CartRecord | null> {
    if (owner.kind === 'customer') {
      return this.carts.findActiveByCustomer(owner.customerId);
    }

    return owner.token
      ? this.carts.findActiveByToken(owner.token)
      : Promise.resolve(null);
  }

  private async createCart(owner: CartOwner): Promise<{
    cart: CartRecord;
    mintedToken: string | null;
  }> {
    if (owner.kind === 'customer') {
      return {
        cart: await this.carts.createForCustomer(owner.customerId),
        mintedToken: null,
      };
    }

    const token = mintCartToken();

    return { cart: await this.carts.createForGuest(token), mintedToken: token };
  }
}

/** 32 random bytes, so a token cannot be guessed into someone else's cart. */
function mintCartToken(): string {
  return randomBytes(32).toString('base64url');
}

function holdsLine(cart: CartRecord, article: ArticleIdentityDto): boolean {
  const key = articleIdentityKey(article.brandId, article.articleNumber);

  return cart.items.some(
    (item) => articleIdentityKey(item.brandId, item.articleNumber) === key,
  );
}

function isEmptyPatch(patch: CartLinePatch): boolean {
  return patch.quantity === undefined && patch.isSelected === undefined;
}

function throwAsHttpError(error: unknown): never {
  if (error instanceof CartCapacityConflictError) {
    throw new CartFullException();
  }

  if (error instanceof CartItemNotFoundError) {
    throw new CartItemNotFoundException();
  }

  if (
    error instanceof CartClosedError ||
    error instanceof CartVersionConflictError
  ) {
    throw new CartStaleException();
  }

  throw error;
}

function toMergedLine(line: StoredCartLine): MergedCartLine {
  return {
    brandId: line.brandId,
    articleNumber: line.articleNumber,
    quantity: line.quantity,
    brandName: line.brandName,
    brandLogoUrl: line.brandLogoUrl,
    description: line.description,
    thumbnailUrl: line.thumbnailUrl,
    addedAtPriceIncVat: line.addedAtPriceIncVat,
    shippingProfile: line.shippingProfile,
    isSelected: line.isSelected,
    addedAt: new Date(line.addedAt),
  };
}
