import { ValidationPipe } from '@nestjs/common';
import { UpdateCartLineDto } from './cart.dto';

/**
 * UpdateCartLineDto derives from AddCartLineDto via PartialType/PickType
 * rather than repeating its decorators — this exercises the same
 * ValidationPipe config main.ts registers globally, so a regression in what
 * that derivation actually validates fails here instead of only at runtime.
 */
describe('UpdateCartLineDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const transform = (value: object) =>
    pipe.transform(value, {
      type: 'body',
      metatype: UpdateCartLineDto,
    });

  it('accepts a quantity-only patch', async () => {
    await expect(transform({ quantity: 4 })).resolves.toMatchObject({
      quantity: 4,
    });
  });

  it('accepts an isSelected-only patch', async () => {
    await expect(transform({ isSelected: false })).resolves.toMatchObject({
      isSelected: false,
    });
  });

  it('still enforces the quantity ceiling inherited from AddCartLineDto', async () => {
    await expect(transform({ quantity: 100 })).rejects.toThrow();
  });

  it('still enforces the quantity floor inherited from AddCartLineDto', async () => {
    await expect(transform({ quantity: 0 })).rejects.toThrow();
  });

  it('rejects a non-integer quantity', async () => {
    await expect(transform({ quantity: 1.5 })).rejects.toThrow();
  });

  it('rejects an unknown field', async () => {
    await expect(transform({ quantity: 1, rogue: true })).rejects.toThrow();
  });
});
