import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import RedisMock from 'ioredis-mock';
import { AppModule } from '../../src/app.module';
import { GlobalExceptionFilter } from '../../src/common/exception.filter';
import { LoggingInterceptor } from '../../src/common/logging.interceptor';
import { REDIS_CLIENT } from '../../src/catalog/tecdoc/tecdoc-cache.service';

export interface TestAppOptions {
  /**
   * Override the DATABASE_URL for this test run.
   * Defaults to the TEST_DATABASE_URL env var, falling back to DATABASE_URL.
   */
  databaseUrl?: string;
}

/**
 * Creates a fully-bootstrapped NestJS test application that mirrors the
 * production setup in main.ts (ValidationPipe, GlobalExceptionFilter,
 * LoggingInterceptor). Pass a moduleCustomizer to override providers
 * BEFORE module compilation (e.g. replace real services with mocks).
 */
export async function createTestApp(
  moduleCustomizer?: (builder: TestingModuleBuilder) => void,
  options: TestAppOptions = {},
): Promise<INestApplication> {
  const databaseUrl =
    options.databaseUrl ??
    process.env.TEST_DATABASE_URL ??
    process.env.DATABASE_URL;

  if (databaseUrl) {
    process.env.DATABASE_URL = databaseUrl;
  }

  const builder = Test.createTestingModule({
    imports: [AppModule],
  });

  // In-memory Redis so the suite is hermetic: no Docker/Redis required, and no
  // real socket (or its reconnect timer) leaking to keep the process alive.
  // Cache semantics (get/set/expire/flushall) are faithfully emulated.
  builder.overrideProvider(REDIS_CLIENT).useValue(new RedisMock());

  if (moduleCustomizer) {
    moduleCustomizer(builder);
  }

  const moduleRef = await builder.compile();

  const app = moduleRef.createNestApplication();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  await app.init();

  return app;
}
