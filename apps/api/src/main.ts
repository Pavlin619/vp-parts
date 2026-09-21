import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { CART_TOKEN_HEADER } from '@vp-parts-shop/shared';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/exception.filter';
import { LoggingInterceptor } from './common/logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const corsOrigin = process.env.CORS_ORIGIN ?? 'http://localhost:3000';
  app.enableCors({
    origin: corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', CART_TOKEN_HEADER],
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
