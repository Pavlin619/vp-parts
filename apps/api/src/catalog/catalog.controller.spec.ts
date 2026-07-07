import { CatalogController, parseArticleNumbers } from './catalog.controller';
import { CatalogService } from './catalog.service';

describe('parseArticleNumbers', () => {
  it('returns an empty list when the query is absent or blank', () => {
    expect(parseArticleNumbers(undefined)).toEqual([]);
    expect(parseArticleNumbers('')).toEqual([]);
    expect(parseArticleNumbers(' , ,')).toEqual([]);
  });

  it('splits, trims, and de-duplicates the numbers', () => {
    expect(parseArticleNumbers('WL6340, OC115 ,WL6340')).toEqual([
      'WL6340',
      'OC115',
    ]);
  });
});

describe('CatalogController.getArticlesAvailability', () => {
  const getArticlesAvailabilityMock = jest.fn();
  const controller = new CatalogController({
    getArticlesAvailability: getArticlesAvailabilityMock,
  } as unknown as CatalogService);

  beforeEach(() => jest.clearAllMocks());

  it('forwards the parsed numbers to the service', () => {
    void controller.getArticlesAvailability('WL6340, OC115');

    expect(getArticlesAvailabilityMock).toHaveBeenCalledWith([
      'WL6340',
      'OC115',
    ]);
  });
});

describe('CatalogController.getArticleDetail', () => {
  const getArticleDetailMock = jest.fn();
  const controller = new CatalogController({
    getArticleDetail: getArticleDetailMock,
  } as unknown as CatalogService);

  beforeEach(() => jest.clearAllMocks());

  it('forwards the article number and vehicleId to the service', () => {
    void controller.getArticleDetail('WL6340', 'V10042');

    expect(getArticleDetailMock).toHaveBeenCalledWith('WL6340', 'V10042');
  });

  it('passes undefined vehicleId when it is omitted', () => {
    void controller.getArticleDetail('WL6340', undefined);

    expect(getArticleDetailMock).toHaveBeenCalledWith('WL6340', undefined);
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
