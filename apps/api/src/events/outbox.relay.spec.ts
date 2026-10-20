import { Test } from '@nestjs/testing';
import type { OutboxHandler } from './outbox-handler';
import { OutboxRelay, retryDelayMs } from './outbox.relay';
import {
  ClaimedEvent,
  OutboxMessage,
  OutboxRepository,
} from './outbox.repository';

const NOW = new Date('2026-10-18T08:00:00Z');
const LEASE = { eventId: 'event-1', claimToken: 'claim-1' };

function eventOf(overrides: Partial<OutboxMessage> = {}): OutboxMessage {
  return {
    eventId: 'event-1',
    type: 'OrderPlaced',
    payload: { orderId: 'order-1' },
    occurredAt: new Date('2026-10-18T07:59:58Z'),
    attempts: 1,
    ...overrides,
  };
}

function claimedOf(
  overrides: Partial<OutboxMessage> = {},
  completedHandlers: string[] = [],
): ClaimedEvent {
  return {
    message: eventOf(overrides),
    claimToken: 'claim-1',
    completedHandlers,
  };
}

function handlerOf(name: string, eventType = 'OrderPlaced') {
  return {
    name,
    eventType,
    handle: jest.fn<Promise<void>, [OutboxMessage]>(() => Promise.resolve()),
  } satisfies OutboxHandler;
}

describe('OutboxRelay', () => {
  let relay: OutboxRelay;

  const outbox = {
    claimDue: jest.fn<Promise<ClaimedEvent[]>, unknown[]>(),
    recordHandlerDone: jest.fn(),
    deleteDelivered: jest.fn(),
    scheduleRetry: jest.fn(),
  };

  beforeEach(async () => {
    jest.useFakeTimers({ now: NOW });
    jest.clearAllMocks();
    outbox.claimDue.mockResolvedValue([claimedOf()]);
    outbox.recordHandlerDone.mockResolvedValue(true);
    outbox.deleteDelivered.mockResolvedValue(true);
    outbox.scheduleRetry.mockResolvedValue(true);

    const moduleRef = await Test.createTestingModule({
      providers: [OutboxRelay, { provide: OutboxRepository, useValue: outbox }],
    }).compile();

    relay = moduleRef.get(OutboxRelay);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('claims a leased batch of due events, never past the last attempt', async () => {
    await relay.relayDue();

    expect(outbox.claimDue).toHaveBeenCalledWith({
      now: NOW,
      limit: expect.any(Number),
      leaseMs: expect.any(Number),
      maxAttempts: 10,
    });
  });

  it('gives an event to every handler of its type, then deletes it', async () => {
    const customer = handlerOf('customer');
    const office = handlerOf('office');
    const other = handlerOf('other', 'SomethingElse');
    [customer, office, other].forEach((handler) => relay.register(handler));

    await relay.relayDue();

    expect(customer.handle).toHaveBeenCalledWith(eventOf());
    expect(office.handle).toHaveBeenCalledWith(eventOf());
    expect(other.handle).not.toHaveBeenCalled();
    expect(outbox.recordHandlerDone.mock.calls).toEqual([
      [LEASE, 'customer'],
      [LEASE, 'office'],
    ]);
    expect(outbox.deleteDelivered).toHaveBeenCalledWith(LEASE);
    expect(outbox.scheduleRetry).not.toHaveBeenCalled();
  });

  it('runs only the handlers an earlier attempt left undone', async () => {
    const customer = handlerOf('customer');
    const office = handlerOf('office');
    relay.register(customer);
    relay.register(office);
    outbox.claimDue.mockResolvedValue([
      claimedOf({ attempts: 2 }, ['customer']),
    ]);

    await relay.relayDue();

    expect(customer.handle).not.toHaveBeenCalled();
    expect(office.handle).toHaveBeenCalled();
    expect(outbox.recordHandlerDone).toHaveBeenCalledTimes(1);
    expect(outbox.deleteDelivered).toHaveBeenCalledWith(LEASE);
  });

  it('deletes an event whose handlers all finished on an earlier attempt', async () => {
    const customer = handlerOf('customer');
    relay.register(customer);
    outbox.claimDue.mockResolvedValue([
      claimedOf({ attempts: 2 }, ['customer']),
    ]);

    await relay.relayDue();

    expect(customer.handle).not.toHaveBeenCalled();
    expect(outbox.deleteDelivered).toHaveBeenCalledWith(LEASE);
  });

  it('still runs the other handlers when one fails, then retries the event with backoff', async () => {
    const customer = handlerOf('customer');
    const office = handlerOf('office');
    customer.handle.mockRejectedValue(new Error('Resend answered HTTP 500'));
    relay.register(customer);
    relay.register(office);

    await relay.relayDue();

    expect(office.handle).toHaveBeenCalled();
    expect(outbox.recordHandlerDone.mock.calls).toEqual([[LEASE, 'office']]);
    expect(outbox.deleteDelivered).not.toHaveBeenCalled();
    expect(outbox.scheduleRetry).toHaveBeenCalledWith(LEASE, {
      availableAt: new Date(NOW.getTime() + retryDelayMs(1)),
      error: 'customer: Resend answered HTTP 500',
    });
  });

  it('retries a handler whose success could not be recorded', async () => {
    relay.register(handlerOf('customer'));
    outbox.recordHandlerDone.mockRejectedValueOnce(new Error('database down'));

    await relay.relayDue();

    expect(outbox.deleteDelivered).not.toHaveBeenCalled();
    expect(outbox.scheduleRetry).toHaveBeenCalledWith(
      LEASE,
      expect.objectContaining({ error: 'customer: database down' }),
    );
  });

  it('retries an event no handler takes, rather than dropping it', async () => {
    await relay.relayDue();

    expect(outbox.deleteDelivered).not.toHaveBeenCalled();
    expect(outbox.scheduleRetry).toHaveBeenCalledWith(LEASE, {
      availableAt: expect.any(Date),
      error: 'no handler for OrderPlaced',
    });
  });

  it('logs the last attempt as an error, for a person to pick up', async () => {
    const failing = handlerOf('customer');
    failing.handle.mockRejectedValue(new Error('down'));
    relay.register(failing);
    outbox.claimDue.mockResolvedValue([claimedOf({ attempts: 10 })]);
    const logError = jest
      .spyOn(relay['logger'], 'error')
      .mockImplementation(() => undefined);

    await relay.relayDue();

    expect(logError).toHaveBeenCalledWith(
      expect.stringContaining('gave up after 10 attempts'),
    );
    expect(outbox.scheduleRetry).toHaveBeenCalledWith(
      LEASE,
      expect.objectContaining({ error: 'customer: down' }),
    );
  });

  it('delivers each event of a batch on its own', async () => {
    const handler = handlerOf('customer');
    handler.handle.mockImplementation((event) =>
      event.eventId === 'event-1'
        ? Promise.reject(new Error('down'))
        : Promise.resolve(),
    );
    relay.register(handler);
    outbox.claimDue.mockResolvedValue([
      claimedOf(),
      claimedOf({ eventId: 'event-2' }),
    ]);

    await relay.relayDue();

    expect(outbox.scheduleRetry).toHaveBeenCalledWith(LEASE, expect.anything());
    expect(outbox.deleteDelivered).toHaveBeenCalledWith({
      eventId: 'event-2',
      claimToken: 'claim-1',
    });
  });

  describe('once a later claim has taken an event over', () => {
    let logWarn: jest.SpyInstance;

    beforeEach(() => {
      logWarn = jest
        .spyOn(relay['logger'], 'warn')
        .mockImplementation(() => undefined);
    });

    it('runs none of its remaining handlers', async () => {
      const customer = handlerOf('customer');
      const office = handlerOf('office');
      relay.register(customer);
      relay.register(office);
      outbox.recordHandlerDone.mockResolvedValueOnce(false);

      await relay.relayDue();

      expect(office.handle).not.toHaveBeenCalled();
      expect(outbox.deleteDelivered).not.toHaveBeenCalled();
      expect(outbox.scheduleRetry).not.toHaveBeenCalled();
      expect(logWarn).toHaveBeenCalledWith(
        expect.stringContaining('lease ran out'),
      );
    });

    it('leaves a delivered event to the new claim', async () => {
      relay.register(handlerOf('customer'));
      outbox.deleteDelivered.mockResolvedValueOnce(false);

      await relay.relayDue();

      expect(outbox.scheduleRetry).not.toHaveBeenCalled();
      expect(logWarn).toHaveBeenCalledWith(
        expect.stringContaining('lease ran out'),
      );
    });

    it('reports no failed attempt for a retry it no longer holds', async () => {
      const failing = handlerOf('customer');
      failing.handle.mockRejectedValue(new Error('down'));
      relay.register(failing);
      outbox.scheduleRetry.mockResolvedValueOnce(false);

      await relay.relayDue();

      expect(logWarn).toHaveBeenCalledTimes(1);
      expect(logWarn).toHaveBeenCalledWith(
        expect.stringContaining('lease ran out'),
      );
    });

    it('carries on with the rest of the batch', async () => {
      relay.register(handlerOf('customer'));
      outbox.claimDue.mockResolvedValue([
        claimedOf(),
        claimedOf({ eventId: 'event-2' }),
      ]);
      outbox.recordHandlerDone.mockResolvedValueOnce(false);

      await relay.relayDue();

      expect(outbox.deleteDelivered.mock.calls).toEqual([
        [{ eventId: 'event-2', claimToken: 'claim-1' }],
      ]);
    });
  });

  it('leaves a tick to the one still running', async () => {
    let finishClaim: (events: ClaimedEvent[]) => void = () => undefined;
    outbox.claimDue.mockReturnValueOnce(
      new Promise((resolve) => (finishClaim = resolve)),
    );

    const running = relay.relayDue();
    await relay.relayDue();
    finishClaim([]);
    await running;

    expect(outbox.claimDue).toHaveBeenCalledTimes(1);
  });

  it('relays again once a failed tick has ended', async () => {
    outbox.claimDue.mockRejectedValueOnce(new Error('database down'));

    await expect(relay.relayDue()).rejects.toThrow('database down');
    await relay.relayDue();

    expect(outbox.claimDue).toHaveBeenCalledTimes(2);
  });
});

describe('retryDelayMs', () => {
  it('doubles from half a minute', () => {
    expect([1, 2, 3, 4].map(retryDelayMs)).toEqual([
      30_000, 60_000, 120_000, 240_000,
    ]);
  });

  it('waits an hour at most', () => {
    expect(retryDelayMs(9)).toBe(3_600_000);
  });
});
