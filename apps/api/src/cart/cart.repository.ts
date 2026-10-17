import { Injectable } from '@nestjs/common';
import {
  ArticleIdentityDto,
  MAX_CART_LINES,
  MAX_CART_LINE_QUANTITY,
} from '@vp-parts-shop/shared';
import { Cart, CartItem, CartStatus, Prisma } from '../generated/prisma';
import { PrismaService } from '../prisma';
import { ResolvedShippingProfile, toShippingColumns } from './cart-shipping';

export type CartRecord = Cart & { items: CartItem[] };

/** The catalogue half of a line, as the surface adding it knows it. */
export interface CartLineInput extends ArticleIdentityDto {
  quantity: number;
  brandName: string;
  brandLogoUrl: string | null;
  description: string;
  thumbnailUrl: string | null;
  addedAtPriceIncVat: number | null;
  shippingProfile: ResolvedShippingProfile;
}

export interface CartLinePatch {
  quantity?: number;
  isSelected?: boolean;
}

/** A whole line as a merge decided it, timestamps and all. */
export interface MergedCartLine extends CartLineInput {
  isSelected: boolean;
  addedAt: Date;
}

/** Where a cart stands, read under its row lock. */
export interface LockedCart {
  status: CartStatus;
  version: number;
  orderId: string | null;
}

export interface CartOrderClosure {
  cartId: string;
  orderId: string;
  customerId: string;
}

/** How long a guest's cart survives its last touch. */
export const GUEST_CART_TTL_DAYS = 30;

/** Thrown by {@link CartRepository.mergeInto} when the target cart moved since the version the merge was computed against. */
export class CartVersionConflictError extends Error {
  constructor(cartId: string) {
    super(`Cart ${cartId} moved before the merge could commit.`);
  }
}

/** Thrown by a cart write that finds the cart already ordered or merged away. */
export class CartClosedError extends Error {
  constructor(cartId: string) {
    super(`Cart ${cartId} is no longer active.`);
  }
}

/** Thrown by {@link CartRepository.addLine} when a new line would push the cart past `MAX_CART_LINES`. */
export class CartCapacityConflictError extends Error {
  constructor(cartId: string) {
    super(`Cart ${cartId} already holds as many lines as it may.`);
  }
}

/** Thrown by {@link CartRepository.updateLine} when the line no longer exists to patch. */
export class CartItemNotFoundError extends Error {
  constructor(cartId: string) {
    super(`Cart ${cartId} no longer holds that line.`);
  }
}

const withItems = {
  items: { orderBy: { addedAt: 'asc' } },
} satisfies Prisma.CartInclude;

/**
 * All database access for carts.
 *
 * Every mutation here also raises the cart's `version` and pushes its expiry
 * out, in the same transaction as the line it changed — a cart whose contents
 * moved without its version moving would let checkout commit a price it never
 * quoted.
 *
 * Every write locks the cart's row before it touches a line. One lock order
 * keeps a line edit and an order of the same cart from deadlocking, and makes
 * the edit wait for the order and then see the cart is closed.
 */
@Injectable()
export class CartRepository {
  constructor(private readonly prisma: PrismaService) {}

  findActiveByToken(token: string): Promise<CartRecord | null> {
    return this.prisma.cart.findFirst({
      where: { token, status: CartStatus.ACTIVE },
      include: withItems,
    });
  }

  findActiveByCustomer(customerId: string): Promise<CartRecord | null> {
    return this.prisma.cart.findFirst({
      where: { customerId, status: CartStatus.ACTIVE },
      include: withItems,
    });
  }

  findById(cartId: string): Promise<CartRecord | null> {
    return this.prisma.cart.findUnique({
      where: { id: cartId },
      include: withItems,
    });
  }

  createForGuest(token: string): Promise<CartRecord> {
    return this.prisma.cart.create({
      data: { token, expiresAt: guestExpiry() },
      include: withItems,
    });
  }

  createForCustomer(customerId: string): Promise<CartRecord> {
    return this.prisma.cart.create({
      data: { customerId, expiresAt: guestExpiry() },
      include: withItems,
    });
  }

  /**
   * Adds a line, or raises an existing one by `quantity`. The reference price
   * and the added-at stamp belong to the first add: a line the customer keeps
   * topping up is still a part they first wanted at yesterday's price. The
   * shipping profile is catalogue data, so the latest read replaces it.
   *
   * The line count is read under the cart's row lock: two concurrent adds of
   * two *different* new articles would otherwise both read the same
   * under-the-limit count and both insert, since neither touches a row the
   * other holds a lock on.
   */
  async addLine(cartId: string, line: CartLineInput): Promise<CartRecord> {
    const { brandId, articleNumber, quantity, shippingProfile, ...catalog } =
      line;
    const identity = { cartId, brandId, articleNumber };
    const shippingColumns = toShippingColumns(shippingProfile);

    return this.mutate(cartId, async (tx) => {
      await this.assertRoomForLine(tx, identity);

      await tx.cartItem.upsert({
        where: { cartId_brandId_articleNumber: identity },
        create: {
          cartId,
          brandId,
          articleNumber,
          quantity,
          ...catalog,
          ...shippingColumns,
        },
        // Re-selected on the way in: adding a part is a statement that it is
        // wanted, whatever the line was set to before.
        update: {
          quantity: { increment: quantity },
          isSelected: true,
          ...shippingColumns,
        },
      });

      // The increment above has no ceiling of its own — a line raised past the
      // per-line maximum by repeated adds is clamped back down here, in the
      // same transaction as the write that could have pushed it over.
      await tx.cartItem.updateMany({
        where: { ...identity, quantity: { gt: MAX_CART_LINE_QUANTITY } },
        data: { quantity: MAX_CART_LINE_QUANTITY },
      });
    });
  }

  /**
   * `updateMany` rather than `update`: a line removed by another request
   * between the caller's read and this write must be reported the same way a
   * line that was never there is, not surface a raw "record not found" error.
   */
  async updateLine(
    cartId: string,
    { brandId, articleNumber }: ArticleIdentityDto,
    patch: CartLinePatch,
  ): Promise<CartRecord> {
    return this.mutate(cartId, async (tx) => {
      const { count } = await tx.cartItem.updateMany({
        where: { cartId, brandId, articleNumber },
        data: patch,
      });

      if (count === 0) {
        throw new CartItemNotFoundError(cartId);
      }
    });
  }

  async removeLine(
    cartId: string,
    { brandId, articleNumber }: ArticleIdentityDto,
  ): Promise<CartRecord> {
    return this.mutate(cartId, (tx) =>
      tx.cartItem.deleteMany({ where: { cartId, brandId, articleNumber } }),
    );
  }

  async setAllSelected(
    cartId: string,
    isSelected: boolean,
  ): Promise<CartRecord> {
    return this.mutate(cartId, (tx) =>
      tx.cartItem.updateMany({ where: { cartId }, data: { isSelected } }),
    );
  }

  async clear(cartId: string): Promise<CartRecord> {
    return this.mutate(cartId, (tx) =>
      tx.cartItem.deleteMany({ where: { cartId } }),
    );
  }

  /**
   * Hands a guest's cart to the customer who just signed in, when they had no
   * cart of their own. The token is dropped so the browser that held it cannot
   * keep reaching into an account's cart.
   */
  claimForCustomer(cartId: string, customerId: string): Promise<CartRecord> {
    return this.prisma.cart.update({
      where: { id: cartId },
      data: {
        customerId,
        token: null,
        version: { increment: 1 },
        expiresAt: guestExpiry(),
      },
      include: withItems,
    });
  }

  /**
   * Replaces the target cart's lines with the merged set and retires the source
   * cart, in one transaction — a half-applied merge would either lose lines or
   * leave them reachable from two carts at once.
   *
   * The lines are written whole rather than patched line by line: the merge was
   * already decided in full by {@link mergeCartLines}, and rewriting the set is
   * the only way the result cannot depend on the order the writes landed in.
   *
   * `targetVersion` is the version the merge was computed against, checked
   * under the target's row lock before any line is touched: a write that
   * landed between the read and this commit — another tab, or an order of
   * that cart — would otherwise be silently overwritten by a merge that never
   * saw it.
   */
  async mergeInto(
    targetCartId: string,
    targetVersion: number,
    sourceCartId: string,
    lines: MergedCartLine[],
  ): Promise<CartRecord> {
    return this.prisma.$transaction(async (tx) => {
      const target = await this.lockCart(tx, targetCartId);

      if (
        target?.status !== CartStatus.ACTIVE ||
        target.version !== targetVersion
      ) {
        throw new CartVersionConflictError(targetCartId);
      }

      await tx.cartItem.deleteMany({ where: { cartId: targetCartId } });
      await tx.cartItem.createMany({
        data: lines.map(({ shippingProfile, ...line }) => ({
          cartId: targetCartId,
          ...line,
          ...toShippingColumns(shippingProfile),
        })),
      });

      await tx.cart.update({
        where: { id: sourceCartId },
        data: {
          status: CartStatus.MERGED,
          token: null,
          mergedIntoId: targetCartId,
        },
      });

      return tx.cart.update({
        where: { id: targetCartId },
        data: { version: { increment: 1 }, expiresAt: guestExpiry() },
        include: withItems,
      });
    });
  }

  /**
   * Drops guest carts nobody has touched inside the TTL. Customer carts are
   * left alone: cross-device continuity is the reason they are on the server.
   *
   * `orderId: null` is a belt-and-suspenders check alongside `status`: an
   * ordered cart should already be excluded by status, but this is one
   * `deleteMany` statement, so a single row that ever violated that invariant
   * would fail the whole sweep against the `Cart.order` foreign key instead of
   * just being skipped.
   */
  async deleteExpiredGuestCarts(now: Date): Promise<number> {
    const { count } = await this.prisma.cart.deleteMany({
      where: {
        status: CartStatus.ACTIVE,
        customerId: null,
        orderId: null,
        expiresAt: { lt: now },
      },
    });

    return count;
  }

  /**
   * Locks the cart's row for the rest of `tx` and reads where it stands then:
   * a concurrent write to the same cart waits here, and sees the first one's
   * commit. Null when there is no such cart.
   */
  async lockCart(
    tx: Prisma.TransactionClient,
    cartId: string,
  ): Promise<LockedCart | null> {
    const [locked] = await tx.$queryRaw<LockedCart[]>`
      SELECT status, version, "orderId" FROM "Cart" WHERE id = ${cartId} FOR UPDATE`;

    return locked ?? null;
  }

  /**
   * Retires an ordered cart as the record of what was bought, and carries the
   * lines left unselected into a fresh active cart, as they were. Retired
   * first: a customer may hold only one active cart. The version moves too, so
   * a merge computed against the cart before the order is refused.
   */
  async closeForOrder(
    tx: Prisma.TransactionClient,
    { cartId, orderId, customerId }: CartOrderClosure,
  ): Promise<void> {
    await tx.cart.update({
      where: { id: cartId },
      data: {
        status: CartStatus.ORDERED,
        orderId,
        version: { increment: 1 },
      },
    });

    const unselected = { cartId, isSelected: false };

    if ((await tx.cartItem.count({ where: unselected })) === 0) {
      return;
    }

    const next = await tx.cart.create({
      data: { customerId, expiresAt: guestExpiry() },
    });

    await tx.cartItem.updateMany({
      where: unselected,
      data: { cartId: next.id },
    });
  }

  private mutate(
    cartId: string,
    change: (tx: Prisma.TransactionClient) => Promise<unknown>,
  ): Promise<CartRecord> {
    return this.prisma.$transaction(async (tx) => {
      const cart = await this.lockCart(tx, cartId);

      if (cart?.status !== CartStatus.ACTIVE) {
        throw new CartClosedError(cartId);
      }

      await change(tx);

      return tx.cart.update({
        where: { id: cartId },
        data: { version: { increment: 1 }, expiresAt: guestExpiry() },
        include: withItems,
      });
    });
  }

  /**
   * Raising a line already in the cart never needs room — it costs the line
   * count nothing. Only a genuinely new identity can push the cart over
   * `MAX_CART_LINES`, so only that case is checked.
   */
  private async assertRoomForLine(
    tx: Prisma.TransactionClient,
    identity: { cartId: string; brandId: string; articleNumber: string },
  ): Promise<void> {
    const alreadyHeld = (await tx.cartItem.count({ where: identity })) > 0;

    if (alreadyHeld) {
      return;
    }

    const lineCount = await tx.cartItem.count({
      where: { cartId: identity.cartId },
    });

    if (lineCount >= MAX_CART_LINES) {
      throw new CartCapacityConflictError(identity.cartId);
    }
  }
}

function guestExpiry(): Date {
  return new Date(Date.now() + GUEST_CART_TTL_DAYS * 24 * 60 * 60 * 1000);
}
