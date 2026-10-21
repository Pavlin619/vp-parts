import { HttpStatus } from '@nestjs/common';
import { AppErrorCode } from '@vp-parts-shop/shared';
import { AppHttpException } from '../common';

export class BotCheckFailedException extends AppHttpException {
  constructor() {
    super(HttpStatus.BAD_REQUEST, AppErrorCode.BOT_CHECK_FAILED);
  }
}
