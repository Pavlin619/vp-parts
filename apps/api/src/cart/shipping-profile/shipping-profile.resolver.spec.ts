import { Test } from '@nestjs/testing';
import { ArticleReadCache, CrossReferencesService } from '../../catalog';
import { SupplierCatalogRepository } from '../../inventory';
import { CatalogUnavailableException } from '../../tecdoc';
import { ShippingProfileResolver } from './shipping-profile.resolver';

const PART = { brandId: '421', articleNumber: 'ADC1718V' };
const BOX = { length: 30, width: 30, height: 6 };
const UNKNOWN = { weightGrams: null, packageCm: null };
const OIL_FILTER = 7;

function equivalent(articleNumber: string) {
  return { brandId: '30', brandName: 'BOSCH', articleNumber };
}

describe('ShippingProfileResolver', () => {
  let resolver: ShippingProfileResolver;

  const findPackageProfile = jest.fn();
  const findPackageProfiles = jest.fn();
  const readArticle = jest.fn();
  const getCandidates = jest.fn();

  beforeEach(async () => {
    jest.resetAllMocks();
    findPackageProfile.mockResolvedValue(UNKNOWN);
    findPackageProfiles.mockResolvedValue([]);
    readArticle.mockResolvedValue({
      shippingProfile: UNKNOWN,
      genericArticleIds: [OIL_FILTER],
    });
    getCandidates.mockResolvedValue([]);

    const moduleRef = await Test.createTestingModule({
      providers: [
        ShippingProfileResolver,
        {
          provide: SupplierCatalogRepository,
          useValue: { findPackageProfile, findPackageProfiles },
        },
        { provide: ArticleReadCache, useValue: { read: readArticle } },
        { provide: CrossReferencesService, useValue: { getCandidates } },
      ],
    }).compile();

    resolver = moduleRef.get(ShippingProfileResolver);
  });

  function givenEquivalentsWeighing(...grams: number[]): void {
    getCandidates.mockResolvedValue(
      grams.map((_, index) => equivalent(`EQ${index}`)),
    );
    findPackageProfiles.mockResolvedValue(
      grams.map((weightGrams) => ({ weightGrams, packageCm: BOX })),
    );
  }

  it('takes a fully measured catalogue profile without reading TecDoc', async () => {
    findPackageProfile.mockResolvedValue({ weightGrams: 68, packageCm: BOX });

    const profile = await resolver.resolve(PART);

    expect(findPackageProfile).toHaveBeenCalledWith(PART);
    expect(readArticle).not.toHaveBeenCalled();
    expect(profile).toEqual({
      weightGrams: 68,
      packageCm: BOX,
      isEstimated: false,
    });
  });

  it('fills what the catalogue lacks from TecDoc, without asking for equivalents', async () => {
    findPackageProfile.mockResolvedValue({ weightGrams: 68, packageCm: null });
    readArticle.mockResolvedValue({
      shippingProfile: { weightGrams: 50, packageCm: BOX },
      genericArticleIds: [OIL_FILTER],
    });

    const profile = await resolver.resolve(PART);

    expect(readArticle).toHaveBeenCalledWith(421, 'ADC1718V');
    expect(getCandidates).not.toHaveBeenCalled();
    expect(profile).toEqual({
      weightGrams: 68,
      packageCm: BOX,
      isEstimated: false,
    });
  });

  it('asks for no equivalents when TecDoc weighs the part but has no box', async () => {
    readArticle.mockResolvedValue({
      shippingProfile: { weightGrams: 50, packageCm: null },
      genericArticleIds: [OIL_FILTER],
    });

    const profile = await resolver.resolve(PART);

    expect(getCandidates).not.toHaveBeenCalled();
    expect(profile).toEqual({
      weightGrams: 50,
      packageCm: null,
      isEstimated: false,
    });
  });

  it('estimates an unweighed part from the catalogue figures of its equivalents', async () => {
    givenEquivalentsWeighing(1200, 1300, 1400);

    const profile = await resolver.resolve(PART);

    expect(getCandidates).toHaveBeenCalledWith(421, 'ADC1718V');
    expect(findPackageProfiles).toHaveBeenCalledWith([
      { brandId: '30', articleNumber: 'EQ0' },
      { brandId: '30', articleNumber: 'EQ1' },
      { brandId: '30', articleNumber: 'EQ2' },
    ]);
    expect(profile).toEqual({
      weightGrams: 1300,
      packageCm: BOX,
      isEstimated: true,
    });
  });

  it('keeps the part’s own box when only its weight is estimated', async () => {
    const ownBox = { length: 40, width: 10, height: 10 };
    findPackageProfile.mockResolvedValue({
      weightGrams: null,
      packageCm: ownBox,
    });
    givenEquivalentsWeighing(1200, 1300, 1400);

    const profile = await resolver.resolve(PART);

    expect(profile).toEqual({
      weightGrams: 1300,
      packageCm: ownBox,
      isEstimated: true,
    });
  });

  it('stays unweighed when no equivalent is weighed', async () => {
    getCandidates.mockResolvedValue([equivalent('EQ0')]);
    findPackageProfiles.mockResolvedValue([]);

    const profile = await resolver.resolve(PART);

    expect(profile).toEqual({ ...UNKNOWN, isEstimated: false });
  });

  it('stays unweighed for a part with no equivalents', async () => {
    const profile = await resolver.resolve(PART);

    expect(profile).toEqual({ ...UNKNOWN, isEstimated: false });
  });

  it('lets a TecDoc outage fail the read rather than resolve a line unweighed', async () => {
    getCandidates.mockRejectedValue(new CatalogUnavailableException());

    await expect(resolver.resolve(PART)).rejects.toBeInstanceOf(
      CatalogUnavailableException,
    );
  });
});
