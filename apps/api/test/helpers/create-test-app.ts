import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { GlobalExceptionFilter } from '../../src/common/exception.filter';
import { LoggingInterceptor } from '../../src/common/logging.interceptor';

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
 * LoggingInterceptor). Pass provider overrides via the moduleBuilder callback
 * to replace real services with mocks.
 */
export async function createTestApp(
  moduleCustomizer?: (builder: TestingModule) => void,
  options: TestAppOptions = {},
): Promise<INestApplication> {
  const databaseUrl =
    options.databaseUrl ??
    process.env.TEST_DATABASE_URL ??
    process.env.DATABASE_URL;

  if (databaseUrl) {
    process.env.DATABASE_URL = databaseUrl;
  }

  const moduleBuilder = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  if (moduleCustomizer) {
    moduleCustomizer(moduleBuilder);
  }

  const app = moduleBuilder.createNestApplication();

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
