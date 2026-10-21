import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CART_TOKEN_HEADER, ORDER_KEY_HEADER } from '@vp-parts-shop/shared';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/exception.filter';
import { LoggingInterceptor } from './common/logging.interceptor';
import { securityHeaders } from './common/security-headers';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.use(securityHeaders());

  app.enableCors({
    origin: app.get(ConfigService).getOrThrow<string>('CORS_ORIGIN'),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      CART_TOKEN_HEADER,
      ORDER_KEY_HEADER,
    ],
    // The browser cannot read a response header it was not told about, and the
    // cart token only ever arrives on the response that minted it — without
    // this the first add silently loses the cart it just created.
    exposedHeaders: [CART_TOKEN_HEADER],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  await app.listen(process.env.PORT ?? 3001);
}
void bootstrap();
