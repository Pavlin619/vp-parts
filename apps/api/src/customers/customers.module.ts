import { Module } from '@nestjs/common';
import { AuthModule } from '../auth';
import { PrismaModule } from '../prisma';
import { ClerkWebhookController } from './clerk-webhook.controller';
import { CustomersController } from './customers.controller';
import { CustomersRepository } from './customers.repository';
import { CustomersService } from './customers.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [CustomersController, ClerkWebhookController],
  providers: [CustomersRepository, CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
