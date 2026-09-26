import { Test } from '@nestjs/testing';
import { EMPTY_CART, MAX_CART_LINES } from '@vp-parts-shop/shared';
import { ArticleNotFoundException, ArticleReadCache } from '../catalog';
import { CustomersService } from '../customers';
import { CatalogUnavailableException } from '../tecdoc';
import {
  CartCapacityConflictError,
  CartItemNotFoundError,
  CartRecord,
  CartRepository,
  CartVersionConflictError,
  MergedCartLine,
} from './cart.repository';
import { CartService, NewCartLine } from './cart.service';
import {
  CartFullException,
  CartItemNotFoundException,
  CartMergeConflictException,
} from './cart.exceptions';

const TOKEN = 'a'.repeat(43);

const SHIPPING_PROFILE = {
  weightGrams: 2000,
  packageCm: { length: 30, width: 20, height: 10 },
};

function item(overrides: Partial<CartRecord['items'][number]> = {}) {
  return {
    id: 'item-1',
    cartId: 'cart-1',
    brandId: '30',
    articleNumber: '0986479061',
    brandName: 'BOSCH',
    brandLogoUrl: null,
    description: 'Спирачен диск',
    thumbnailUrl: null,
    quantity: 1,
    isSelected: true,
    addedAtPriceIncVat: 4500,
    weightGrams: 2000,
    packageLengthCm: 30,
    packageWidthCm: 20,
    packageHeightCm: 10,
    addedAt: new Date('2026-09-01T10:00:00.000Z'),
    updatedAt: new Date('2026-09-01T10:00:00.000Z'),
    ...overrides,
  };
}

function cart(overrides: Partial<CartRecord> = {}): CartRecord {
  return {
    id: 'cart-1',
    token: TOKEN,
    customerId: null,
    status: 'ACTIVE',
    version: 3,
    mergedIntoId: null,
    orderId: null,
    expiresAt: new Date('2026-10-01T00:00:00.000Z'),
    createdAt: new Date('2026-09-01T10:00:00.000Z'),
    updatedAt: new Date('2026-09-01T10:00:00.000Z'),
    items: [item()],
    ...overrides,
  };
}

function lineInput(overrides: Partial<NewCartLine> = {}): NewCartLine {
  return {
    brandId: '30',
    articleNumber: '0986479061',
    quantity: 1,
    brandName: 'BOSCH',
    brandLogoUrl: null,
    description: 'Спирачен диск',
    thumbnailUrl: null,
    addedAtPriceIncVat: 4500,
    ...overrides,
  };
}

describe('CartService', () => {
  let service: CartService;

  // Held as standalone mocks rather than read back off the injected object, so
  // an assertion never separates a method from its receiver.
  const findActiveByToken = jest.fn();
  const findActiveByCustomer = jest.fn();
  const findById = jest.fn();
  const createForGuest = jest.fn();
  const createForCustomer = jest.fn();
  const addLine = jest.fn();
  const updateLine = jest.fn();
  const removeLine = jest.fn();
  const setAllSelected = jest.fn();
  const clear = jest.fn();
  const claimForCustomer = jest.fn();
  const mergeInto = jest.fn();
  const deleteExpiredGuestCarts = jest.fn();
  const findByClerkId = jest.fn();
  const readArticle = jest.fn();

  const repository = {
    findActiveByToken,
    findActiveByCustomer,
    findById,
    createForGuest,
    createForCustomer,
    addLine,
    updateLine,
    removeLine,
    setAllSelected,
    clear,
    claimForCustomer,
    mergeInto,
    deleteExpiredGuestCarts,
  } as unknown as CartRepository;
  const customers = { findByClerkId } as unknown as CustomersService;
  const articles = { read: readArticle } as unknown as ArticleReadCache;

  beforeEach(async () => {
    jest.resetAllMocks();
    readArticle.mockResolvedValue({ shippingProfile: SHIPPING_PROFILE });

    const moduleRef = await Test.createTestingModule({
      providers: [
        CartService,
        { provide: CartRepository, useValue: repository },
        { provide: CustomersService, useValue: customers },
        { provide: ArticleReadCache, useValue: articles },
      ],
    }).compile();

    service = moduleRef.get(CartService);
  });

  describe('getCart', () => {
    it('is empty for a visitor who has never added anything', async () => {
      const result = await service.getCart({ clerkId: null, token: null });

      expect(result).toEqual(EMPTY_CART);
      expect(findActiveByToken).not.toHaveBeenCalled();
    });

    it('never creates a cart', async () => {
      findActiveByToken.mockResolvedValue(null);

      const result = await service.getCart({ clerkId: null, token: TOKEN });

      expect(result).toEqual(EMPTY_CART);
      expect(createForGuest).not.toHaveBeenCalled();
    });

    it('reads a guest cart by its token', async () => {
      findActiveByToken.mockResolvedValue(cart());

      const result = await service.getCart({ clerkId: null, token: TOKEN });

      expect(findActiveByToken).toHaveBeenCalledWith(TOKEN);
      expect(result.id).toBe('cart-1');
      expect(result.version).toBe(3);
      expect(result.lines).toHaveLength(1);
    });

    it('prefers the account cart over a guest token still in hand', async () => {
      findByClerkId.mockResolvedValue({
        id: 'customer-1',
        clerkId: 'clerk-1',
        role: 'CUSTOMER',
      });
      findActiveByCustomer.mockResolvedValue(
        cart({ id: 'cart-account', token: null, customerId: 'customer-1' }),
      );

      const result = await service.getCart({
        clerkId: 'clerk-1',
        token: TOKEN,
      });

      expect(result.id).toBe('cart-account');
      expect(findActiveByToken).not.toHaveBeenCalled();
    });

    it('falls back to the guest cart when Clerk knows someone we do not', async () => {
      findByClerkId.mockResolvedValue(null);
      findActiveByToken.mockResolvedValue(cart());

      const result = await service.getCart({
        clerkId: 'clerk-1',
        token: TOKEN,
      });

      expect(result.id).toBe('cart-1');
    });

    it('carries the stored reference price without pricing anything', async () => {
      findActiveByToken.mockResolvedValue(cart());

      const [line] = (await service.getCart({ clerkId: null, token: TOKEN }))
        .lines;

      expect(line.addedAtPriceIncVat).toBe(4500);
      expect(line.addedAt).toBe('2026-09-01T10:00:00.000Z');
      expect(line).not.toHaveProperty('unitPriceIncVat');
    });
  });

  describe('addLine', () => {
    it('mints a guest cart on the first add and reports the token', async () => {
      createForGuest.mockImplementation((token) =>
        Promise.resolve(cart({ token, items: [] })),
      );
      addLine.mockResolvedValue(cart());

      const result = await service.addLine(
        { clerkId: null, token: null },
        lineInput(),
      );

      expect(createForGuest).toHaveBeenCalledTimes(1);
      expect(result.mintedToken).toBe(createForGuest.mock.calls[0][0]);
      expect(result.cart.lines).toHaveLength(1);
    });

    it('mints a token of 32 random bytes in base64url', async () => {
      createForGuest.mockImplementation((token) =>
        Promise.resolve(cart({ token, items: [] })),
      );
      addLine.mockResolvedValue(cart());

      await service.addLine({ clerkId: null, token: null }, lineInput());

      const [token] = createForGuest.mock.calls[0];
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });

    it('does not report a token when adding to a cart that already existed', async () => {
      findActiveByToken.mockResolvedValue(cart());
      addLine.mockResolvedValue(cart());

      const result = await service.addLine(
        { clerkId: null, token: TOKEN },
        lineInput(),
      );

      expect(result.mintedToken).toBeNull();
      expect(createForGuest).not.toHaveBeenCalled();
    });

    it('stores the shipping profile the catalogue holds for the part', async () => {
      findActiveByToken.mockResolvedValue(cart());
      addLine.mockResolvedValue(cart());

      await service.addLine({ clerkId: null, token: TOKEN }, lineInput());

      expect(readArticle).toHaveBeenCalledWith(30, '0986479061');
      expect(addLine).toHaveBeenCalledWith('cart-1', {
        ...lineInput(),
        shippingProfile: SHIPPING_PROFILE,
      });
    });

    it('refuses a part the catalogue does not hold, before minting a cart', async () => {
      readArticle.mockRejectedValue(new ArticleNotFoundException());

      await expect(
        service.addLine({ clerkId: null, token: null }, lineInput()),
      ).rejects.toBeInstanceOf(ArticleNotFoundException);
      expect(createForGuest).not.toHaveBeenCalled();
      expect(addLine).not.toHaveBeenCalled();
    });

    it('writes nothing while the catalogue is unreachable', async () => {
      findActiveByToken.mockResolvedValue(cart());
      readArticle.mockRejectedValue(new CatalogUnavailableException());

      await expect(
        service.addLine({ clerkId: null, token: TOKEN }, lineInput()),
      ).rejects.toBeInstanceOf(CatalogUnavailableException);
      expect(addLine).not.toHaveBeenCalled();
    });

    // The capacity limit itself is enforced atomically by the repository, in
    // the same transaction as the insert — see cart.repository.spec.ts. Here
    // we only check that the service maps that outcome to the right HTTP
    // exception rather than swallowing it, and never skips the repository
    // call to decide capacity from its own (possibly stale) read.
    it('maps the repository refusing a full cart to CartFullException', async () => {
      findActiveByToken.mockResolvedValue(cart());
      addLine.mockRejectedValue(new CartCapacityConflictError('cart-1'));

      await expect(
        service.addLine(
          { clerkId: null, token: TOKEN },
          lineInput({ articleNumber: 'ONE-TOO-MANY' }),
        ),
      ).rejects.toBeInstanceOf(CartFullException);
      expect(addLine).toHaveBeenCalledTimes(1);
    });

    it('lets an unrelated repository error through unchanged', async () => {
      findActiveByToken.mockResolvedValue(cart());
      const unrelated = new Error('connection lost');
      addLine.mockRejectedValue(unrelated);

      await expect(
        service.addLine({ clerkId: null, token: TOKEN }, lineInput()),
      ).rejects.toBe(unrelated);
    });

    it('creates the account cart for a signed-in customer who has none', async () => {
      findByClerkId.mockResolvedValue({
        id: 'customer-1',
        clerkId: 'clerk-1',
        role: 'CUSTOMER',
      });
      findActiveByCustomer.mockResolvedValue(null);
      createForCustomer.mockResolvedValue(
        cart({ token: null, customerId: 'customer-1', items: [] }),
      );
      addLine.mockResolvedValue(cart({ token: null }));

      const result = await service.addLine(
        { clerkId: 'clerk-1', token: null },
        lineInput(),
      );

      expect(createForCustomer).toHaveBeenCalledWith('customer-1');
      expect(result.mintedToken).toBeNull();
    });
  });

  describe('getShippingLines', () => {
    it('answers the selected lines with the profile stored on each', async () => {
      findActiveByToken.mockResolvedValue(
        cart({
          items: [
            item({ quantity: 2 }),
            item({ articleNumber: 'OC90', isSelected: false }),
            item({
              articleNumber: 'P85020',
              weightGrams: null,
              packageLengthCm: null,
              packageWidthCm: null,
              packageHeightCm: null,
            }),
          ],
        }),
      );

      const { cart: dto, lines } = await service.getShippingLines({
        clerkId: null,
        token: TOKEN,
      });

      expect(dto.lines).toHaveLength(3);
      expect(lines).toEqual([
        {
          article: { brandId: '30', articleNumber: '0986479061' },
          quantity: 2,
          shippingProfile: SHIPPING_PROFILE,
        },
        {
          article: { brandId: '30', articleNumber: 'P85020' },
          quantity: 1,
          shippingProfile: { weightGrams: null, packageCm: null },
        },
      ]);
    });

    it('is empty for a visitor with no cart', async () => {
      const result = await service.getShippingLines({
        clerkId: null,
        token: null,
      });

      expect(result).toEqual({ cart: EMPTY_CART, lines: [] });
    });
  });

  describe('updateLine', () => {
    it('patches quantity and selection together', async () => {
      findActiveByToken.mockResolvedValue(cart());
      updateLine.mockResolvedValue(cart());

      await service.updateLine(
        { clerkId: null, token: TOKEN },
        { brandId: '30', articleNumber: '0986479061' },
        { quantity: 4, isSelected: false },
      );

      expect(updateLine).toHaveBeenCalledWith(
        'cart-1',
        { brandId: '30', articleNumber: '0986479061' },
        { quantity: 4, isSelected: false },
      );
    });

    it('rejects a patch that changes nothing', async () => {
      findActiveByToken.mockResolvedValue(cart());

      await expect(
        service.updateLine(
          { clerkId: null, token: TOKEN },
          { brandId: '30', articleNumber: '0986479061' },
          {},
        ),
      ).rejects.toBeInstanceOf(CartItemNotFoundException);
    });

    it('reports a line the cart no longer holds', async () => {
      findActiveByToken.mockResolvedValue(cart());

      await expect(
        service.updateLine(
          { clerkId: null, token: TOKEN },
          { brandId: '30', articleNumber: 'GONE' },
          { quantity: 2 },
        ),
      ).rejects.toBeInstanceOf(CartItemNotFoundException);
      expect(updateLine).not.toHaveBeenCalled();
    });

    it('reports a patch against a cart that does not exist', async () => {
      findActiveByToken.mockResolvedValue(null);

      await expect(
        service.updateLine(
          { clerkId: null, token: TOKEN },
          { brandId: '30', articleNumber: '0986479061' },
          { quantity: 2 },
        ),
      ).rejects.toBeInstanceOf(CartItemNotFoundException);
    });

    // The pre-check above reads a possibly stale cart; this is the case where
    // the line was still there at that read but another request removed it
    // before this write landed. The repository is the one that catches it.
    it('maps a line removed between the read and the write to CartItemNotFoundException', async () => {
      findActiveByToken.mockResolvedValue(cart());
      updateLine.mockRejectedValue(new CartItemNotFoundError('cart-1'));

      await expect(
        service.updateLine(
          { clerkId: null, token: TOKEN },
          { brandId: '30', articleNumber: '0986479061' },
          { quantity: 4 },
        ),
      ).rejects.toBeInstanceOf(CartItemNotFoundException);
    });

    it('lets an unrelated repository error through unchanged', async () => {
      findActiveByToken.mockResolvedValue(cart());
      const unrelated = new Error('connection lost');
      updateLine.mockRejectedValue(unrelated);

      await expect(
        service.updateLine(
          { clerkId: null, token: TOKEN },
          { brandId: '30', articleNumber: '0986479061' },
          { quantity: 4 },
        ),
      ).rejects.toBe(unrelated);
    });
  });

  describe('removeLine', () => {
    it('removes the line', async () => {
      findActiveByToken.mockResolvedValue(cart());
      removeLine.mockResolvedValue(cart({ items: [] }));

      const result = await service.removeLine(
        { clerkId: null, token: TOKEN },
        { brandId: '30', articleNumber: '0986479061' },
      );

      expect(result.lines).toEqual([]);
    });

    it('succeeds against a cart that is already gone', async () => {
      findActiveByToken.mockResolvedValue(null);

      const result = await service.removeLine(
        { clerkId: null, token: TOKEN },
        { brandId: '30', articleNumber: '0986479061' },
      );

      expect(result).toEqual(EMPTY_CART);
      expect(removeLine).not.toHaveBeenCalled();
    });
  });

  describe('setAllSelected / clear', () => {
    it('sets every line at once', async () => {
      findActiveByToken.mockResolvedValue(cart());
      setAllSelected.mockResolvedValue(
        cart({ items: [item({ isSelected: false })] }),
      );

      const result = await service.setAllSelected(
        { clerkId: null, token: TOKEN },
        false,
      );

      expect(setAllSelected).toHaveBeenCalledWith('cart-1', false);
      expect(result.lines[0].isSelected).toBe(false);
    });

    it('clears the cart', async () => {
      findActiveByToken.mockResolvedValue(cart());
      clear.mockResolvedValue(cart({ items: [] }));

      const result = await service.clear({ clerkId: null, token: TOKEN });

      expect(result.lines).toEqual([]);
    });

    it('clears a cart that does not exist without creating one', async () => {
      findActiveByToken.mockResolvedValue(null);

      await expect(
        service.clear({ clerkId: null, token: TOKEN }),
      ).resolves.toEqual(EMPTY_CART);
      expect(createForGuest).not.toHaveBeenCalled();
    });
  });

  describe('adopt', () => {
    beforeEach(() => {
      findByClerkId.mockResolvedValue({
        id: 'customer-1',
        clerkId: 'clerk-1',
        role: 'CUSTOMER',
      });
    });

    it('hands the guest cart over when the account has none', async () => {
      findActiveByToken.mockResolvedValue(cart());
      findActiveByCustomer.mockResolvedValue(null);
      claimForCustomer.mockResolvedValue(
        cart({ token: null, customerId: 'customer-1' }),
      );

      const result = await service.adopt({ clerkId: 'clerk-1', token: TOKEN });

      expect(claimForCustomer).toHaveBeenCalledWith('cart-1', 'customer-1');
      expect(mergeInto).not.toHaveBeenCalled();
      expect(result.droppedLines).toEqual([]);
    });

    it('sums the quantities of a part both carts hold', async () => {
      findActiveByToken.mockResolvedValue(
        cart({ id: 'cart-guest', items: [item({ quantity: 3 })] }),
      );
      findActiveByCustomer.mockResolvedValue(
        cart({
          id: 'cart-account',
          token: null,
          customerId: 'customer-1',
          items: [item({ quantity: 2 })],
        }),
      );
      mergeInto.mockResolvedValue(
        cart({ id: 'cart-account', items: [item({ quantity: 5 })] }),
      );

      await service.adopt({ clerkId: 'clerk-1', token: TOKEN });

      const [targetId, targetVersion, sourceId, lines] =
        mergeInto.mock.calls[0];
      expect(targetId).toBe('cart-account');
      expect(targetVersion).toBe(3);
      expect(sourceId).toBe('cart-guest');
      expect(lines).toHaveLength(1);
      expect(lines[0].quantity).toBe(5);
    });

    it('keeps the stored shipping profile of every merged line', async () => {
      findActiveByToken.mockResolvedValue(
        cart({ id: 'cart-guest', items: [item({ articleNumber: 'OC90' })] }),
      );
      findActiveByCustomer.mockResolvedValue(
        cart({ id: 'cart-account', token: null, customerId: 'customer-1' }),
      );
      mergeInto.mockResolvedValue(cart({ id: 'cart-account' }));

      await service.adopt({ clerkId: 'clerk-1', token: TOKEN });

      const lines = mergeInto.mock.calls[0][3] as MergedCartLine[];
      expect(lines).toHaveLength(2);
      expect(lines.map((line) => line.shippingProfile)).toEqual([
        SHIPPING_PROFILE,
        SHIPPING_PROFILE,
      ]);
    });

    // Another tab or device wrote to the account cart between this merge being
    // computed and committed. The customer answers by re-reading and retrying,
    // not by silently losing whichever line lost the race.
    it('turns a version conflict during merge into a client-facing error', async () => {
      findActiveByToken.mockResolvedValue(
        cart({ id: 'cart-guest', items: [item({ quantity: 3 })] }),
      );
      findActiveByCustomer.mockResolvedValue(
        cart({ id: 'cart-account', token: null, customerId: 'customer-1' }),
      );
      mergeInto.mockRejectedValue(new CartVersionConflictError('cart-account'));

      await expect(
        service.adopt({ clerkId: 'clerk-1', token: TOKEN }),
      ).rejects.toBeInstanceOf(CartMergeConflictException);
    });

    it('reports the lines a full account cart had no room for', async () => {
      findActiveByToken.mockResolvedValue(
        cart({
          id: 'cart-guest',
          items: [item({ articleNumber: 'EXTRA' })],
        }),
      );
      findActiveByCustomer.mockResolvedValue(
        cart({
          id: 'cart-account',
          token: null,
          customerId: 'customer-1',
          items: Array.from({ length: MAX_CART_LINES }, (_, index) =>
            item({ id: `item-${index}`, articleNumber: `NUM-${index}` }),
          ),
        }),
      );
      mergeInto.mockResolvedValue(cart({ id: 'cart-account' }));

      const result = await service.adopt({ clerkId: 'clerk-1', token: TOKEN });

      expect(result.droppedLines).toEqual([
        { brandId: '30', articleNumber: 'EXTRA' },
      ]);
    });

    it('is a no-op when there is no guest cart to adopt', async () => {
      findActiveByCustomer.mockResolvedValue(
        cart({ id: 'cart-account', token: null, customerId: 'customer-1' }),
      );

      const result = await service.adopt({ clerkId: 'clerk-1', token: null });

      expect(result.cart.id).toBe('cart-account');
      expect(mergeInto).not.toHaveBeenCalled();
      expect(claimForCustomer).not.toHaveBeenCalled();
    });

    it('refuses to adopt for someone we have no customer row for', async () => {
      findByClerkId.mockResolvedValue(null);

      await expect(
        service.adopt({ clerkId: 'clerk-1', token: TOKEN }),
      ).rejects.toThrow();
    });

    it('refuses to adopt without a signed-in identity', async () => {
      await expect(
        service.adopt({ clerkId: null, token: TOKEN }),
      ).rejects.toThrow();
    });
  });

  describe('sweepExpiredGuestCarts', () => {
    it('deletes the expired guest carts and reports how many', async () => {
      deleteExpiredGuestCarts.mockResolvedValue(7);

      await expect(service.sweepExpiredGuestCarts()).resolves.toBe(7);
      expect(deleteExpiredGuestCarts).toHaveBeenCalledTimes(1);
    });
  });
});
