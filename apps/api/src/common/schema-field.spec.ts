import 'reflect-metadata';
import { plainToInstance, Transform } from 'class-transformer';
import { Validate, ValidateIf, validateSync } from 'class-validator';
import { bulgarianMobileSchema, personNameSchema } from '@vp-parts-shop/shared';
import { asMobile, isGiven, SatisfiesSchema, trimmed } from './schema-field';

class ExampleBodyDto {
  @Transform(trimmed)
  @Validate(SatisfiesSchema, [personNameSchema])
  name!: string;

  @ValidateIf(isGiven)
  @Transform(asMobile)
  @Validate(SatisfiesSchema, [bulgarianMobileSchema])
  phone?: string;
}

const parse = (body: object) => plainToInstance(ExampleBodyDto, body);
const invalidFieldsOf = (body: object) =>
  validateSync(parse(body)).map(({ property }) => property);

describe('schema-backed fields', () => {
  it('trims text before the schema reads it', () => {
    expect(parse({ name: '  Иван ' }).name).toBe('Иван');
    expect(invalidFieldsOf({ name: '   ' })).toEqual(['name']);
  });

  it('turns a Bulgarian mobile into E.164 and leaves anything else as given', () => {
    expect(parse({ name: 'Иван', phone: '0888 123 456' }).phone).toBe(
      '+359888123456',
    );
    expect(parse({ name: 'Иван', phone: '02 987 6543' }).phone).toBe(
      '02 987 6543',
    );
    expect(invalidFieldsOf({ name: 'Иван', phone: '02 987 6543' })).toEqual([
      'phone',
    ]);
  });

  it('checks an optional field only when it is given', () => {
    expect(invalidFieldsOf({ name: 'Иван' })).toEqual([]);
    expect(invalidFieldsOf({ name: 'Иван', phone: null })).toEqual(['phone']);
  });
});
