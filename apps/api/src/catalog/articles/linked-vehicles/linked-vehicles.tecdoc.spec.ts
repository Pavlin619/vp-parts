import { Logger } from '@nestjs/common';
import { TecDocTransport } from '../../../tecdoc';
import { ArticleNotFoundException } from '../article-not-found.exception';
import {
  LinkedVehiclesTecDoc,
  VEHICLE_HYDRATION_BATCH_SIZE,
} from './linked-vehicles.tecdoc';

const BOSCH = 30;

function record(
  articleNumber: string,
  overrides: { dataSupplierId?: number; mfrName?: string } = {},
) {
  const { dataSupplierId = BOSCH, mfrName = 'Bosch' } = overrides;

  return {
    articleNumber,
    dataSupplierId,
    mfrName,
    genericArticles: [
      { genericArticleDescription: 'Part', legacyArticleId: 555 },
    ],
    images: [{ imageURL800: `https://img/${articleNumber}.jpg` }],
  };
}

/**
 * A `getArticleLinkedAllLinkingTarget4` response. The real one nests the
 * linkages two levels deep and carries ids only — no vehicle detail whatsoever.
 */
function linkageResponse(...targets: Array<{ id: number; linked?: boolean }>) {
  return {
    status: 200,
    data: {
      array: [
        {
          articleLinkages: {
            array: targets.map(({ id, linked = true }) => ({
              articleLinkId: id * 10,
              linked,
              linkingTargetId: id,
              linkingTargetType: 'P',
            })),
          },
        },
      ],
    },
  };
}

describe('LinkedVehiclesTecDoc', () => {
  let call: jest.Mock;
  let tecdoc: LinkedVehiclesTecDoc;

  beforeEach(() => {
    call = jest.fn();
    tecdoc = new LinkedVehiclesTecDoc({ call } as unknown as TecDocTransport);
  });

  describe('getLegacyArticleIds', () => {
    it('reads the ids the linkage lookup is keyed by off the article', async () => {
      call.mockResolvedValueOnce({ articles: [record('OF-OC115')] });

      expect(await tecdoc.getLegacyArticleIds(BOSCH, 'OF-OC115')).toEqual([
        555,
      ]);
      expect(call).toHaveBeenCalledWith(
        'getArticles',
        expect.objectContaining({
          searchQuery: 'OF-OC115',
          searchType: 0,
          searchMatchType: 'exact',
          dataSupplierIds: [BOSCH],
          includeGenericArticles: true,
        }),
      );
    });

    // TecDoc files one id per article/generic-article pair, so a part sold in
    // two roles carries two of them — with its vehicles split across both.
    it('keeps every role the part is filed under', async () => {
      call.mockResolvedValueOnce({
        articles: [
          {
            ...record('OF-OC115'),
            genericArticles: [
              { genericArticleDescription: 'Oil Filter', legacyArticleId: 1 },
              { genericArticleDescription: 'Filter Set', legacyArticleId: 2 },
            ],
          },
        ],
      });

      expect(await tecdoc.getLegacyArticleIds(BOSCH, 'OF-OC115')).toEqual([
        1, 2,
      ]);
    });

    it('reports an unknown article number as a typed miss', async () => {
      call.mockResolvedValueOnce({ articles: [] });

      await expect(
        tecdoc.getLegacyArticleIds(BOSCH, 'missing'),
      ).rejects.toBeInstanceOf(ArticleNotFoundException);
    });

    // A part TecDoc holds but files no generic article for is an empty section,
    // not a missing part — the one case that must not become a 404.
    it('returns no ids for a known part with no generic article', async () => {
      call.mockResolvedValueOnce({
        articles: [{ ...record('OF-OC115'), genericArticles: [] }],
      });

      expect(await tecdoc.getLegacyArticleIds(BOSCH, 'OF-OC115')).toEqual([]);
    });

    // Brand + exact number is meant to match one part; two records mean the
    // supplier filed the number twice, which nothing here can disambiguate.
    it('warns when the supplier filed the number more than once', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      call.mockResolvedValueOnce({
        totalMatchingArticles: 2,
        articles: [record('OF-OC115')],
      });

      await tecdoc.getLegacyArticleIds(BOSCH, 'OF-OC115');

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Ambiguous lookup for article OF-OC115'),
      );

      warn.mockRestore();
    });
  });

  describe('getLinkedManufacturers', () => {
    it('asks for the makes of one legacy article id', async () => {
      call.mockResolvedValueOnce({
        data: { array: [{ manuId: 5, manuName: 'BMW' }] },
      });

      expect(await tecdoc.getLinkedManufacturers(555)).toEqual([
        { manufacturerId: '5', name: 'BMW' },
      ]);
      expect(call).toHaveBeenCalledWith(
        'getArticleLinkedAllLinkingTargetManufacturer2',
        expect.objectContaining({ articleId: 555, linkingTargetType: 'P' }),
      );
    });

    // `countryGroupFlag` is mandatory and decides whether `country` names one
    // ISO country or a TecDoc country group, so omitting it left which linkages
    // a Bulgarian visitor sees to an undocumented default.
    it('states the country scope the interface requires', async () => {
      call.mockResolvedValueOnce({ status: 200 });

      await tecdoc.getLinkedManufacturers(555);

      expect(call).toHaveBeenCalledWith(
        'getArticleLinkedAllLinkingTargetManufacturer2',
        expect.objectContaining({ country: 'BG', countryGroupFlag: false }),
      );
    });

    it('reads an omitted collection as no makes', async () => {
      call.mockResolvedValueOnce({ status: 200 });

      expect(await tecdoc.getLinkedManufacturers(555)).toEqual([]);
    });
  });

  describe('getLinkedTargetIds', () => {
    // Note the singular `linking`: this function predates the `linkageTarget*`
    // naming the rest of the catalog uses, and ignores the other spelling.
    it('asks for one make’s vehicle linkages by legacy article id', async () => {
      call.mockResolvedValueOnce(linkageResponse({ id: 10020 }));

      expect(await tecdoc.getLinkedTargetIds(555, 5)).toEqual([10020]);
      expect(call).toHaveBeenCalledWith(
        'getArticleLinkedAllLinkingTarget4',
        expect.objectContaining({
          articleId: 555,
          linkingTargetManuId: 5,
          linkingTargetType: 'P',
        }),
      );
    });

    // All three are mandatory in the interface. `linkingTargetId` names a
    // target to *exclude*, and its documented value after an article direct
    // search — which is how this is always reached — is -1.
    it('sends the country scope, the exclusion sentinel and the main-article flag', async () => {
      call.mockResolvedValueOnce({ status: 200 });

      await tecdoc.getLinkedTargetIds(555, 5);

      expect(call).toHaveBeenCalledWith(
        'getArticleLinkedAllLinkingTarget4',
        expect.objectContaining({
          country: 'BG',
          countryGroupFlag: false,
          linkingTargetId: -1,
          withMainArticles: false,
        }),
      );
    });

    // TecDoc states a non-fit explicitly rather than omitting the row, so a
    // `linked: false` linkage is an answer — and the answer is "not this one".
    it('drops the targets TecDoc marks as not linked', async () => {
      call.mockResolvedValueOnce(
        linkageResponse({ id: 10020 }, { id: 10021, linked: false }),
      );

      expect(await tecdoc.getLinkedTargetIds(555, 5)).toEqual([10020]);
    });

    // A part with no catalogued linkages is an ordinary status-200 response
    // with the collection simply absent.
    it('reads an omitted linkage collection as no linkages', async () => {
      call.mockResolvedValueOnce({ status: 200 });

      expect(await tecdoc.getLinkedTargetIds(555, 5)).toEqual([]);
    });
  });

  describe('getVehiclesByIds', () => {
    function vehicleResponse(carIds: number[]) {
      return {
        data: {
          array: carIds.map((carId) => ({
            carId,
            motorCodes: { array: [{ motorCode: 'N47 D20 C' }] },
            vehicleDetails: {
              manuId: 5,
              modId: 8506,
              modelName: '3 Series (E90)',
              typeName: `320d ${carId}`,
            },
          })),
        },
      };
    }

    function requestedIds(callIndex: number): number[] {
      return (call.mock.calls[callIndex][1] as { carIds: { array: number[] } })
        .carIds.array;
    }

    /** Answers each batch with exactly the ids it asked for. */
    function echoRequestedIds() {
      call.mockImplementation((_functionName: string, params: unknown) =>
        Promise.resolve(
          vehicleResponse(
            (params as { carIds: { array: number[] } }).carIds.array,
          ),
        ),
      );
    }

    function idSequence(length: number): number[] {
      return Array.from({ length }, (_, index) => 20000 + index);
    }

    it('hydrates the ids into vehicles with their model series', async () => {
      call.mockResolvedValueOnce(vehicleResponse([10020]));

      const rows = await tecdoc.getVehiclesByIds([10020]);

      expect(call).toHaveBeenCalledWith(
        'getVehicleByIds4',
        expect.objectContaining({ carIds: { array: [10020] } }),
      );
      expect(rows).toEqual([
        expect.objectContaining({
          seriesId: '8506',
          seriesName: '3 Series (E90)',
          manufacturerId: '5',
        }),
      ]);
    });

    // Every one of these is mandatory in the interface, so leaving them out
    // decided nothing — it only handed the choice to an undocumented default.
    // Engine codes are the one block asked for: a mechanic matches the code
    // stamped on the block, and TecDoc omits them unless requested.
    it('states the country scope and every detail block the interface requires', async () => {
      call.mockResolvedValueOnce(vehicleResponse([10020]));

      await tecdoc.getVehiclesByIds([10020]);

      expect(call).toHaveBeenCalledWith(
        'getVehicleByIds4',
        expect.objectContaining({
          country: 'BG',
          countriesCarSelection: 'BG',
          countryGroupFlag: false,
          axles: false,
          cabs: false,
          kbaData: false,
          motorCodes: true,
          protoTypes: false,
          registrationInfo: false,
          secondaryTypes: false,
          wheelbases: false,
        }),
      );
    });

    // The interface caps the id list at 25 ("List of Vehicle ID's (max 25)").
    // A make of a common service part runs well past that, and sending it whole
    // returned the first 25 — a truncated fit list, which a mechanic reads as
    // "this part does not fit my car".
    it('splits a make wider than the documented 25-id ceiling', async () => {
      const carIds = idSequence(60);
      echoRequestedIds();

      const rows = await tecdoc.getVehiclesByIds(carIds);

      expect(call).toHaveBeenCalledTimes(3);
      expect(requestedIds(0)).toEqual(carIds.slice(0, 25));
      expect(requestedIds(1)).toEqual(carIds.slice(25, 50));
      expect(requestedIds(2)).toEqual(carIds.slice(50));
      expect(rows).toHaveLength(60);
    });

    // Both levels of the section are sorted by name downstream, but a batch
    // that resolved out of turn would still scramble which vehicles land in
    // which series if the rows were merged in completion order.
    it('merges the batches in the order the ids were given', async () => {
      const carIds = idSequence(30);
      call
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              setTimeout(
                () => resolve(vehicleResponse(carIds.slice(0, 25))),
                5,
              );
            }),
        )
        .mockResolvedValueOnce(vehicleResponse(carIds.slice(25)));

      const rows = await tecdoc.getVehiclesByIds(carIds);

      expect(rows.map((row) => Number(row.vehicle.vehicleId))).toEqual(carIds);
    });

    // Hydration is the only fan-out in the catalogue, so it is the only read
    // that has to pace itself: a wide make would otherwise put dozens of calls
    // on the wire at once for a single visitor.
    it('keeps only a few batches in flight while still sending them all', async () => {
      const carIds = idSequence(VEHICLE_HYDRATION_BATCH_SIZE * 10);
      let inFlight = 0;
      let peakInFlight = 0;

      call.mockImplementation((_functionName: string, params: unknown) => {
        inFlight += 1;
        peakInFlight = Math.max(peakInFlight, inFlight);

        return new Promise((resolve) => {
          setImmediate(() => {
            inFlight -= 1;
            resolve(
              vehicleResponse(
                (params as { carIds: { array: number[] } }).carIds.array,
              ),
            );
          });
        });
      });

      const rows = await tecdoc.getVehiclesByIds(carIds);

      expect(call).toHaveBeenCalledTimes(10);
      expect(peakInFlight).toBeLessThan(10);
      expect(rows).toHaveLength(carIds.length);
    });

    // Ids can go in that no vehicle comes back for — TecDoc retires vehicles —
    // so a short answer is ordinary rather than a failed read. Nothing else
    // would show a make quietly listing fewer rows than it fits.
    it('warns when fewer vehicles come back than were asked for', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      call.mockResolvedValueOnce(vehicleResponse([10020]));

      await tecdoc.getVehiclesByIds([10020, 10021]);

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Hydrated 1 of 2'),
      );

      warn.mockRestore();
    });

    // A part fits every vehicle or the list is wrong, so a batch that failed
    // must fail the read rather than silently shorten the answer.
    it('fails the whole hydration when one batch fails', async () => {
      call
        .mockResolvedValueOnce(vehicleResponse(idSequence(25)))
        .mockRejectedValueOnce(new Error('TecDoc unavailable'));

      await expect(tecdoc.getVehiclesByIds(idSequence(30))).rejects.toThrow(
        'TecDoc unavailable',
      );
    });

    it('does not call TecDoc for an empty id list', async () => {
      expect(await tecdoc.getVehiclesByIds([])).toEqual([]);
      expect(call).not.toHaveBeenCalled();
    });
  });
});
