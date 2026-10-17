import { HttpStatus } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import type { Response } from 'express';
import {
  DeliveryMethod,
  PaymentMethod,
  PlaceOrderRequestDto,
} from '@vp-parts-shop/shared';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { PlaceOrderRateLimitGuard } from './place-order-rate-limit.guard';

const USER = { clerkId: 'user_1' };

const REQUEST: PlaceOrderRequestDto = {
  cartId: '6f1c2a4e-8b1d-4c3a-9e2f-1a2b3c4d5e6f',
  cartVersion: 3,
  expectedTotalCents: 5304,
  paymentMethod: PaymentMethod.CASH_ON_DELIVERY,
  delivery: { method: DeliveryMethod.STORE_PICKUP },
};

const PLACED = { orderId: 'order-1', orderReference: 'VP-000042' };

describe('OrdersController', () => {
  const placeOrder = jest.fn();
  const getOrder = jest.fn();
  const status = jest.fn();
  const response = { status } as unknown as Response;

  let controller: OrdersController;

  beforeEach(async () => {
    jest.resetAllMocks();

    const moduleRef = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [
        { provide: OrdersService, useValue: { placeOrder, getOrder } },
      ],
    })
      .overrideGuard(PlaceOrderRateLimitGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = moduleRef.get(OrdersController);
  });

  describe('placeOrder', () => {
    it('places the order for the signed-in customer, leaving the 201 a new order earns', async () => {
      placeOrder.mockResolvedValue({ order: PLACED, isReplay: false });

      await expect(
        controller.placeOrder(USER, REQUEST, response),
      ).resolves.toEqual(PLACED);
      expect(placeOrder).toHaveBeenCalledWith('user_1', REQUEST);
      expect(status).not.toHaveBeenCalled();
    });

    // A retry is answered with the order it already made, as a 200, so the
    // client cannot mistake it for a second order.
    it('answers a retry with its order, as a 200', async () => {
      placeOrder.mockResolvedValue({ order: PLACED, isReplay: true });

      await expect(
        controller.placeOrder(USER, REQUEST, response),
      ).resolves.toEqual(PLACED);
      expect(status).toHaveBeenCalledWith(HttpStatus.OK);
    });

    it('is limited per customer', () => {
      const { value: handler } = Object.getOwnPropertyDescriptor(
        OrdersController.prototype,
        'placeOrder',
      )!;
      const guards = Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[];

      expect(guards).toEqual([PlaceOrderRateLimitGuard]);
    });
  });

  describe('getOrder', () => {
    it('reads the order back for the signed-in customer only', async () => {
      const order = { orderId: 'order-1' };
      getOrder.mockResolvedValue(order);

      await expect(
        controller.getOrder(USER, { orderId: 'order-1' }),
      ).resolves.toBe(order);
      expect(getOrder).toHaveBeenCalledWith('user_1', 'order-1');
    });
  });
});
