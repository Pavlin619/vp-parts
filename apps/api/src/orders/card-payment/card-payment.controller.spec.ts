import { HttpStatus } from '@nestjs/common';
import { GUARDS_METADATA, HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { CardPaymentController } from './card-payment.controller';
import { CardPaymentService } from './card-payment.service';
import { OrderPaymentRateLimitGuard } from './order-payment-rate-limit.guard';

const SESSION = {
  cashierKey: 'ck_51f0c2',
  cashierToken: 'b7d94e10-2a6f-4c3b-8e51-0f9d7a3c6b28',
  expiresAt: '2026-10-23T12:00:00.000Z',
};

const handler = Object.getOwnPropertyDescriptor(
  CardPaymentController.prototype,
  'openPayment',
)!.value as object;

describe('CardPaymentController', () => {
  const openPayment = jest.fn();

  let controller: CardPaymentController;

  beforeEach(async () => {
    jest.resetAllMocks();

    const moduleRef = await Test.createTestingModule({
      controllers: [CardPaymentController],
      providers: [{ provide: CardPaymentService, useValue: { openPayment } }],
    })
      .overrideGuard(OrderPaymentRateLimitGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = moduleRef.get(CardPaymentController);
  });

  it('opens the payment of the signed-in customer’s order', async () => {
    openPayment.mockResolvedValue(SESSION);

    await expect(
      controller.openPayment(
        { clerkId: 'user_1' },
        { orderReference: 'VP-ORD-000042' },
      ),
    ).resolves.toEqual(SESSION);
    expect(openPayment).toHaveBeenCalledWith('user_1', 'VP-ORD-000042');
  });

  it('answers 200, since reopening an open session creates nothing', () => {
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(
      HttpStatus.OK,
    );
  });

  it('is limited per customer', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([
      OrderPaymentRateLimitGuard,
    ]);
  });
});
