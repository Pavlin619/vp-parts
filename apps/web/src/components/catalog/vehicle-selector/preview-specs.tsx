import type { VehicleVariantDto } from "@vp-parts-shop/shared";
import {
  formatDisplacement,
  formatEngineCodes,
  formatPower,
  formatYearRange,
} from "@/lib/catalog/vehicle-specs";
import { cn } from "@/lib/utils";

/** An answer the visitor has not reached yet, rather than one we do not have. */
export const UNKNOWN_VALUE = "—";

/**
 * What is known about the car so far, as a sheet both previews print: the
 * sidebar under the picture, the strip behind its disclosure.
 */
export function VehicleSpecSheet({ variant }: { variant: VehicleVariantDto | null }) {
  return (
    <dl className="border-t border-line text-sm">
      {previewSpecs(variant).map((spec) => (
        <SpecRow key={spec.label} {...spec} />
      ))}
    </dl>
  );
}

/**
 * The same facts laid across the width of a phone rather than down a column.
 *
 * The sheet's six rows are 243px — most of the list's height on a phone, and
 * the strip that opens them sits on top of that list. Two columns halve it, and
 * a screen wide enough for four takes them.
 */
export function VehicleSpecGrid({ variant }: { variant: VehicleVariantDto }) {
  const specs = previewSpecs(variant);

  // The codes go last and full width because they are the only values long
  // enough to wrap — a column half a phone wide breaks "N47 D20 A, N47 D20 C"
  // across three lines and takes the row above with it.
  const codes = specs.filter((spec) => spec.isCode);
  const measurements = specs.filter((spec) => !spec.isCode);

  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-line pt-2.5 sm:grid-cols-4">
      {[...measurements, ...codes].map((spec) => (
        <SpecCell key={spec.label} {...spec} />
      ))}
    </dl>
  );
}

interface PreviewSpec {
  label: string;
  value: string | null;
  /** A code to be read character by character rather than a phrase. */
  isCode?: boolean;
}

/**
 * The sheet the preview prints, whether or not there is anything to fill it
 * with.
 *
 * The first four rows are what identifies a car, so they are on screen from the
 * first paint with a dash where the answer is not known yet — a sheet that
 * appeared row by row would read as the panel loading rather than as the visitor
 * having steps left. Displacement and fuel describe the engine instead, and the
 * engine list prints both against every row of it, so they are only worth
 * repeating once one is picked.
 */
function previewSpecs(variant: VehicleVariantDto | null): PreviewSpec[] {
  const displacement = variant ? formatDisplacement(variant.displacementLiters) : null;

  return [
    {
      label: "Година",
      value: variant ? formatYearRange(variant.yearFrom, variant.yearTo) : null,
    },
    // A third of vehicles are built with more than one engine, and the visitor
    // is matching this against the code on the block in front of them — so all
    // of them print, for the same reason the type-approval numbers below do.
    {
      label: "Двигател",
      value: formatEngineCodes(variant?.engineCodes),
      isCode: true,
    },
    {
      label: "Мощност",
      value: variant ? formatPower(variant.powerKw, variant.powerHp) : null,
    },
    // Empty for 4% of variants, and joined rather than truncated: a variant sold
    // under two type approvals carries both, and the visitor is matching this
    // against a registration document that names one of them.
    { label: "KBA код", value: variant?.kbaNumbers.join(", ") || null, isCode: true },
    ...(displacement ? [{ label: "Обем", value: displacement }] : []),
    ...(variant ? [{ label: "Гориво", value: variant.fuelType }] : []),
  ];
}

function SpecRow({ label, value, isCode }: PreviewSpec) {
  return (
    <div className="flex justify-between gap-2 border-b border-line py-2.5">
      <dt className="text-muted flex-shrink-0">{label}</dt>
      <dd className={cn("font-medium text-ink text-right", isCode && "font-mono")}>
        {value ?? UNKNOWN_VALUE}
      </dd>
    </div>
  );
}


function SpecCell({ label, value, isCode }: PreviewSpec) {
  return (
    <div className={cn("min-w-0", isCode && "col-span-2")}>
      <dt className="text-[10px] font-semibold uppercase tracking-widest text-muted">
        {label}
      </dt>
      <dd className={cn("text-sm font-medium text-ink break-words", isCode && "font-mono")}>
        {value ?? UNKNOWN_VALUE}
      </dd>
    </div>
  );
}
