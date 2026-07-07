import { ConfigService } from '@nestjs/config';
import { TecDocClient } from './tecdoc-client';

const mockFetch = jest.fn();
global.fetch = mockFetch;

const configService = {
  get: jest.fn((key: string) => {
    if (key === 'TECDOC_API_KEY') return 'test-api-key';
    if (key === 'TECDOC_BASE_URL')
      return 'https://webservice.tecalliance.services/pegasus-3-0';
    if (key === 'TECDOC_PROVIDER_ID') return '12345';
    return undefined;
  }),
} as unknown as ConfigService;

const EXPECTED_ENDPOINT =
  'https://webservice.tecalliance.services/pegasus-3-0/services/TecdocToCatDLB.jsonEndpoint';

function mockOkResponse(body: unknown) {
  return { ok: true, json: () => body };
}

describe('TecDocClient', () => {
  let client: TecDocClient;

  beforeEach(() => {
    client = new TecDocClient(configService);
    mockFetch.mockReset();
  });

  describe('getManufacturers', () => {
    it('returns mapped manufacturer list from mfrFacets', async () => {
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({
          mfrFacets: {
            counts: [
              { id: 16, name: 'Volkswagen' },
              { id: 5, name: 'BMW' },
            ],
          },
        }),
      );

      const result = await client.getManufacturers();

      expect(result).toEqual([
        { id: '16', name: 'Volkswagen' },
        { id: '5', name: 'BMW' },
      ]);
    });

    it('POSTs to the JSON endpoint with getLinkageTargets and includeMfrFacets', async () => {
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({ mfrFacets: { counts: [] } }),
      );

      await client.getManufacturers();

      expect(mockFetch).toHaveBeenCalledWith(
        EXPECTED_ENDPOINT,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'X-Api-Key': 'test-api-key',
          }) as Record<string, string>,
          body: expect.stringContaining('"getLinkageTargets"') as string,
        }),
      );
      const body = JSON.parse(
        ((mockFetch.mock.calls[0] as unknown[])[1] as { body: string }).body,
      ) as Record<string, unknown>;
      expect(body.getLinkageTargets).toMatchObject({
        provider: 12345,
        includeMfrFacets: true,
        linkageTargetType: 'P',
      });
    });

    it('throws when HTTP response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 503 });

      await expect(client.getManufacturers()).rejects.toThrow(
        'TecDoc API error: 503',
      );
    });
  });

  describe('getModelSeries', () => {
    it('returns mapped model series from vehicleModelSeriesFacets', async () => {
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({
          vehicleModelSeriesFacets: {
            counts: [
              { id: 2, name: 'Golf' },
              { id: 3, name: 'Passat' },
            ],
          },
        }),
      );

      const result = await client.getModelSeries('16');

      expect(result).toEqual([
        { id: '2', manufacturerId: '16', name: 'Golf' },
        { id: '3', manufacturerId: '16', name: 'Passat' },
      ]);
    });

    it('sends mfrIds as a number in the request body', async () => {
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({ vehicleModelSeriesFacets: { counts: [] } }),
      );

      await client.getModelSeries('16');

      const body = JSON.parse(
        ((mockFetch.mock.calls[0] as unknown[])[1] as { body: string }).body,
      ) as Record<string, unknown>;
      expect(body.getLinkageTargets).toMatchObject({
        provider: 12345,
        mfrIds: 16,
        includeVehicleModelSeriesFacets: true,
      });
    });

    it('throws when HTTP response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

      await expect(client.getModelSeries('16')).rejects.toThrow(
        'TecDoc API error: 404',
      );
    });
  });

  describe('getVehicleTypes', () => {
    it('returns mapped vehicle variants from linkageTargets', async () => {
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({
          linkageTargets: [
            {
              linkageTargetId: 10042,
              vehicleModelSeriesId: 2,
              description: 'Golf VII 2.0 TDI',
              beginYearMonth: '2012-11',
              endYearMonth: '2020-06',
              engines: [{ code: 'CRBC' }],
              kiloWattsFrom: 110,
              fuelType: 'Diesel',
              bodyStyle: 'Hatchback',
            },
          ],
        }),
      );

      const result = await client.getVehicleTypes('2');

      expect(result).toEqual([
        {
          vehicleId: '10042',
          seriesId: '2',
          name: 'Golf VII 2.0 TDI',
          yearFrom: 2012,
          yearTo: 2020,
          engine: 'CRBC',
          powerKw: 110,
          fuelType: 'Diesel',
          bodyType: 'Hatchback',
        },
      ]);
    });

    it('sets yearTo null when endYearMonth is null (still in production)', async () => {
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({
          linkageTargets: [
            {
              linkageTargetId: 10043,
              vehicleModelSeriesId: 2,
              description: 'Golf VIII',
              beginYearMonth: '2020-01',
              endYearMonth: null,
              engines: [],
              kiloWattsFrom: 130,
              fuelType: 'Petrol',
              bodyStyle: 'Hatchback',
            },
          ],
        }),
      );

      const result = await client.getVehicleTypes('2');

      expect(result[0].yearTo).toBeNull();
      expect(result[0].engine).toBe('');
    });
  });

  describe('getAssemblyGroupTree', () => {
    it('returns assembly groups mapped from assemblyGroupFacets', async () => {
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({
          assemblyGroupFacets: {
            counts: [
              {
                assemblyGroupNodeId: 1001,
                assemblyGroupName: 'Brakes',
                parentNodeId: null,
              },
              {
                assemblyGroupNodeId: 2001,
                assemblyGroupName: 'Brake Discs',
                parentNodeId: 1001,
              },
            ],
          },
        }),
      );

      const result = await client.getAssemblyGroupTree('10042');

      expect(result).toEqual([
        { id: '1001', name: 'Brakes', parentId: null },
        { id: '2001', name: 'Brake Discs', parentId: '1001' },
      ]);
    });

    it('sends getArticles with assemblyGroupFacetOptions and linkageTargetId', async () => {
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({ assemblyGroupFacets: { counts: [] } }),
      );

      await client.getAssemblyGroupTree('10042');

      const body = JSON.parse(
        ((mockFetch.mock.calls[0] as unknown[])[1] as { body: string }).body,
      ) as Record<string, unknown>;
      expect(body.getArticles).toMatchObject({
        provider: 12345,
        linkageTargetId: 10042,
        assemblyGroupFacetOptions: { enabled: true, includeCompleteTree: true },
      });
    });
  });

  describe('getBrands', () => {
    it('maps brands to a logo URL, preferring the 200px image', async () => {
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({
          data: {
            array: [
              {
                mfrName: 'HERTH+BUSS ELPARTS',
                dataSupplierLogo: {
                  imageURL100: 'https://cdn.tecalliance.services/100.png',
                  imageURL200: 'https://cdn.tecalliance.services/200.png',
                  imageURL400: 'https://cdn.tecalliance.services/400.png',
                  imageURL800: 'https://cdn.tecalliance.services/800.png',
                },
              },
              { mfrName: 'NO LOGO BRAND' },
            ],
          },
        }),
      );

      const result = await client.getBrands();

      expect(result).toEqual([
        {
          brandName: 'HERTH+BUSS ELPARTS',
          logoUrl: 'https://cdn.tecalliance.services/200.png',
        },
        { brandName: 'NO LOGO BRAND', logoUrl: null },
      ]);
    });

    it('POSTs getBrands with includeAll in the request body', async () => {
      mockFetch.mockResolvedValueOnce(mockOkResponse({ data: { array: [] } }));

      await client.getBrands();

      const body = JSON.parse(
        ((mockFetch.mock.calls[0] as unknown[])[1] as { body: string }).body,
      ) as Record<string, unknown>;
      expect(body.getBrands).toMatchObject({
        provider: 12345,
        includeAll: true,
      });
    });
  });

  describe('getArticles', () => {
    it('returns paginated article list mapping mfrName to brandName', async () => {
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({
          totalMatchingArticles: 42,
          articles: [
            {
              articleNumber: 'WL6340',
              mfrName: 'WIX',
              genericArticles: [{ genericArticleDescription: 'Oil Filter' }],
              images: [
                {
                  imageURL800:
                    'https://digitalassets.tecalliance.services/images/800/abc.jpg',
                },
              ],
            },
          ],
        }),
      );

      const result = await client.getArticles('10042', '1001', 1, 20);

      expect(result.total).toBe(42);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        articleNumber: 'WL6340',
        brandName: 'WIX',
        description: 'Oil Filter',
        thumbnailUrl:
          'https://digitalassets.tecalliance.services/images/800/abc.jpg',
      });
    });

    it('maps articleCriteria and oemNumbers that ride along the includeAll response', async () => {
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({
          totalMatchingArticles: 1,
          articles: [
            {
              articleNumber: 'WL6340',
              mfrName: 'WIX',
              genericArticles: [{ genericArticleDescription: 'Oil Filter' }],
              images: [],
              articleCriteria: [
                { criteriaDescription: 'Height', formattedValue: '87 mm' },
              ],
              oemNumbers: [{ articleNumber: '06L115562' }],
            },
          ],
        }),
      );

      const result = await client.getArticles('10042', '1001', 1, 20);

      expect(result.items[0]).toEqual({
        articleNumber: 'WL6340',
        brandName: 'WIX',
        brandLogoUrl: null,
        description: 'Oil Filter',
        thumbnailUrl: null,
        technicalSpecs: [{ key: 'Height', value: '87 mm' }],
        oemNumbers: ['06L115562'],
        fitsVehicle: null,
      });
    });

    it('passes page directly (1-based) without offset calculation', async () => {
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({ totalMatchingArticles: 0, articles: [] }),
      );

      await client.getArticles('10042', '1001', 3, 20);

      const body = JSON.parse(
        ((mockFetch.mock.calls[0] as unknown[])[1] as { body: string }).body,
      ) as Record<string, unknown>;
      expect((body.getArticles as Record<string, unknown>).page).toBe(3);
    });
  });

  describe('getArticleDetails', () => {
    it('returns article details using getArticles with searchQuery', async () => {
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({
          articles: [
            {
              articleNumber: 'WL6340',
              mfrName: 'WIX',
              genericArticles: [{ genericArticleDescription: 'Oil Filter' }],
              images: [
                {
                  imageURL800:
                    'https://digitalassets.tecalliance.services/images/800/abc.jpg',
                },
              ],
              articleCriteria: [
                { criteriaDescription: 'Width', formattedValue: '76 mm' },
              ],
              oemNumbers: [{ articleNumber: '06L115562' }],
            },
          ],
        }),
      );

      const result = await client.getArticleDetails('WL6340');

      expect(result.articleNumber).toBe('WL6340');
      expect(result.brandName).toBe('WIX');
      expect(result.brandLogoUrl).toBeNull();
      expect(result.images).toEqual([
        'https://digitalassets.tecalliance.services/images/800/abc.jpg',
      ]);
      expect(result.technicalSpecs).toEqual([{ key: 'Width', value: '76 mm' }]);
      expect(result.oemNumbers).toEqual(['06L115562']);
      expect(result.compatibleVehicles).toEqual([]);
    });

    it('sends searchType 0 and searchQuery in the request body', async () => {
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({
          articles: [
            {
              articleNumber: 'WL6340',
              mfrName: 'WIX',
              genericArticles: [],
              images: [],
              articleCriteria: [],
              oemNumbers: [],
            },
          ],
        }),
      );

      await client.getArticleDetails('WL6340');

      const body = JSON.parse(
        ((mockFetch.mock.calls[0] as unknown[])[1] as { body: string }).body,
      ) as Record<string, unknown>;
      expect(body.getArticles).toMatchObject({
        provider: 12345,
        searchQuery: 'WL6340',
        searchType: 0,
        includeAll: true,
      });
    });

    it('sets fitsVehicle null (compatible vehicles require separate lookup)', async () => {
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({
          articles: [
            {
              articleNumber: 'WL6340',
              mfrName: 'WIX',
              genericArticles: [],
              images: [],
              articleCriteria: [],
              oemNumbers: [],
            },
          ],
        }),
      );

      const result = await client.getArticleDetails('WL6340', '10042');

      expect(result.fitsVehicle).toBeNull();
    });

    it('throws when article not found', async () => {
      mockFetch.mockResolvedValueOnce(mockOkResponse({ articles: [] }));

      await expect(client.getArticleDetails('NOTFOUND')).rejects.toThrow(
        'Article not found: NOTFOUND',
      );
    });
  });

  describe('getSubstitutes', () => {
    const comparableResponse = {
      articles: [
        {
          articleNumber: 'OX 982D',
          mfrName: 'KNECHT',
          genericArticles: [{ genericArticleDescription: 'Oil Filter' }],
          images: [],
        },
        {
          articleNumber: 'OC115',
          mfrName: 'MANN-FILTER',
          genericArticles: [{ genericArticleDescription: 'Oil Filter' }],
          images: [
            {
              imageURL800:
                'https://digitalassets.tecalliance.services/images/800/oc115.jpg',
            },
          ],
        },
        {
          articleNumber: 'WL7090',
          mfrName: 'WIX',
          genericArticles: [{ genericArticleDescription: 'Oil Filter' }],
        },
      ],
    };

    it('queries getArticles with searchType 3 (Comparable Number) and the limit', async () => {
      mockFetch.mockResolvedValueOnce(mockOkResponse({ articles: [] }));

      await client.getSubstitutes('OX 982D');

      const body = JSON.parse(
        ((mockFetch.mock.calls[0] as unknown[])[1] as { body: string }).body,
      ) as Record<string, unknown>;
      expect(body.getArticles).toMatchObject({
        provider: 12345,
        searchQuery: 'OX 982D',
        searchType: 3,
        perPage: 20,
        includeAll: true,
      });
    });

    it('excludes the searched article and maps the comparable parts', async () => {
      mockFetch.mockResolvedValueOnce(mockOkResponse(comparableResponse));

      const result = await client.getSubstitutes('OX 982D');

      expect(result).toEqual([
        {
          articleNumber: 'OC115',
          brandName: 'MANN-FILTER',
          brandLogoUrl: null,
          description: 'Oil Filter',
          thumbnailUrl:
            'https://digitalassets.tecalliance.services/images/800/oc115.jpg',
          technicalSpecs: [],
          oemNumbers: [],
          fitsVehicle: null,
        },
        {
          articleNumber: 'WL7090',
          brandName: 'WIX',
          brandLogoUrl: null,
          description: 'Oil Filter',
          thumbnailUrl: null,
          technicalSpecs: [],
          oemNumbers: [],
          fitsVehicle: null,
        },
      ]);
    });

    it('deduplicates comparable articles returned more than once', async () => {
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({
          articles: [
            {
              articleNumber: 'OC115',
              mfrName: 'MANN-FILTER',
              genericArticles: [],
              images: [],
            },
            {
              articleNumber: 'OC115',
              mfrName: 'MANN-FILTER',
              genericArticles: [],
              images: [],
            },
          ],
        }),
      );

      const result = await client.getSubstitutes('OX 982D');

      expect(result).toHaveLength(1);
      expect(result[0].articleNumber).toBe('OC115');
    });

    it('returns an empty list when TecDoc omits the articles array', async () => {
      mockFetch.mockResolvedValueOnce(mockOkResponse({}));

      await expect(client.getSubstitutes('OX 982D')).resolves.toEqual([]);
    });
  });

  describe('searchArticles', () => {
    const searchResponse = {
      totalMatchingArticles: 1,
      articles: [
        {
          articleNumber: 'WL6340',
          mfrName: 'WIX',
          genericArticles: [{ genericArticleDescription: 'Oil Filter' }],
          images: [],
        },
      ],
    };

    it('returns mapped article list items', async () => {
      mockFetch.mockResolvedValueOnce(mockOkResponse(searchResponse));

      const result = await client.searchArticles('WL6340');

      expect(result).toEqual([
        {
          articleNumber: 'WL6340',
          brandName: 'WIX',
          brandLogoUrl: null,
          description: 'Oil Filter',
          thumbnailUrl: null,
          technicalSpecs: [],
          oemNumbers: [],
          fitsVehicle: null,
        },
      ]);
    });

    it('sends searchQuery with searchType 10 and prefix_or_suffix matching', async () => {
      mockFetch.mockResolvedValueOnce(mockOkResponse(searchResponse));

      await client.searchArticles('WL6340');

      const body = JSON.parse(
        ((mockFetch.mock.calls[0] as unknown[])[1] as { body: string }).body,
      ) as Record<string, unknown>;
      expect(body.getArticles).toMatchObject({
        searchQuery: 'WL6340',
        searchType: 10,
        searchMatchType: 'prefix_or_suffix',
      });
      expect(body.getArticles).not.toHaveProperty('linkageTargetId');
    });

    it('scopes the search to a vehicle when vehicleId is provided', async () => {
      mockFetch.mockResolvedValueOnce(mockOkResponse(searchResponse));

      await client.searchArticles('WL6340', '10042');

      const body = JSON.parse(
        ((mockFetch.mock.calls[0] as unknown[])[1] as { body: string }).body,
      ) as Record<string, unknown>;
      expect(body.getArticles).toMatchObject({
        searchQuery: 'WL6340',
        linkageTargetType: 'P',
        linkageTargetId: 10042,
      });
    });
  });

  describe('getAutocompleteSuggestions', () => {
    it('returns mapped suggestions limited by perPage 8 with prefix matching', async () => {
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({
          totalMatchingArticles: 2,
          articles: [
            {
              articleNumber: 'WL6340',
              mfrName: 'WIX',
              genericArticles: [{ genericArticleDescription: 'Oil Filter' }],
            },
            {
              articleNumber: 'WL6341',
              mfrName: 'WIX',
              genericArticles: [],
            },
          ],
        }),
      );

      const result = await client.getAutocompleteSuggestions('WL6');

      expect(result).toEqual([
        {
          articleNumber: 'WL6340',
          brandName: 'WIX',
          description: 'Oil Filter',
        },
        { articleNumber: 'WL6341', brandName: 'WIX', description: '' },
      ]);
      const body = JSON.parse(
        ((mockFetch.mock.calls[0] as unknown[])[1] as { body: string }).body,
      ) as Record<string, unknown>;
      expect(body.getArticles).toMatchObject({
        searchQuery: 'WL6',
        searchType: 10,
        searchMatchType: 'prefix',
        perPage: 8,
      });
    });
  });
});
