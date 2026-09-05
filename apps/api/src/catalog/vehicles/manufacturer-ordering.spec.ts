import { orderManufacturers } from './manufacturer-ordering';
import { ManufacturerFacetEntry } from './vehicles.mapper';

function make(
  id: number,
  name: string,
  vehicleCount: number,
): ManufacturerFacetEntry {
  return { id, name, vehicleCount };
}

describe('orderManufacturers', () => {
  // The facet arrives in ascending mfrId order, which is not the alphabet once
  // past the ids TecDoc handed out alphabetically — `AUTO UNION` (id 4) sorts
  // before `AUDI` (id 5) there, and everything added since is simply appended.
  it('puts the popular makes first and sorts the rest by name', () => {
    const ordered = orderManufacturers(
      [
        make(2, 'ALFA ROMEO', 503),
        make(4, 'AUTO UNION', 12),
        make(5, 'AUDI', 1994),
        make(74, 'MERCEDES-BENZ', 3117),
        make(8399, 'REZON', 3),
      ],
      new Set([2, 5, 74]),
    );

    expect(ordered.map((entry) => entry.name)).toEqual([
      // Popular, by vehicle count.
      'MERCEDES-BENZ',
      'AUDI',
      'ALFA ROMEO',
      // The rest, alphabetically.
      'AUTO UNION',
      'REZON',
    ]);
  });

  it('flags which half each make came from', () => {
    const ordered = orderManufacturers(
      [make(5, 'AUDI', 1994), make(8399, 'REZON', 3)],
      new Set([5]),
    );

    expect(ordered).toEqual([
      { id: '5', name: 'AUDI', isPopular: true },
      { id: '8399', name: 'REZON', isPopular: false },
    ]);
  });

  // Two makes TecDoc catalogues equally many vehicles for would otherwise come
  // back in whichever order the facet happened to list them.
  it('breaks a tie on vehicle count by name', () => {
    const ordered = orderManufacturers(
      [make(74, 'MERCEDES-BENZ', 500), make(5, 'AUDI', 500)],
      new Set([5, 74]),
    );

    expect(ordered.map((entry) => entry.name)).toEqual([
      'AUDI',
      'MERCEDES-BENZ',
    ]);
  });

  // All 35 favoured makes fall inside the selectable scope today, so this is a
  // guard on narrowing that scope further: the list is the facet's makes, and a
  // favoured id with no facet entry has no name or count to render.
  it('adds no make the facet did not report', () => {
    const ordered = orderManufacturers(
      [make(5, 'AUDI', 1994)],
      new Set([5, 8]),
    );

    expect(ordered).toEqual([{ id: '5', name: 'AUDI', isPopular: true }]);
  });

  it('answers an empty facet with an empty list', () => {
    expect(orderManufacturers([], new Set([5]))).toEqual([]);
  });
});
