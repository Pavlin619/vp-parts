import { NotFoundException } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { CatalogRepository } from './catalog.repository';

const findManufacturersMock = jest.fn();
const findModelSeriesMock = jest.fn();
const findVehicleVariantsMock = jest.fn();
const findAssemblyGroupTreeMock = jest.fn();
const findArticlesMock = jest.fn();
const findArticleDetailsMock = jest.fn();

const mockCatalogRepository = {
  findManufacturers: findManufacturersMock,
  findModelSeries: findModelSeriesMock,
  findVehicleVariants: findVehicleVariantsMock,
  findAssemblyGroupTree: findAssemblyGroupTreeMock,
  findArticles: findArticlesMock,
  findArticleDetails: findArticleDetailsMock,
} as unknown as CatalogRepository;

const getBestPriceAndAvailabilityMock = jest.fn();

const mockInventoryService = {
  getBestPriceAndAvailability: getBestPriceAndAvailabilityMock,
};

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

  describe('listArticles', () => {
    it('returns articles with availability and best price derived via InventoryService', async () => {
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
            available: false,
            bestPriceExVat: null,
            bestPriceIncVat: null,
          },
          {
            articleNumber: 'OC123',
            brandName: 'MANN',
            description: 'Oil Filter',
            thumbnailUrl: null,
            available: false,
            bestPriceExVat: null,
            bestPriceIncVat: null,
          },
        ],
      };

      findArticlesMock.mockResolvedValueOnce(rawArticles);

      getBestPriceAndAvailabilityMock
        .mockResolvedValueOnce({
          available: true,
          priceExVat: 1250,
          priceIncVat: 1500,
        })
        .mockResolvedValueOnce({
          available: false,
          priceExVat: null,
          priceIncVat: null,
        });

      const result = await service.listArticles('V10042', '1001', 1, 20);

      expect(result.total).toBe(2);
      expect(result.items[0].available).toBe(true);
      expect(result.items[0].bestPriceExVat).toBe(1250);
      expect(result.items[0].bestPriceIncVat).toBe(1500);
      expect(result.items[1].available).toBe(false);
      expect(result.items[1].bestPriceExVat).toBeNull();
      expect(result.items[1].bestPriceIncVat).toBeNull();
    });

    it('marks articles as unavailable when inventory service returns no price', async () => {
      const rawArticles = {
        total: 1,
        page: 1,
        pageSize: 20,
        items: [
          {
            articleNumber: 'NOSTOCK',
            brandName: 'TEST',
            description: 'Out of Stock Part',
            thumbnailUrl: null,
            available: false,
            bestPriceExVat: null,
            bestPriceIncVat: null,
          },
        ],
      };

      findArticlesMock.mockResolvedValueOnce(rawArticles);
      getBestPriceAndAvailabilityMock.mockResolvedValueOnce({
        available: false,
        priceExVat: null,
        priceIncVat: null,
      });

      const result = await service.listArticles('V10042', '1001', 1, 20);

      expect(result.items[0].available).toBe(false);
      expect(result.items[0].bestPriceIncVat).toBeNull();
    });
  });

  describe('getArticleDetail', () => {
    it('returns full article details from cache service', async () => {
      const detail = {
        articleNumber: 'WL6340',
        brandName: 'WIX',
        description: 'Oil Filter',
        images: [],
        technicalSpecs: [],
        oemNumbers: [],
        compatibleVehicles: [],
        fitsVehicle: null,
        available: false,
        stockStatus: 'UNKNOWN',
        estimatedDeliveryDays: null,
        bestPriceExVat: null,
        bestPriceIncVat: null,
      };
      findArticleDetailsMock.mockResolvedValueOnce(detail);
      getBestPriceAndAvailabilityMock.mockResolvedValueOnce({
        available: true,
        priceExVat: 1250,
        priceIncVat: 1500,
        stockStatus: 'IN_STOCK',
        estimatedDeliveryDays: 2,
      });

      const result = await service.getArticleDetail('WL6340');

      expect(result.articleNumber).toBe('WL6340');
      expect(result.available).toBe(true);
      expect(result.bestPriceExVat).toBe(1250);
      expect(result.bestPriceIncVat).toBe(1500);
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
});
