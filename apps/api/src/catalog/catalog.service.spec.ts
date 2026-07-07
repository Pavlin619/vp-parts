import { NotFoundException } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { CatalogRepository } from './catalog.repository';
import { InventoryService } from '../inventory/inventory.service';

const findManufacturersMock = jest.fn();
const findModelSeriesMock = jest.fn();
const findVehicleVariantsMock = jest.fn();
const findAssemblyGroupTreeMock = jest.fn();
const findArticlesMock = jest.fn();
const findArticleDetailsMock = jest.fn();
const findSubstitutesMock = jest.fn();
const searchArticlesRepoMock = jest.fn();
const findAutocompleteSuggestionsMock = jest.fn();

const mockCatalogRepository = {
  findManufacturers: findManufacturersMock,
  findModelSeries: findModelSeriesMock,
  findVehicleVariants: findVehicleVariantsMock,
  findAssemblyGroupTree: findAssemblyGroupTreeMock,
  findArticles: findArticlesMock,
  findArticleDetails: findArticleDetailsMock,
  findSubstitutes: findSubstitutesMock,
  searchArticles: searchArticlesRepoMock,
  findAutocompleteSuggestions: findAutocompleteSuggestionsMock,
} as unknown as CatalogRepository;

const getAvailabilityMock = jest.fn();

const mockInventoryService = {
  getAvailability: getAvailabilityMock,
} as unknown as InventoryService;

describe('CatalogService', () => {
  let service: CatalogService;

  beforeEach(() => {
    service = new CatalogService(mockCatalogRepository, mockInventoryService);
    jest.clearAllMocks();
  });

  describe('getManufacturers', () => {
    it('returns manufacturer list from cache service', async () => {
      const manufacturers = [
        { id: '16', name: 'Volkswagen' },
        { id: '5', name: 'BMW' },
      ];
      findManufacturersMock.mockResolvedValueOnce(manufacturers);

      const result = await service.getManufacturers();

      expect(result).toEqual(manufacturers);
    });
  });

  describe('getModelSeries', () => {
    it('returns model series filtered by manufacturerId', async () => {
      const series = [
        { id: '16_2', manufacturerId: '16', name: 'Golf' },
        { id: '16_3', manufacturerId: '16', name: 'Passat' },
      ];
      findModelSeriesMock.mockResolvedValueOnce(series);

      const result = await service.getModelSeries('16');

      expect(result).toEqual(series);
      expect(findModelSeriesMock).toHaveBeenCalledWith('16');
    });
  });

  describe('getVehicleVariants', () => {
    it('returns vehicle types for a series', async () => {
      const variants = [
        {
          vehicleId: 'V10042',
          seriesId: '16_2',
          name: 'Golf VII',
          yearFrom: 2012,
          yearTo: 2020,
          engine: '2.0 TDI',
          powerKw: 110,
          fuelType: 'Diesel',
          bodyType: 'Hatchback',
        },
      ];
      findVehicleVariantsMock.mockResolvedValueOnce(variants);

      const result = await service.getVehicleVariants('16_2');

      expect(result).toEqual(variants);
    });
  });

  describe('getCategoryTree', () => {
    it('returns assembly group tree for a vehicle', async () => {
      const tree = [
        { id: '1001', name: 'Brakes', parentId: null },
        { id: '2001', name: 'Brake Discs', parentId: '1001' },
      ];
      findAssemblyGroupTreeMock.mockResolvedValueOnce(tree);

      const result = await service.getCategoryTree('V10042');

      expect(result).toEqual(tree);
    });
  });

  describe('listArticleMetadata', () => {
    it('returns cacheable catalog metadata without reading live inventory', async () => {
      const rawArticles = {
        total: 2,
        page: 1,
        pageSize: 20,
        items: [
          {
            articleNumber: 'WL6340',
            brandName: 'WIX',
            description: 'Oil Filter',
            thumbnailUrl: null,
          },
          {
            articleNumber: 'OC123',
            brandName: 'MANN',
            description: 'Oil Filter',
            thumbnailUrl: null,
          },
        ],
      };

      findArticlesMock.mockResolvedValueOnce(rawArticles);

      const result = await service.listArticleMetadata('V10042', '1001', 1, 20);

      // The cached grid must not embed request-time inventory, so this path
      // never touches the inventory service — availability is fetched live and
      // separately via getArticlesAvailability.
      expect(result).toEqual(rawArticles);
      expect(findArticlesMock).toHaveBeenCalledWith('V10042', '1001', 1, 20);
      expect(getAvailabilityMock).not.toHaveBeenCalled();
    });
  });

  describe('getArticlesAvailability', () => {
    it('returns live warehouse availability keyed by article number', async () => {
      const warehouse = {
        warehouseId: 'CENTRAL',
        quantity: 6,
        deliveryWorkDays: 0,
        orderCutoffTime: '18:00',
        cutoffAt: '2026-07-05T15:00:00.000Z',
        pickup: { granularity: 'HOUR', earliestAt: '2026-07-05T12:00:00.000Z' },
        courier: { granularity: 'DAY', earliestAt: '2026-07-06T06:00:00.000Z' },
      };
      getAvailabilityMock.mockResolvedValueOnce(
        new Map([
          [
            'WL6340',
            {
              available: true,
              priceExVat: 1250,
              priceIncVat: 1500,
              availabilityByWarehouse: [warehouse],
              computedAt: '2026-07-05T09:00:00.000Z',
            },
          ],
        ]),
      );

      const result = await service.getArticlesAvailability(['WL6340', 'OC123']);

      // The single availability read always returns the warehouse projection.
      expect(getAvailabilityMock).toHaveBeenCalledWith(['WL6340', 'OC123']);
      expect(result).toEqual({
        WL6340: {
          available: true,
          bestPriceExVat: 1250,
          bestPriceIncVat: 1500,
          availabilityByWarehouse: [warehouse],
          computedAt: '2026-07-05T09:00:00.000Z',
        },
      });
    });

    it('fails closed by propagating the read error', async () => {
      const readError = new Error('inventory unavailable');
      getAvailabilityMock.mockRejectedValueOnce(readError);

      await expect(service.getArticlesAvailability(['WL6340'])).rejects.toBe(
        readError,
      );
    });
  });

  describe('getArticleDetail', () => {
    const detail = {
      articleNumber: 'WL6340',
      brandName: 'WIX',
      brandLogoUrl: null,
      description: 'Oil Filter',
      images: [],
      technicalSpecs: [],
      oemNumbers: [],
      compatibleVehicles: [],
      fitsVehicle: null,
    };

    it('returns cacheable catalog metadata only, without reading inventory', async () => {
      findArticleDetailsMock.mockResolvedValueOnce(detail);

      const result = await service.getArticleDetail('WL6340', 'V10042');

      // The detail page caches this metadata and hydrates price/availability
      // separately via getArticlesAvailability, so it never reads inventory.
      expect(result).toEqual(detail);
      expect(findArticleDetailsMock).toHaveBeenCalledWith('WL6340', 'V10042');
      expect(getAvailabilityMock).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when article detail is not found', async () => {
      findArticleDetailsMock.mockRejectedValueOnce(
        new Error('Article not found: NOTFOUND'),
      );

      await expect(service.getArticleDetail('NOTFOUND')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('searchArticles', () => {
    const rawResult = {
      articleNumber: 'WL6340',
      brandName: 'WIX',
      description: 'Oil Filter',
      thumbnailUrl: null,
    };

    it('enriches search results with the full warehouse availability detail', async () => {
      const warehouse = {
        warehouseId: 'CENTRAL',
        quantity: 6,
        deliveryWorkDays: 0,
        orderCutoffTime: '18:00',
        cutoffAt: '2026-07-05T15:00:00.000Z',
        pickup: { granularity: 'HOUR', earliestAt: '2026-07-05T12:00:00.000Z' },
        courier: { granularity: 'DAY', earliestAt: '2026-07-06T06:00:00.000Z' },
      };
      searchArticlesRepoMock.mockResolvedValueOnce([rawResult]);
      getAvailabilityMock.mockResolvedValueOnce(
        new Map([
          [
            'WL6340',
            {
              available: true,
              priceExVat: 1250,
              priceIncVat: 1500,
              availabilityByWarehouse: [warehouse],
              computedAt: '2026-07-05T09:00:00.000Z',
            },
          ],
        ]),
      );

      const result = await service.searchArticles('WL6340');

      expect(searchArticlesRepoMock).toHaveBeenCalledWith(
        'WL6340',
        undefined,
        undefined,
      );
      // Search is dynamic, so it enriches through the same live availability read.
      expect(getAvailabilityMock).toHaveBeenCalledWith(['WL6340']);
      expect(result).toEqual([
        {
          ...rawResult,
          available: true,
          bestPriceExVat: 1250,
          bestPriceIncVat: 1500,
          availabilityByWarehouse: [warehouse],
          computedAt: '2026-07-05T09:00:00.000Z',
        },
      ]);
    });

    it('passes the vehicleId through to the repository', async () => {
      searchArticlesRepoMock.mockResolvedValueOnce([]);

      await service.searchArticles('WL6340', 'V10042');

      expect(searchArticlesRepoMock).toHaveBeenCalledWith(
        'WL6340',
        'V10042',
        undefined,
      );
    });
  });

  describe('getSubstitutes', () => {
    const rawSubstitute = {
      articleNumber: 'OC115',
      brandName: 'MANN-FILTER',
      description: 'Oil Filter',
      thumbnailUrl: null,
    };

    it('returns the cross-reference parts as catalog metadata only, without reading inventory', async () => {
      findSubstitutesMock.mockResolvedValueOnce([rawSubstitute]);

      const result = await service.getSubstitutes('OX 982D');

      expect(findSubstitutesMock).toHaveBeenCalledWith('OX 982D');
      // Availability is fetched live and separately via getArticlesAvailability,
      // mirroring the listing grid's metadata / live-availability split.
      expect(result).toEqual([rawSubstitute]);
      expect(getAvailabilityMock).not.toHaveBeenCalled();
    });

    it('caps the number of substitutes at the configured limit', async () => {
      const many = Array.from({ length: 30 }, (_, index) => ({
        articleNumber: `SUB-${index}`,
        brandName: 'MockBrand',
        description: 'Oil Filter',
        thumbnailUrl: null,
      }));
      findSubstitutesMock.mockResolvedValueOnce(many);

      const result = await service.getSubstitutes('OX 982D');

      expect(result).toHaveLength(20);
    });

    it('returns an empty list when there are no substitutes', async () => {
      findSubstitutesMock.mockResolvedValueOnce([]);

      const result = await service.getSubstitutes('OX 982D');

      expect(result).toEqual([]);
      expect(getAvailabilityMock).not.toHaveBeenCalled();
    });
  });

  describe('getAutocompleteSuggestions', () => {
    it('returns suggestions from the repository without enrichment', async () => {
      const suggestions = [
        {
          articleNumber: 'WL6340',
          brandName: 'WIX',
          description: 'Oil Filter',
        },
      ];
      findAutocompleteSuggestionsMock.mockResolvedValueOnce(suggestions);

      const result = await service.getAutocompleteSuggestions('WL6');

      expect(result).toEqual(suggestions);
      expect(getAvailabilityMock).not.toHaveBeenCalled();
    });
  });
});
