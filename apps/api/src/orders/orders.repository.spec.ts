import { Test } from '@nestjs/testing';
import { DeliveryMethod, ShippingMethod } from '@vp-parts-shop/shared';
import { CartRepository } from '../cart';
import { OutboxRepository } from '../events';
import { PrismaService } from '../prisma';
import { NewOrder, OrdersRepository } from './orders.repository';

const ORDER: NewOrder = {
  cartId: 'cart-1',
  cartVersion: 7,
  customerId: 'customer-1',
  contact: {
    firstName: 'Иван',
    lastName: 'Петров',
    phone: '+359888123456',
    email: 'ivan@example.com',
  },
  items: [
    {
      brandId: '30',
      articleNumber: 'DISC',
      brandName: 'BOSCH',
      description: 'Диск',
      thumbnailUrl: null,
      quantity: 2,
      unitPrice: 1299,
      lineTotal: 2598,
    },
  ],
  delivery: {
    method: DeliveryMethod.COURIER_OFFICE,
    carrier: ShippingMethod.ECONT,
    destination: {
      office: {
        code: '1127',
        name: 'София',
        address: 'ул. 1',
        weekdayHours: null,
        saturdayHours: null,
      },
    },
    deliveryPrice: 378,
    cashOnDeliveryFee: 81,
    expectedDeliveryDate: '2026-10-17',
    parcelWeightGrams: 4000,
  },
  money: {
    goodsTotal: 2598,
    deliveryPrice: 378,
    cashOnDeliveryFee: 81,
    total: 3057,
    netAmount: 2548,
    vatAmount: 509,
  },
  paymentMethod: 'CASH_ON_DELIVERY',
  termsVersion: '2026-10-17',
  initialStatus: 'PROCESSING',
};

const GUEST_ORDER: NewOrder = {
  ...ORDER,
  customerId: null,
  contact: { ...ORDER.contact, email: null },
  initialStatus: 'AWAITING_CONFIRMATION',
};

const REFERENCE = { id: 'order-1', orderReference: 'VP-ORD-000042' };

describe('OrdersRepository', () => {
  let repository: OrdersRepository;

  const lockCart = jest.fn();
  const closeForOrder = jest.fn();
  const append = jest.fn();
  const orderCreate = jest.fn();
  const orderFindUniqueOrThrow = jest.fn();
  const queryRaw = jest.fn();

  const tx = {
    order: { create: orderCreate, findUniqueOrThrow: orderFindUniqueOrThrow },
    $queryRaw: queryRaw,
  };

  const prisma = {
    $transaction: jest.fn((run: (client: typeof tx) => unknown) => run(tx)),
    order: { findUnique: jest.fn(), findFirst: jest.fn(), count: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    lockCart.mockResolvedValue({
      status: 'ACTIVE',
      version: 7,
      orderId: null,
      token: null,
    });
    queryRaw.mockResolvedValue([{ value: BigInt(42) }]);
    orderCreate.mockResolvedValue(REFERENCE);

    const moduleRef = await Test.createTestingModule({
      providers: [
        OrdersRepository,
        { provide: PrismaService, useValue: prisma },
        { provide: CartRepository, useValue: { lockCart, closeForOrder } },
        { provide: OutboxRepository, useValue: { append } },
      ],
    }).compile();

    repository = moduleRef.get(OrdersRepository);
  });

  describe('place', () => {
    it('writes the order, its lines and its first status, numbered from the sequence', async () => {
      await expect(repository.place(ORDER)).resolves.toEqual({
        kind: 'placed',
        order: REFERENCE,
      });

      expect(orderCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          orderReference: 'VP-ORD-000042',
          customerId: 'customer-1',
          cartId: 'cart-1',
          deliveryMethod: 'COURIER_OFFICE',
          carrier: 'ECONT',
          deliverySnapshot: ORDER.delivery.destination,
          expectedDeliveryDate: new Date('2026-10-17'),
          parcelWeightGrams: 4000,
          goodsTotal: 2598,
          deliveryPrice: 378,
          cashOnDeliveryFee: 81,
          total: 3057,
          vatAmount: 509,
          paymentMethod: 'CASH_ON_DELIVERY',
          contactFirstName: 'Иван',
          contactLastName: 'Петров',
          contactPhone: '+359888123456',
          contactEmail: 'ivan@example.com',
          termsVersion: '2026-10-17',
          status: 'PROCESSING',
          items: { create: ORDER.items },
          statusHistory: {
            create: { status: 'PROCESSING', source: 'shop' },
          },
        }),
        select: { id: true, orderReference: true },
      });
    });

    it('retires the cart in the same transaction, after locking it first', async () => {
      await repository.place(ORDER);

      expect(lockCart).toHaveBeenCalledWith(tx, 'cart-1');
      expect(closeForOrder).toHaveBeenCalledWith(tx, {
        cartId: 'cart-1',
        orderId: 'order-1',
        customerId: 'customer-1',
        token: null,
      });
      expect(lockCart.mock.invocationCallOrder[0]).toBeLessThan(
        orderCreate.mock.invocationCallOrder[0],
      );
    });

    it('writes a guest’s order with no customer, starting where it was asked to', async () => {
      await repository.place(GUEST_ORDER);

      expect(orderCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            customerId: null,
            contactEmail: null,
            status: 'AWAITING_CONFIRMATION',
            statusHistory: {
              create: { status: 'AWAITING_CONFIRMATION', source: 'shop' },
            },
          }),
        }),
      );
    });

    it('passes a guest cart’s token, read under the lock, on to the next cart', async () => {
      lockCart.mockResolvedValue({
        status: 'ACTIVE',
        version: 7,
        orderId: null,
        token: 'guest-token',
      });

      await repository.place(GUEST_ORDER);

      expect(closeForOrder).toHaveBeenCalledWith(tx, {
        cartId: 'cart-1',
        orderId: 'order-1',
        customerId: null,
        token: 'guest-token',
      });
    });

    it('writes OrderPlaced to the outbox in the same transaction, naming only the order', async () => {
      await repository.place(ORDER);

      expect(append).toHaveBeenCalledWith(tx, {
        type: 'OrderPlaced',
        payload: { orderId: 'order-1' },
      });
    });

    it('stores pickup with an empty destination and no date it cannot give', async () => {
      await repository.place({
        ...ORDER,
        delivery: {
          ...ORDER.delivery,
          method: DeliveryMethod.STORE_PICKUP,
          carrier: null,
          destination: null,
          expectedDeliveryDate: null,
          parcelWeightGrams: null,
        },
      });

      expect(orderCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            carrier: null,
            deliverySnapshot: {},
            expectedDeliveryDate: null,
          }),
        }),
      );
    });

    it('answers the order a twin request placed while this one waited on the lock', async () => {
      lockCart.mockResolvedValue({
        status: 'ORDERED',
        version: 7,
        orderId: 'order-1',
      });
      orderFindUniqueOrThrow.mockResolvedValue(REFERENCE);

      await expect(repository.place(ORDER)).resolves.toEqual({
        kind: 'replayed',
        order: REFERENCE,
      });
      expect(orderCreate).not.toHaveBeenCalled();
      expect(closeForOrder).not.toHaveBeenCalled();
      expect(append).not.toHaveBeenCalled();
    });

    it.each([
      ['edited', { status: 'ACTIVE', version: 8, orderId: null }],
      ['merged away', { status: 'MERGED', version: 7, orderId: null }],
    ])(
      'writes nothing for a cart %s since the checks',
      async (_case, locked) => {
        lockCart.mockResolvedValue(locked);

        await expect(repository.place(ORDER)).resolves.toEqual({
          kind: 'stale',
        });
        expect(orderCreate).not.toHaveBeenCalled();
        expect(append).not.toHaveBeenCalled();
      },
    );
  });

  it('reads an order by its reference, only together with its owner', async () => {
    await repository.findOwned('VP-ORD-000042', 'customer-1');

    expect(prisma.order.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orderReference: 'VP-ORD-000042', customerId: 'customer-1' },
      }),
    );
  });

  it('counts the orders a phone has waiting on a confirmation call', async () => {
    prisma.order.count.mockResolvedValue(2);

    await expect(
      repository.countAwaitingConfirmation('+359888123456'),
    ).resolves.toBe(2);
    expect(prisma.order.count).toHaveBeenCalledWith({
      where: {
        contactPhone: '+359888123456',
        status: 'AWAITING_CONFIRMATION',
      },
    });
  });

  it('reads an order by its id for the handlers of its events', async () => {
    await repository.findDetail('order-1');

    expect(prisma.order.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'order-1' } }),
    );
  });
});
