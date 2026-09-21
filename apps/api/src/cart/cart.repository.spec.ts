import { Test } from '@nestjs/testing';
import { MAX_CART_LINES, MAX_CART_LINE_QUANTITY } from '@vp-parts-shop/shared';
import { PrismaService } from '../prisma';
import {
  CartCapacityConflictError,
  CartItemNotFoundError,
  CartRepository,
  CartVersionConflictError,
  GUEST_CART_TTL_DAYS,
} from './cart.repository';

const LINE = {
  brandId: '30',
  articleNumber: '0986479061',
  quantity: 2,
  brandName: 'BOSCH',
  brandLogoUrl: null,
  description: 'Спирачен диск',
  thumbnailUrl: null,
  addedAtPriceIncVat: 4500,
};

const MERGED_LINE = {
  ...LINE,
  isSelected: true,
  addedAt: new Date('2026-09-01'),
};

describe('CartRepository', () => {
  const cartUpdate = jest.fn();
  const cartUpdateMany = jest.fn();
  const cartFindUniqueOrThrow = jest.fn();
  const cartFindFirst = jest.fn();
  const cartCreate = jest.fn();
  const cartDeleteMany = jest.fn();
  const itemUpsert = jest.fn();
  const itemUpdateMany = jest.fn();
  const itemDeleteMany = jest.fn();
  const itemCreateMany = jest.fn();
  const itemCount = jest.fn();
  const queryRaw = jest.fn();

  const tx = {
    cart: {
      update: cartUpdate,
      updateMany: cartUpdateMany,
      findUniqueOrThrow: cartFindUniqueOrThrow,
    },
    cartItem: {
      upsert: itemUpsert,
      updateMany: itemUpdateMany,
      deleteMany: itemDeleteMany,
      createMany: itemCreateMany,
      count: itemCount,
    },
    $queryRaw: queryRaw,
  };

  const transaction = jest.fn();
  const prisma = {
    cart: {
      findFirst: cartFindFirst,
      findUnique: jest.fn(),
      create: cartCreate,
      update: cartUpdate,
      deleteMany: cartDeleteMany,
    },
    cartItem: {},
    $transaction: transaction,
  } as unknown as PrismaService;

  let repository: CartRepository;

  beforeEach(async () => {
    jest.resetAllMocks();
    transaction.mockImplementation((run: (client: typeof tx) => unknown) =>
      run(tx),
    );
    cartUpdate.mockResolvedValue({ id: 'cart-1', items: [] });
    cartUpdateMany.mockResolvedValue({ count: 1 });
    cartFindUniqueOrThrow.mockResolvedValue({ id: 'target', items: [] });
    itemUpdateMany.mockResolvedValue({ count: 1 });
    itemCount.mockResolvedValue(0);
    queryRaw.mockResolvedValue([]);

    const moduleRef = await Test.createTestingModule({
      providers: [CartRepository, { provide: PrismaService, useValue: prisma }],
    }).compile();

    repository = moduleRef.get(CartRepository);
  });

  // The version is what checkout pins the price it quoted to, so contents that
  // moved without it moving would let an order commit a price never quoted.
  describe('every mutation, in one transaction', () => {
    it.each([
      ['addLine', () => repository.addLine('cart-1', LINE)],
      [
        'updateLine',
        () =>
          repository.updateLine(
            'cart-1',
            { brandId: '30', articleNumber: '0986479061' },
            { quantity: 4 },
          ),
      ],
      [
        'removeLine',
        () =>
          repository.removeLine('cart-1', {
            brandId: '30',
            articleNumber: '0986479061',
          }),
      ],
      ['setAllSelected', () => repository.setAllSelected('cart-1', false)],
      ['clear', () => repository.clear('cart-1')],
    ])('%s raises the version', async (_name, mutate) => {
      await mutate();

      expect(transaction).toHaveBeenCalledTimes(1);
      expect(cartUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'cart-1' },
          data: expect.objectContaining({ version: { increment: 1 } }),
        }),
      );
    });

    it('pushes the expiry out by the guest TTL', async () => {
      const before = Date.now();

      await repository.clear('cart-1');

      const { data } = cartUpdate.mock.calls[0][0] as {
        data: { expiresAt: Date };
      };
      const days = (data.expiresAt.getTime() - before) / (24 * 60 * 60 * 1000);
      expect(days).toBeCloseTo(GUEST_CART_TTL_DAYS, 1);
    });
  });

  // Two suppliers file the same number for different parts, so a number-keyed
  // upsert would fold one company's part into the other's line.
  it('keys a line on the whole article identity', async () => {
    await repository.addLine('cart-1', LINE);

    expect(itemUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          cartId_brandId_articleNumber: {
            cartId: 'cart-1',
            brandId: '30',
            articleNumber: '0986479061',
          },
        },
      }),
    );
  });

  it('raises an existing line rather than replacing it', async () => {
    await repository.addLine('cart-1', LINE);

    const { update } = itemUpsert.mock.calls[0][0] as {
      update: Record<string, unknown>;
    };
    expect(update).toEqual({ quantity: { increment: 2 }, isSelected: true });
  });

  // The increment on the upsert above has no ceiling of its own; this clamp,
  // in the same transaction, is what keeps a line from being raised past its
  // per-line maximum by repeated adds.
  it('clamps a raised line back down to the per-line maximum, in the same transaction', async () => {
    await repository.addLine('cart-1', LINE);

    expect(itemUpdateMany).toHaveBeenCalledWith({
      where: {
        cartId: 'cart-1',
        brandId: '30',
        articleNumber: '0986479061',
        quantity: { gt: MAX_CART_LINE_QUANTITY },
      },
      data: { quantity: MAX_CART_LINE_QUANTITY },
    });
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  // Two concurrent adds of two *different* new articles would otherwise both
  // read the same under-the-limit count and both insert, since neither add
  // touches a row the other holds a lock on.
  it('locks the cart row before checking how many lines it holds', async () => {
    await repository.addLine('cart-1', LINE);

    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(itemCount).toHaveBeenCalledWith({
      where: { cartId: 'cart-1', brandId: '30', articleNumber: '0986479061' },
    });
  });

  it('refuses a new line once the locked cart already holds the maximum', async () => {
    itemCount
      .mockResolvedValueOnce(0) // this identity is not already in the cart
      .mockResolvedValueOnce(MAX_CART_LINES); // the cart is already full

    await expect(repository.addLine('cart-1', LINE)).rejects.toThrow(
      CartCapacityConflictError,
    );
    expect(itemUpsert).not.toHaveBeenCalled();
  });

  it('still raises an existing line even when the cart is at the maximum', async () => {
    itemCount.mockResolvedValueOnce(1); // this identity is already in the cart

    await expect(repository.addLine('cart-1', LINE)).resolves.toBeDefined();
    expect(itemUpsert).toHaveBeenCalledTimes(1);
  });

  // Deleted by another request between the caller's read and this write, the
  // line must be reported the same way a line that was never there is — not
  // surface a raw "record not found" error to the client.
  it('reports a line updateLine no longer finds instead of throwing raw', async () => {
    itemUpdateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      repository.updateLine(
        'cart-1',
        { brandId: '30', articleNumber: '0986479061' },
        { quantity: 4 },
      ),
    ).rejects.toThrow(CartItemNotFoundError);
  });

  it('reads back only the cart it was asked for, in the order lines went in', async () => {
    await repository.findActiveByToken('a-token');

    expect(cartFindFirst).toHaveBeenCalledWith({
      where: { token: 'a-token', status: 'ACTIVE' },
      include: { items: { orderBy: { addedAt: 'asc' } } },
    });
  });

  describe('mergeInto', () => {
    it('rewrites the target lines and retires the source, together', async () => {
      await repository.mergeInto('target', 3, 'source', [
        { ...LINE, isSelected: true, addedAt: new Date('2026-09-01') },
      ]);

      expect(transaction).toHaveBeenCalledTimes(1);
      expect(itemDeleteMany).toHaveBeenCalledWith({
        where: { cartId: 'target' },
      });
      expect(itemCreateMany).toHaveBeenCalledWith({
        data: [expect.objectContaining({ cartId: 'target', brandId: '30' })],
      });
      expect(cartUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'source' },
          data: expect.objectContaining({
            status: 'MERGED',
            token: null,
            mergedIntoId: 'target',
          }),
        }),
      );
    });

    it('commits the target cart only if it is still at the version the merge was computed against', async () => {
      await repository.mergeInto('target', 3, 'source', [MERGED_LINE]);

      expect(cartUpdateMany).toHaveBeenCalledWith({
        where: { id: 'target', version: 3 },
        data: expect.objectContaining({ version: { increment: 1 } }),
      });
      expect(cartFindUniqueOrThrow).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'target' } }),
      );
    });

    // Another tab or device wrote to the target cart between the merge being
    // read and this commit — the whole transaction must roll back rather than
    // overwrite a change the merge never saw.
    it('throws instead of committing when the target cart has moved on', async () => {
      cartUpdateMany.mockResolvedValue({ count: 0 });

      await expect(
        repository.mergeInto('target', 3, 'source', [MERGED_LINE]),
      ).rejects.toThrow(CartVersionConflictError);
      expect(cartFindUniqueOrThrow).not.toHaveBeenCalled();
    });
  });

  // A customer's cart is the reason theirs is on the server at all.
  it('sweeps only expired guest carts', async () => {
    cartDeleteMany.mockResolvedValue({ count: 3 });
    const now = new Date('2026-09-19T00:00:00.000Z');

    await expect(repository.deleteExpiredGuestCarts(now)).resolves.toBe(3);
    expect(cartDeleteMany).toHaveBeenCalledWith({
      where: {
        status: 'ACTIVE',
        customerId: null,
        orderId: null,
        expiresAt: { lt: now },
      },
    });
  });
});
