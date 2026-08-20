import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

/**
 * Parses a TecDoc identifier out of a route or query parameter.
 *
 * TecDoc ids — linkage target (vehicle), manufacturer, model series, assembly
 * group node, data supplier, criteria — are positive integers, and we carry them
 * as numbers from here inwards so nothing downstream has to convert or re-check
 * them. Parsing at the boundary is what makes that safe: `Number('abc')` is
 * `NaN`, and `JSON.stringify` writes `NaN` as `null`, so an unparsed id would
 * reach TecDoc as an *absent filter* and quietly widen the query rather than
 * fail it. TecDoc never rejects an id itself — an unknown one simply matches
 * nothing — so this is the only place the check can happen.
 *
 * Stricter than the built-in `ParseIntPipe`, which accepts `'1.5'` and truncates
 * it to `1`. `undefined` passes through, so the same pipe guards an optional
 * query parameter; use {@link ParseRequiredTecDocIdPipe} where an absent id
 * would widen the query the same way an unparsed one does.
 */
@Injectable()
export class ParseTecDocIdPipe implements PipeTransform<
  unknown,
  number | undefined
> {
  transform(value: unknown): number | undefined {
    return value === undefined ? undefined : parseTecDocId(value);
  }
}

/**
 * The same parse for a parameter the handler cannot do without — a facet filter,
 * say, where an absent value asks for the whole catalogue instead of the branch
 * the caller named.
 */
@Injectable()
export class ParseRequiredTecDocIdPipe implements PipeTransform<
  unknown,
  number
> {
  transform(value: unknown): number {
    if (value === undefined) {
      throw new BadRequestException();
    }

    return parseTecDocId(value);
  }
}

function parseTecDocId(value: unknown): number {
  const id = Number(value);

  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestException();
  }

  return id;
}
