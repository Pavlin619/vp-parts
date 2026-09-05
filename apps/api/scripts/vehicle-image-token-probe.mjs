/**
 * Measures how long a TecDoc vehicle-image URL stays valid.
 *
 * [VERIFY-TC] Whether a vehicle-image token expires, and after how long, is
 * unverified — it is in neither the XSD nor the onboarding guide, and the only
 * way to find out is to hold one and watch it. This script is that measurement;
 * run it daily and read the ladder with `--report`.
 *
 * `getLinkageTargets` returns `vehicleImages` as an opaque ~195-char token on
 * webservice.tecalliance.services/digital-assets-proxy/tecdoc/<token>, and the
 * token is different on every call for the same photo — unlike brand logos and
 * article thumbnails, which arrive as permanent content-hash URLs on
 * digital-assets.tecalliance.services and are why `tecdoc:brands:all` can be
 * cached for a week. Nothing in the XSD or the onboarding guide says whether a
 * token expires.
 *
 * That answer decides the cache design. `tecdoc:vehicle-types:<seriesId>` holds
 * variants for 7 days, so if tokens die sooner than that, storing the URL in the
 * cached DTO serves broken images for the remainder of every entry's life, and
 * the image URL has to be resolved fresh instead.
 *
 * Each run re-checks every token minted by earlier runs and then mints one more,
 * so running it daily builds a ladder of ages from one probe. Read it with
 * `--report`.
 *
 *   node scripts/vehicle-image-token-probe.mjs
 *   node scripts/vehicle-image-token-probe.mjs --report
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const LOG_PATH = join(SCRIPT_DIR, 'vehicle-image-token-probe.json');
const ENV_PATH = join(SCRIPT_DIR, '..', '.env');

// VW GOLF VII — 42 variants, all carrying an image, so a mint never comes back empty.
const PROBE_SERIES_ID = 10585;

const HOUR_MS = 60 * 60 * 1000;

async function readEnv() {
  const raw = await readFile(ENV_PATH, 'utf8');

  return Object.fromEntries(
    raw
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const [key, ...rest] = line.split('=');
        return [key, rest.join('=').trim().replace(/^["']|["']$/g, '')];
      }),
  );
}

async function mintImageUrl(env) {
  const response = await fetch(
    `${env.TECDOC_BASE_URL.replace(/\/$/, '')}/services/TecdocToCatDLB.jsonEndpoint`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': env.TECDOC_API_KEY,
      },
      body: JSON.stringify({
        getLinkageTargets: {
          linkageTargetCountry: 'BG',
          lang: 'bg',
          linkageTargetType: 'V',
          vehicleModelSeriesIds: PROBE_SERIES_ID,
          perPage: 100,
          page: 1,
        },
      }),
    },
  );

  const body = await response.json();

  if (body.status !== 200) {
    throw new Error(`getLinkageTargets failed: ${body.status} ${body.statusText ?? ''}`);
  }

  const withImage = (body.linkageTargets ?? []).find((target) => target.vehicleImages?.length);

  if (!withImage) {
    throw new Error(`no variant of series ${PROBE_SERIES_ID} carries an image`);
  }

  return {
    mintedAt: new Date().toISOString(),
    vehicleId: withImage.linkageTargetId,
    description: withImage.description,
    url: withImage.vehicleImages[0].imageURL400,
    checks: [],
  };
}

async function checkImageUrl(url) {
  // The proxy answers HEAD with 404, so this has to be a GET.
  try {
    const response = await fetch(url, { method: 'GET' });
    const bytes = response.ok ? (await response.arrayBuffer()).byteLength : 0;

    return { at: new Date().toISOString(), status: response.status, bytes };
  } catch (error) {
    return { at: new Date().toISOString(), status: 'network', error: String(error) };
  }
}

async function loadLog() {
  try {
    return JSON.parse(await readFile(LOG_PATH, 'utf8'));
  } catch {
    return [];
  }
}

function ageHours(entry, at = Date.now()) {
  return (at - Date.parse(entry.mintedAt)) / HOUR_MS;
}

function formatAge(hours) {
  return hours < 48 ? `${hours.toFixed(1)}h` : `${(hours / 24).toFixed(1)}d`;
}

function report(log) {
  if (log.length === 0) {
    console.log('No tokens minted yet — run the probe without --report first.');
    return;
  }

  console.log(`${log.length} token(s) minted; newest first\n`);

  for (const entry of [...log].reverse()) {
    console.log(`minted ${entry.mintedAt}  (${formatAge(ageHours(entry))} ago)  ${entry.description}`);

    for (const check of entry.checks) {
      const age = (Date.parse(check.at) - Date.parse(entry.mintedAt)) / HOUR_MS;
      const verdict = check.status === 200 ? 'valid' : 'DEAD';
      console.log(`    at age ${formatAge(age).padStart(6)}  ${verdict}  status=${check.status} bytes=${check.bytes ?? 0}`);
    }
  }

  const dead = log
    .flatMap((entry) =>
      entry.checks
        .filter((check) => check.status !== 200)
        .map((check) => (Date.parse(check.at) - Date.parse(entry.mintedAt)) / HOUR_MS),
    )
    .sort((a, b) => a - b);

  const valid = log
    .flatMap((entry) =>
      entry.checks
        .filter((check) => check.status === 200)
        .map((check) => (Date.parse(check.at) - Date.parse(entry.mintedAt)) / HOUR_MS),
    )
    .sort((a, b) => b - a);

  console.log('');
  console.log(`Oldest token still valid: ${valid.length ? formatAge(valid[0]) : 'none checked yet'}`);
  console.log(`Youngest token seen dead: ${dead.length ? formatAge(dead[0]) : 'none dead yet'}`);
}

async function main() {
  const log = await loadLog();

  if (process.argv.includes('--report')) {
    report(log);
    return;
  }

  for (const entry of log) {
    const check = await checkImageUrl(entry.url);
    entry.checks.push(check);
    console.log(
      `age ${formatAge(ageHours(entry)).padStart(6)}  status=${check.status}  bytes=${check.bytes ?? 0}  (minted ${entry.mintedAt})`,
    );
  }

  const env = await readEnv();
  const minted = await mintImageUrl(env);
  const firstCheck = await checkImageUrl(minted.url);
  minted.checks.push(firstCheck);
  log.push(minted);

  console.log(
    `minted fresh token for "${minted.description}" (vehicle ${minted.vehicleId}): status=${firstCheck.status} bytes=${firstCheck.bytes}`,
  );

  await writeFile(LOG_PATH, `${JSON.stringify(log, null, 2)}\n`);
  console.log(`\n${log.length} token(s) tracked in ${LOG_PATH}`);
}

await main();
