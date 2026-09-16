/**
 * Kilowatts are what TecDoc and the registration document carry; horsepower is
 * what a Bulgarian buyer knows the engine by. Showing one without the other
 * makes the visitor convert in their head.
 *
 * Absent is a real case for both, not defensive padding: the XSD marks
 * `horsePowerFrom` and `capacityLiters` optional, and an electric variant has
 * no displacement at all. A spec the visitor can live without must not take the
 * dialog down.
 */
export function formatPower(powerKw: number, powerHp: number | null): string {
  if (powerHp == null) {
    return `${powerKw} kW`;
  }

  return `${powerKw} kW (${powerHp} к.с.)`;
}

/** Null for a variant with no displacement to report, such as an electric one. */
export function formatDisplacement(displacementLiters: number | null): string | null {
  if (displacementLiters == null) {
    return null;
  }

  // TecDoc sends a 2.0-litre engine as the number 2, which reads as "2 л".
  return `${displacementLiters.toFixed(1)} л`;
}

/**
 * A variant still in production has no end year, which is a real state rather
 * than missing data — so it reads "2015+" rather than trailing off after the
 * dash.
 */
export function formatYearRange(yearFrom: number, yearTo: number | null): string {
  if (yearTo == null) {
    return `${yearFrom}+`;
  }

  return `${yearFrom}–${yearTo}`;
}

/**
 * Every engine code a vehicle was built with, or null where it has none.
 *
 * Joined rather than truncated to the first, because a third of vehicles carry
 * several and the visitor is matching this against the one code they can read
 * off their own car — showing a sibling's instead is a car they conclude is not
 * theirs.
 *
 * Optional-chained on the way in: variants are cached for a day and the two
 * apps deploy separately, so a browser can be newer than the entry answering
 * it, and unknown has to read as unknown.
 */
export function formatEngineCodes(engineCodes: string[] | undefined): string | null {
  if (!engineCodes?.length) {
    return null;
  }

  return engineCodes.join(", ");
}
