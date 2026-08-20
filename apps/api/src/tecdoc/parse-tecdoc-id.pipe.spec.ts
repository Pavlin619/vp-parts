import { BadRequestException } from '@nestjs/common';
import {
  ParseRequiredTecDocIdPipe,
  ParseTecDocIdPipe,
} from './parse-tecdoc-id.pipe';

describe('ParseTecDocIdPipe', () => {
  const pipe = new ParseTecDocIdPipe();

  it('parses a valid id to a number', () => {
    expect(pipe.transform('10001')).toBe(10001);
  });

  it('passes undefined through so it can guard an optional query param', () => {
    expect(pipe.transform(undefined)).toBeUndefined();
  });

  it.each([
    ['letters', 'abc'],
    ['an empty string', ''],
    ['zero', '0'],
    ['a negative number', '-1'],
    ['a decimal', '1.5'],
    ['a numeric-looking suffix', '10001abc'],
    ['null', null],
  ])('rejects %s with a 400', (_label, value) => {
    expect(() => pipe.transform(value)).toThrow(BadRequestException);
  });

  // ParseIntPipe would accept this and truncate it to 1, quietly querying the
  // wrong vehicle rather than saying the input was bad.
  it('rejects a decimal rather than truncating it', () => {
    expect(() => pipe.transform('1.5')).toThrow(BadRequestException);
  });
});

describe('ParseRequiredTecDocIdPipe', () => {
  const pipe = new ParseRequiredTecDocIdPipe();

  it('parses a valid id to a number', () => {
    expect(pipe.transform('10001')).toBe(10001);
  });

  // An absent facet filter asks TecDoc for the whole catalogue rather than the
  // branch the caller named — the same silent widening an unparsed id causes.
  it('rejects an absent value with a 400', () => {
    expect(() => pipe.transform(undefined)).toThrow(BadRequestException);
  });
});
