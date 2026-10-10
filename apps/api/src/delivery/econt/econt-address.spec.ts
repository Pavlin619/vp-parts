import { DELIVERY_ADDRESS_LIMITS } from '@vp-parts-shop/shared';
import { ECONT_OTHER_MAX_LENGTH, econtAddressOf } from './econt-address';

describe('econtAddressOf', () => {
  it('names the place by its numeric id and the street number as num', () => {
    expect(
      econtAddressOf({
        placeId: '41',
        street: 'бул. Витоша',
        streetNumber: '10',
        quarter: 'кв. Лозенец',
      }),
    ).toEqual({
      city: { id: 41 },
      street: 'бул. Витоша',
      num: '10',
      quarter: 'кв. Лозенец',
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

  it('folds the block, entrance, floor and apartment into other', () => {
    expect(
      econtAddressOf({
        placeId: '41',
        quarter: 'кв. Младост-1',
        block: '5',
        entrance: 'Б',
        floor: '3',
        apartment: '12',
      }),
    ).toEqual({
      city: { id: 41 },
      quarter: 'кв. Младост-1',
      other: 'бл. 5, вх. Б, ет. 3, ап. 12',
    });
  });

  it('skips the parts left blank and puts the note last', () => {
    expect(
      econtAddressOf({
        placeId: '41',
        street: 'бул. Витоша',
        streetNumber: '60',
        floor: '3',
        apartment: ' ',
        note: 'звънецът не работи',
      }),
    ).toMatchObject({ other: 'ет. 3; звънецът не работи' });
  });

  it('sends the note alone when there is nothing else to say', () => {
    expect(
      econtAddressOf({
        placeId: '41',
        street: 'бул. Витоша',
        streetNumber: '60',
        note: 'обадете се преди това',
      }),
    ).toMatchObject({ other: 'обадете се преди това' });
  });

  it('sends no other when nothing was said', () => {
    expect(
      econtAddressOf({
        placeId: '41',
        street: 'бул. Витоша',
        streetNumber: '60',
      }),
    ).not.toHaveProperty('other');
  });

  it("keeps even the longest address inside Econt's other", () => {
    const { block, entrance, floor, apartment, note } = DELIVERY_ADDRESS_LIMITS;
    const longest = econtAddressOf({
      placeId: '41',
      quarter: 'кв. Младост-1',
      block: 'б'.repeat(block),
      entrance: 'в'.repeat(entrance),
      floor: 'г'.repeat(floor),
      apartment: 'д'.repeat(apartment),
      note: 'е'.repeat(note),
    }) as { other: string };

    expect(longest.other.length).toBeLessThanOrEqual(ECONT_OTHER_MAX_LENGTH);
  });
});
