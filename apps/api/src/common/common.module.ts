import { Module } from '@nestjs/common';
import { PriceCalculator } from './price-calculator';

@Module({
  providers: [PriceCalculator],
  exports: [PriceCalculator],
})
export class CommonModule {}
