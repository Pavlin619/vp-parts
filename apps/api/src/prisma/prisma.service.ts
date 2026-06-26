import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '../generated/prisma';

/**
 * Thin wrapper over the generated PrismaClient that manages the connection
 * lifecycle alongside the Nest application. The initial connect is best-effort:
 * a failure is logged but does not abort boot, so the app still starts when the
 * shared database is briefly unreachable — queries then connect lazily and fail
 * at the call site, where each caller decides whether to fail open or closed.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
    } catch (error) {
      this.logger.warn(
        'Initial Prisma connection failed; will connect lazily on first query.',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
