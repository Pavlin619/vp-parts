import { BadRequestException, Logger } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Request } from 'express';
import { DominaiteWebhooks, InvalidWebhookError } from '../../payments';
import { DominaiteWebhookController } from './dominaite-webhook.controller';
import { PaymentOutcomeService } from './payment-outcome.service';

const RAW_BODY = Buffer.from('{"id":"delivery-1"}');
const SIGNATURE = 't=1755700000,v1=abc';
const EVENT = { id: 'delivery-1', type: 'payment.succeeded', data: {} };

const request = { rawBody: RAW_BODY } as RawBodyRequest<Request>;

describe('DominaiteWebhookController', () => {
  let controller: DominaiteWebhookController;

  const verify = jest.fn();
  const applyWebhookEvent = jest.fn();

  beforeEach(async () => {
    jest.resetAllMocks();
    verify.mockReturnValue(EVENT);

    const moduleRef = await Test.createTestingModule({
      controllers: [DominaiteWebhookController],
      providers: [
        { provide: DominaiteWebhooks, useValue: { verify } },
        { provide: PaymentOutcomeService, useValue: { applyWebhookEvent } },
      ],
    }).compile();

    controller = moduleRef.get(DominaiteWebhookController);
  });

  afterEach(() => jest.restoreAllMocks());

  it('verifies the raw body against its signature, then applies the event', async () => {
    await controller.receive(request, SIGNATURE);

    expect(verify).toHaveBeenCalledWith(RAW_BODY, SIGNATURE);
    expect(applyWebhookEvent).toHaveBeenCalledWith(EVENT);
  });

  it('refuses a delivery Dominaite did not sign, applying nothing', async () => {
    verify.mockImplementation(() => {
      throw new InvalidWebhookError('refused');
    });
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    await expect(controller.receive(request, SIGNATURE)).rejects.toThrow(
      BadRequestException,
    );
    expect(applyWebhookEvent).not.toHaveBeenCalled();
  });

  it('lets a failure to apply the event through, so Dominaite delivers it again', async () => {
    applyWebhookEvent.mockRejectedValue(new Error('database down'));

    await expect(controller.receive(request, SIGNATURE)).rejects.toThrow(
      'database down',
    );
  });
});
