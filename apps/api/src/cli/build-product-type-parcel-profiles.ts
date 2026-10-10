import { NestFactory } from '@nestjs/core';
import { writeFile } from 'node:fs/promises';
import { FileCheckpointStore } from './parcel-profiles/checkpoint-store';
import { ParcelProfileCliModule } from './parcel-profiles/parcel-profile-cli.module';
import { ParcelProfileBuilder } from './parcel-profiles/parcel-profile-builder';
import { DEFAULT_PACING } from './parcel-profiles/paced-tecdoc';
import { parseRunArguments } from './parcel-profiles/run-arguments';

/**
 * Rebuilds the product-type parcel fallback table. About 3.5 hours against the
 * real TecDoc; see docs/DELIVERY-PROVIDERS.md.
 *
 *   npm run parcel-profiles:build -- --limit 20 --dry-run
 *   npm run parcel-profiles:build -- --resume
 */
async function main(): Promise<void> {
  const args = parseRunArguments(process.argv.slice(2));
  const app = await NestFactory.createApplicationContext(
    ParcelProfileCliModule,
    { logger: ['log', 'warn', 'error'] },
  );

  try {
    const report = await app.get(ParcelProfileBuilder).run({
      checkpoint: new FileCheckpointStore(args.checkpointPath),
      existingCheckpoint: args.isResume
        ? 'resume'
        : args.isFresh
          ? 'discard'
          : 'refuse',
      isDryRun: args.isDryRun,
      onlyTypeIds: args.onlyTypeIds,
      limit: args.limit,
      pacing: {
        ...DEFAULT_PACING,
        intervalMs: args.intervalMs ?? DEFAULT_PACING.intervalMs,
      },
    });

    await writeFile(args.reportPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
