import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CompleteProfileBodyDto } from './customers.dto';

function invalidFieldsOf(body: Record<string, unknown>): string[] {
  const dto = plainToInstance(CompleteProfileBodyDto, body);

  return validateSync(dto).map((error) => error.property);
}

describe('CompleteProfileBodyDto', () => {
  it('accepts any subset of the details, an empty one included', () => {
    expect(invalidFieldsOf({})).toEqual([]);
    expect(invalidFieldsOf({ phoneNumber: '0888 123 456' })).toEqual([]);
    expect(
      invalidFieldsOf({
        firstName: 'Иван',
        lastName: 'Петров',
        phoneNumber: '+359888123456',
      }),
    ).toEqual([]);
  });

  it('trims the names it is given', () => {
    const dto = plainToInstance(CompleteProfileBodyDto, {
      firstName: '  Иван ',
      lastName: ' Петров',
    });

    expect(dto).toMatchObject({ firstName: 'Иван', lastName: 'Петров' });
  });

  it('stores the phone it is given in E.164', () => {
    const dto = plainToInstance(CompleteProfileBodyDto, {
      phoneNumber: '0888 123 456',
    });

    expect(dto.phoneNumber).toBe('+359888123456');
    expect(validateSync(dto)).toEqual([]);
  });

  it.each([
    ['a landline', { phoneNumber: '02 987 6543' }, 'phoneNumber'],
    ['a phone that is not text', { phoneNumber: 888123456 }, 'phoneNumber'],
    ['a blank first name', { firstName: '   ' }, 'firstName'],
    ['a last name with digits', { lastName: 'Петров2' }, 'lastName'],
    ['a name too long to store', { firstName: 'И'.repeat(101) }, 'firstName'],
    // Null would clear a detail the order relies on.
    ['a null detail', { lastName: null }, 'lastName'],
  ])('refuses %s', (_case, body, field) => {
    expect(invalidFieldsOf(body)).toEqual([field]);
  });
});
