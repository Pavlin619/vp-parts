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
