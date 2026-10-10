import { econtAddressOf } from './econt-address';

describe('econtAddressOf', () => {
  it('names the place by its numeric id and the street number as num', () => {
    expect(
      econtAddressOf({
        placeId: '41',
        street: 'бул. Витоша',
        streetNumber: '10',
        quarter: 'кв. Лозенец',
        other: 'ет. 3',
      }),
    ).toEqual({
      city: { id: 41 },
      street: 'бул. Витоша',
      num: '10',
      quarter: 'кв. Лозенец',
      other: 'ет. 3',
    });
  });

  it('leaves out what the address does not name', () => {
    expect(
      econtAddressOf({ placeId: '41', street: '', quarter: 'кв. Слатина' }),
    ).toEqual({
      city: { id: 41 },
      quarter: 'кв. Слатина',
    });
  });
});
