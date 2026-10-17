import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { OrderMoneyDto } from '@vp-parts-shop/shared';
import { orderMoney } from './order-money';
import type { OrderMoneyInput } from './order-money';

/** {@link orderMoney} at the shop's one VAT rate, so no caller can pass another. */
@Injectable()
export class OrderMoneyCalculator {
  private readonly vatRate: number;

  constructor(config: ConfigService) {
    this.vatRate = config.getOrThrow<number>('VAT_RATE');
  }

  calculate(input: OrderMoneyInput): OrderMoneyDto {
    return orderMoney(input, this.vatRate);
  }
}
