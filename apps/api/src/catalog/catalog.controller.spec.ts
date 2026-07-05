import { CatalogController, parseIncludeSections } from './catalog.controller';
import { CatalogService } from './catalog.service';

describe('parseIncludeSections', () => {
  it('defaults to both sections when include is absent', () => {
    expect(parseIncludeSections(undefined)).toEqual([
      'details',
      'availability',
    ]);
  });

  it('parses a single section', () => {
    expect(parseIncludeSections('details')).toEqual(['details']);
    expect(parseIncludeSections('availability')).toEqual(['availability']);
  });

  it('parses a comma-separated list and trims whitespace', () => {
    expect(parseIncludeSections('details, availability')).toEqual([
      'details',
      'availability',
    ]);
  });

  it('drops unknown tokens', () => {
    expect(parseIncludeSections('details,bogus')).toEqual(['details']);
  });

  it('falls back to both sections when nothing valid remains', () => {
    expect(parseIncludeSections('bogus')).toEqual(['details', 'availability']);
    expect(parseIncludeSections('')).toEqual(['details', 'availability']);
  });
});

describe('CatalogController.getArticleDetail', () => {
  const getArticleDetailMock = jest.fn();
  const controller = new CatalogController({
    getArticleDetail: getArticleDetailMock,
  } as unknown as CatalogService);

  beforeEach(() => jest.clearAllMocks());

  it('forwards the parsed sections to the service', () => {
    void controller.getArticleDetail('WL6340', 'V10042', 'availability');

    expect(getArticleDetailMock).toHaveBeenCalledWith('WL6340', 'V10042', [
      'availability',
    ]);
  });

  it('defaults to both sections when include is omitted', () => {
    void controller.getArticleDetail('WL6340', undefined, undefined);

    expect(getArticleDetailMock).toHaveBeenCalledWith('WL6340', undefined, [
      'details',
      'availability',
    ]);
  });
});

describe('CatalogController.getSubstitutes', () => {
  const getSubstitutesMock = jest.fn();
  const controller = new CatalogController({
    getSubstitutes: getSubstitutesMock,
  } as unknown as CatalogService);

  beforeEach(() => jest.clearAllMocks());

  it('forwards the article number to the service', () => {
    void controller.getSubstitutes('OX 982D');

    expect(getSubstitutesMock).toHaveBeenCalledWith('OX 982D');
  });
});
