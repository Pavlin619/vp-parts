import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { OrderMoneyCalculator } from './order-money.calculator';

describe('OrderMoneyCalculator', () => {
  const getOrThrow = jest.fn();

  async function calculatorAt(vatRate: number) {
    getOrThrow.mockReturnValue(vatRate);

    const moduleRef = await Test.createTestingModule({
      providers: [
        OrderMoneyCalculator,
        { provide: ConfigService, useValue: { getOrThrow } },
      ],
    }).compile();

    return moduleRef.get(OrderMoneyCalculator);
  }

  it('works the VAT out at the configured rate', async () => {
    const calculator = await calculatorAt(0.2);

    const money = calculator.calculate({
      lines: [{ unitPrice: 1200, quantity: 1 }],
      deliveryPrice: 0,
      cashOnDeliveryFee: 0,
    });

    expect(getOrThrow).toHaveBeenCalledWith('VAT_RATE');
    expect(money).toMatchObject({
      total: 1200,
      netAmount: 1000,
      vatAmount: 200,
    });
  });
});
