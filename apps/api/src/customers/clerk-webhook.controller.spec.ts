import { HttpStatus, RawBodyRequest } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Request } from 'express';
import { ClerkWebhooks } from '../auth';
import { ClerkWebhookController } from './clerk-webhook.controller';
import {
  ClerkIdentityIncompleteException,
  EmailAlreadyExistsException,
} from './customers.exceptions';
import { CustomersService } from './customers.service';

describe('ClerkWebhookController', () => {
  const verify = jest.fn();
  const register = jest.fn();
  const request = {} as RawBodyRequest<Request>;

  let controller: ClerkWebhookController;

  beforeEach(async () => {
    jest.resetAllMocks();

    const moduleRef = await Test.createTestingModule({
      controllers: [ClerkWebhookController],
      providers: [
        { provide: ClerkWebhooks, useValue: { verify } },
        { provide: CustomersService, useValue: { register } },
      ],
    }).compile();

    controller = moduleRef.get(ClerkWebhookController);
  });

  it('refuses a request Clerk did not sign', async () => {
    verify.mockRejectedValue(new Error('Unable to verify incoming webhook'));

    await expect(controller.receive(request)).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
    });
    expect(register).not.toHaveBeenCalled();
  });

  it('files the customer a user.created event stands for', async () => {
    verify.mockResolvedValue({ type: 'user.created', data: { id: 'user_1' } });
    register.mockResolvedValue({ id: 'customer-1' });

    await expect(controller.receive(request)).resolves.toBeUndefined();
    expect(verify).toHaveBeenCalledWith(request);
    expect(register).toHaveBeenCalledWith('user_1');
  });

  // Filing needs nothing Clerk could add later, so an update has nothing to file.
  it.each(['user.updated', 'user.deleted', 'session.created'])(
    'accepts and ignores a %s event',
    async (type) => {
      verify.mockResolvedValue({ type, data: { id: 'user_1' } });

      await expect(controller.receive(request)).resolves.toBeUndefined();
      expect(register).not.toHaveBeenCalled();
    },
  );

  // Clerk retries anything but a 2xx; these would fail the same way every time.
  it.each([
    ['an incomplete Clerk identity', new ClerkIdentityIncompleteException()],
    ['an email another customer holds', new EmailAlreadyExistsException()],
  ])('accepts an event it cannot file because of %s', async (_case, error) => {
    verify.mockResolvedValue({ type: 'user.created', data: { id: 'user_1' } });
    register.mockRejectedValue(error);

    await expect(controller.receive(request)).resolves.toBeUndefined();
  });

  it('lets any other failure through, so Clerk retries', async () => {
    const outage = new Error('database unreachable');
    verify.mockResolvedValue({ type: 'user.created', data: { id: 'user_1' } });
    register.mockRejectedValue(outage);

    await expect(controller.receive(request)).rejects.toBe(outage);
  });
});
