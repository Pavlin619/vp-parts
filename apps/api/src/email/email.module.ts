import { Module } from '@nestjs/common';
import { EmailSender } from './email.sender';

@Module({
  providers: [EmailSender],
  exports: [EmailSender],
})
export class EmailModule {}
