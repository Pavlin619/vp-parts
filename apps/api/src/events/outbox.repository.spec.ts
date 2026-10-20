import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma';
import { OutboxRepository } from './outbox.repository';

const NOW = new Date('2026-10-18T08:00:00Z');
const LEASE = { eventId: 'event-1', claimToken: 'claim-1' };

describe('OutboxRepository', () => {
  let repository: OutboxRepository;

  const prisma = {
    $queryRaw: jest.fn(),
    outboxEvent: { updateMany: jest.fn(), deleteMany: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [
        OutboxRepository,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    repository = moduleRef.get(OutboxRepository);
  });

  it('appends an event inside the caller’s transaction', async () => {
    const tx = { outboxEvent: { create: jest.fn() } };

    await repository.append(tx as never, {
      type: 'OrderPlaced',
      payload: { orderId: 'order-1' },
    });

    expect(tx.outboxEvent.create).toHaveBeenCalledWith({
      data: { type: 'OrderPlaced', payload: { orderId: 'order-1' } },
    });
  });

  describe('claimDue', () => {
    const claim = () =>
      repository.claimDue({
        now: NOW,
        limit: 10,
        leaseMs: 300_000,
        maxAttempts: 10,
      });

    it('leases the due rows in one statement that skips rows another relay holds', async () => {
      prisma.$queryRaw.mockResolvedValue([]);

      await claim();

      const [strings, ...values] = prisma.$queryRaw.mock.calls[0] as [
        TemplateStringsArray,
        ...{ values: unknown[] }[],
      ];
      const sql = strings.join('?');
      expect(sql).toMatch(/^\s*UPDATE "OutboxEvent"/);
      expect(sql).toContain('FOR UPDATE SKIP LOCKED');
      expect(sql).toContain('"claimToken" = gen_random_uuid()');
      expect(sql).toContain('"completedHandlers"');
      expect(values.flatMap((value) => value.values ?? value)).toEqual(
        expect.arrayContaining([new Date('2026-10-18T08:05:00Z'), NOW, 10]),
      );
    });

    it('answers each claimed row as a message, counting the attempt now made, with the handlers already done', async () => {
      prisma.$queryRaw.mockResolvedValue([
        {
          id: 'event-1',
          type: 'OrderPlaced',
          payload: { orderId: 'order-1' },
          createdAt: new Date('2026-10-18T07:59:58Z'),
          attempts: 3,
          claimToken: 'claim-1',
          completedHandlers: ['customer'],
        },
      ]);

      await expect(claim()).resolves.toEqual([
        {
          message: {
            eventId: 'event-1',
            type: 'OrderPlaced',
            payload: { orderId: 'order-1' },
            occurredAt: new Date('2026-10-18T07:59:58Z'),
            attempts: 3,
          },
          claimToken: 'claim-1',
          completedHandlers: ['customer'],
        },
      ]);
    });
  });

  describe('writes under a lease', () => {
    const heldBy = { id: 'event-1', claimToken: 'claim-1' };

    beforeEach(() => {
      prisma.outboxEvent.updateMany.mockResolvedValue({ count: 1 });
      prisma.outboxEvent.deleteMany.mockResolvedValue({ count: 1 });
    });

    it('records a handler as done, so no retry runs it again', async () => {
      await expect(
        repository.recordHandlerDone(LEASE, 'customer'),
      ).resolves.toBe(true);

      expect(prisma.outboxEvent.updateMany).toHaveBeenCalledWith({
        where: heldBy,
        data: { completedHandlers: { push: 'customer' } },
      });
    });

    it('deletes a delivered event', async () => {
      await expect(repository.deleteDelivered(LEASE)).resolves.toBe(true);

      expect(prisma.outboxEvent.deleteMany).toHaveBeenCalledWith({
        where: heldBy,
      });
    });

    it('puts a failed event back for later, recording why', async () => {
      const availableAt = new Date('2026-10-18T08:00:30Z');

      await expect(
        repository.scheduleRetry(LEASE, { availableAt, error: 'down' }),
      ).resolves.toBe(true);

      expect(prisma.outboxEvent.updateMany).toHaveBeenCalledWith({
        where: heldBy,
        data: { availableAt, lastError: 'down' },
      });
    });

    it('changes nothing, and says so, once a later claim holds the event', async () => {
      prisma.outboxEvent.updateMany.mockResolvedValue({ count: 0 });
      prisma.outboxEvent.deleteMany.mockResolvedValue({ count: 0 });
      const retry = { availableAt: NOW, error: 'down' };

      await expect(
        Promise.all([
          repository.recordHandlerDone(LEASE, 'customer'),
          repository.deleteDelivered(LEASE),
          repository.scheduleRetry(LEASE, retry),
        ]),
      ).resolves.toEqual([false, false, false]);
    });
  });
});
