import { ConfigService } from '@nestjs/config';
import { TecDocTransport } from '../src/tecdoc/tecdoc-transport';
import { LinkageFunctionTargetType } from '../src/tecdoc/tecdoc-target-types';

/**
 * Answers what the applicable-vehicles chain still has to assume, the day a
 * real TecDoc key lands. Every call below follows the Service Index interface
 * definitions and the Functions guide's "Article direct search" sequence, but
 * none of it has been observed against the live service.
 *
 * Run it as:
 *   TECDOC_BASE_URL=… TECDOC_API_KEY=… TECDOC_PROVIDER_ID=… \
 *     npx ts-node scripts/tecdoc-probe.ts <brandId> <articleNumber>
 *
 * What is *not* in here any more, because the documentation settled it:
 * `linkingTargetManuId` scopes the linkage read (the Service Index titles the
 * function "…of an article by manufacturer" and marks the parameter required),
 * `linkingTargetId: -1` is the prescribed value after an article direct search,
 * and `'P'` on these functions means passenger car alone, with `'PO'` the
 * documented way to add commercial vehicles. This shop wants passenger cars.
 */
interface ProbeResult {
  question: string;
  answer: string;
}

async function main(): Promise<void> {
  const [brandIdArg, articleNumber] = process.argv.slice(2);

  if (!brandIdArg || !articleNumber) {
    console.error(
      'Usage: ts-node scripts/tecdoc-probe.ts <brandId> <articleNumber>',
    );
    process.exit(1);
  }

  const transport = new TecDocTransport(new ConfigService(process.env));
  const brandId = Number(brandIdArg);

  const legacyArticleIds = await probeGenericArticleRoles(
    transport,
    brandId,
    articleNumber,
  );

  if (legacyArticleIds.length === 0) {
    console.error(`No generic article for ${articleNumber}.`);
    process.exit(1);
  }

  const legacyArticleId = legacyArticleIds[0];
  const manufacturerId = await probeLinkedManufacturers(
    transport,
    legacyArticleId,
  );

  if (manufacturerId === undefined) {
    console.error(`No linked make for ${articleNumber}.`);
    process.exit(1);
  }

  const targetIds = await linkedTargetIds(
    transport,
    legacyArticleId,
    manufacturerId,
  );

  console.log(`Linked vehicles for the first make: ${targetIds.length}`);

  const results = [
    await probeVehicleHydration(transport, targetIds),
    await probeHydrationStaysInMake(transport, targetIds, manufacturerId),
  ];

  for (const result of results) {
    console.log(`\n${result.question}\n  ${result.answer}`);
  }
}

/**
 * How often a part is filed under more than one role. Every role costs the
 * chain an extra manufacturer call and an extra linkage call, so this says what
 * merging them actually costs in practice.
 */
async function probeGenericArticleRoles(
  transport: TecDocTransport,
  brandId: number,
  articleNumber: string,
): Promise<number[]> {
  const data = await transport.call<{
    articles?: Array<{
      genericArticles?: Array<{ legacyArticleId?: number }>;
    }>;
  }>('getArticles', {
    articleCountry: 'BG',
    lang: 'bg',
    searchQuery: articleNumber,
    searchType: 0,
    searchMatchType: 'exact',
    dataSupplierIds: [brandId],
    perPage: 1,
    page: 1,
    includeGenericArticles: true,
  });

  const genericArticles = data.articles?.[0]?.genericArticles ?? [];

  console.log(`Generic article roles: ${genericArticles.length}`);

  return genericArticles
    .map((genericArticle) => genericArticle.legacyArticleId)
    .filter((id): id is number => id !== undefined);
}

/**
 * Step 1 of the Functions guide sequence. Whether the function answers at all,
 * and with how many makes — the makes level of the section is this response.
 */
async function probeLinkedManufacturers(
  transport: TecDocTransport,
  legacyArticleId: number,
): Promise<number | undefined> {
  const data = await transport.call<{
    data?: { array?: Array<{ manuId?: number; manuName?: string }> };
  }>('getArticleLinkedAllLinkingTargetManufacturer2', {
    articleCountry: 'BG',
    country: 'BG',
    countryGroupFlag: false,
    lang: 'bg',
    articleId: legacyArticleId,
    linkingTargetType: LinkageFunctionTargetType.PassengerCar,
  });

  const makes = data.data?.array ?? [];

  console.log(
    `Linked makes: ${makes.length}` +
      (makes.length > 0 ? ` (first: ${makes[0].manuName})` : ''),
  );

  return makes[0]?.manuId;
}

/**
 * The hydration read. The request shape is settled — the interface types
 * `carIds` as an `integerList`, whose single repeated member is `array` — so
 * what is left to see is that the fields the rows are mapped from are filed.
 *
 * `fuelType` and `motorCodes` matter most: they are the two columns the
 * Functions guide's own step 3 (`getArticleLinkedAllLinkingTargetsByIds3`)
 * cannot fill, and the reason this chain uses `getVehicleByIds4` instead. If
 * they come back empty here, that trade bought nothing.
 */
async function probeVehicleHydration(
  transport: TecDocTransport,
  targetIds: number[],
): Promise<ProbeResult> {
  const question =
    'Does getVehicleByIds4 fill the fields a vehicle row is mapped from?';

  if (targetIds.length === 0) {
    return { question, answer: 'skipped — no linkages to hydrate' };
  }

  try {
    const records = await hydrate(transport, targetIds.slice(0, 5));
    const first = records[0];

    if (first === undefined) {
      return { question, answer: 'accepted but returned no rows' };
    }

    return {
      question,
      answer:
        `${records.length} rows; motorCodes ` +
        `${first.motorCodes?.length ? 'present' : 'absent'}, ` +
        `fuelType ${first.vehicleDetails?.fuelType ?? '—'}, ` +
        `modId ${first.vehicleDetails?.modId ?? '—'}, ` +
        `yearOfConstrFrom ${first.vehicleDetails?.yearOfConstrFrom ?? '—'}`,
    };
  } catch (error) {
    return { question, answer: `rejected: ${describe(error)}` };
  }
}

/**
 * `getVehicleByIds4` resolves car ids and knows nothing about the article, so
 * every row it returns belongs to the make only because the linkage read was
 * scoped to that make. The documentation says it was. This is the one check
 * that says so from the live data, and it is why the service no longer carries
 * a warning for the same thing.
 */
async function probeHydrationStaysInMake(
  transport: TecDocTransport,
  targetIds: number[],
  manufacturerId: number,
): Promise<ProbeResult> {
  const question =
    'Do the hydrated vehicles all belong to the make the linkage read was scoped to?';

  if (targetIds.length === 0) {
    return { question, answer: 'skipped — no linkages to hydrate' };
  }

  try {
    const records = await hydrate(transport, targetIds.slice(0, 25));
    const makes = new Set(
      records.map((record) => record.vehicleDetails?.manuId),
    );

    return {
      question,
      answer:
        `${records.length} rows span make(s) ${[...makes].join(', ')} ` +
        `(asked for ${manufacturerId})`,
    };
  } catch (error) {
    return { question, answer: `rejected: ${describe(error)}` };
  }
}

async function linkedTargetIds(
  transport: TecDocTransport,
  legacyArticleId: number,
  manufacturerId: number,
): Promise<number[]> {
  const data = await transport.call<{
    data?: {
      array?: Array<{
        articleLinkages?: {
          array?: Array<{ linked?: boolean; linkingTargetId?: number }>;
        };
      }>;
    };
  }>('getArticleLinkedAllLinkingTarget4', {
    articleCountry: 'BG',
    country: 'BG',
    countryGroupFlag: false,
    lang: 'bg',
    articleId: legacyArticleId,
    linkingTargetId: -1,
    linkingTargetManuId: manufacturerId,
    linkingTargetType: LinkageFunctionTargetType.PassengerCar,
    withMainArticles: false,
  });

  return (data.data?.array ?? [])
    .flatMap((record) => record.articleLinkages?.array ?? [])
    .filter((linkage) => linkage.linked !== false)
    .map((linkage) => linkage.linkingTargetId)
    .filter((id): id is number => id !== undefined);
}

interface ProbeVehicleRecord {
  carId?: number;
  motorCodes?: unknown[];
  vehicleDetails?: {
    manuId?: number;
    modId?: number;
    fuelType?: string;
    yearOfConstrFrom?: number;
  };
}

async function hydrate(
  transport: TecDocTransport,
  carIds: number[],
): Promise<ProbeVehicleRecord[]> {
  const data = await transport.call<{
    data?: { array?: ProbeVehicleRecord[] };
  }>('getVehicleByIds4', {
    articleCountry: 'BG',
    country: 'BG',
    countriesCarSelection: 'BG',
    countryGroupFlag: false,
    lang: 'bg',
    carIds: { array: carIds },
    axles: false,
    cabs: false,
    kbaData: false,
    motorCodes: true,
    protoTypes: false,
    registrationInfo: false,
    secondaryTypes: false,
    wheelbases: false,
  });

  return data.data?.array ?? [];
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

void main();
