"use client";

import Link from "next/link";
import type {
  AttributeFacetValueDto,
  FittingPositionZone,
} from "@vp-parts-shop/shared";
import {
  buildSearchUrl,
  toggleAttributeGroup,
  type SearchUrlState,
} from "@/lib/catalog/search-url";
import { cn } from "@/lib/utils";

/** One clickable place on the outline, with everything filed under it. */
export interface DiagramZone {
  zone: FittingPositionZone;
  label: string;
  count: number;
  values: string[];
}

const ZONE_LABEL: Readonly<Record<FittingPositionZone, string>> = {
  "front-axle": "Предна ос",
  "front-left": "Предна лява",
  "front-right": "Предна дясна",
  "rear-axle": "Задна ос",
  "rear-left": "Задна лява",
  "rear-right": "Задна дясна",
  left: "Лява страна",
  right: "Дясна страна",
};

/**
 * Where each zone sits over the outline. Percentages so the whole control
 * scales with the sidebar; the car points up, front at the top.
 */
const ZONE_BOX: Readonly<Record<FittingPositionZone, string>> = {
  "front-left": "left-0 top-[11%] h-[15%] w-[23%]",
  "front-right": "right-0 top-[11%] h-[15%] w-[23%]",
  "rear-left": "left-0 bottom-[11%] h-[15%] w-[23%]",
  "rear-right": "right-0 bottom-[11%] h-[15%] w-[23%]",
  "front-axle": "left-[28%] right-[28%] top-[13%] h-[11%]",
  "rear-axle": "left-[28%] right-[28%] bottom-[13%] h-[11%]",
  left: "left-[4%] top-[36%] h-[28%] w-[15%]",
  right: "right-[4%] top-[36%] h-[28%] w-[15%]",
};

/**
 * The order zones are read out to a screen reader and tabbed through. The
 * outline carries the meaning visually, so this is the only place a blind
 * visitor gets one — front to back, left before right.
 */
const ZONE_ORDER: readonly FittingPositionZone[] = [
  "front-axle",
  "front-left",
  "front-right",
  "rear-axle",
  "rear-left",
  "rear-right",
  "left",
  "right",
];

/**
 * Folds the facet values the API placed on the car into one entry per zone.
 *
 * Several values share a zone — TecDoc files front-left as both `VL` and `LV`,
 * and again per numbered axle — so a zone owns a set of tokens and its count
 * is their sum. Values the API left unplaced are not this control's business
 * and are dropped here; the caller still renders them as plain chips.
 */
export function diagramZones(
  values: readonly AttributeFacetValueDto[],
): DiagramZone[] {
  const byZone = new Map<FittingPositionZone, DiagramZone>();

  for (const value of values) {
    if (!value.zone) {
      continue;
    }

    const existing = byZone.get(value.zone);

    if (existing) {
      existing.count += value.count;
      existing.values.push(value.value);
      continue;
    }

    byZone.set(value.zone, {
      zone: value.zone,
      label: ZONE_LABEL[value.zone],
      count: value.count,
      values: [value.value],
    });
  }

  return ZONE_ORDER.filter((zone) => byZone.has(zone)).map(
    (zone) => byZone.get(zone) as DiagramZone,
  );
}

interface FittingPositionDiagramProps {
  state: SearchUrlState;
  criteriaId: string;
  values: readonly AttributeFacetValueDto[];
}

/**
 * The mounting position as a place on the car rather than a list of phrases.
 *
 * Only the zones the result set actually offers are drawn: a fixed set of
 * hotspots would show five dead ones on a single article, which is the shape
 * most searches that reach this control have. A zone is absent, never disabled.
 */
export function FittingPositionDiagram({
  state,
  criteriaId,
  values,
}: FittingPositionDiagramProps) {
  const zones = diagramZones(values);

  if (zones.length === 0) {
    return null;
  }

  return (
    <div className="relative mx-auto aspect-[3/4] w-full max-w-[168px]">
      <CarOutline />

      {zones.map(({ zone, label, count, values: tokens }) => {
        const isSelected = tokens.some((token) =>
          state.attributes.some(
            (attribute) =>
              attribute.criteriaId === criteriaId && attribute.value === token,
          ),
        );

        return (
          <Link
            key={zone}
            href={buildSearchUrl(
              toggleAttributeGroup(state, criteriaId, tokens),
            )}
            prefetch={false}
            aria-label={`${label} (${count}) — ${
              isSelected ? "премахни филтъра" : "добави филтъра"
            }`}
            aria-pressed={isSelected}
            title={`${label} (${count})`}
            className={cn(
              "absolute flex items-center justify-center rounded-[3px] border text-[9px] font-medium leading-none transition-colors",
              ZONE_BOX[zone],
              isSelected
                ? "border-ink bg-ink text-white"
                : "border-line bg-canvas text-ink-3 hover:border-ink-3 hover:text-ink",
            )}
          >
            {count}
          </Link>
        );
      })}
    </div>
  );
}

/** Decorative: the meaning is in the zones layered over it. */
function CarOutline() {
  return (
    <svg
      viewBox="0 0 100 133"
      aria-hidden="true"
      className="absolute inset-0 h-full w-full"
    >
      <path
        d="M34 7 Q50 2 66 7 L74 30 L74 103 L66 126 Q50 131 34 126 L26 103 L26 30 Z"
        className="fill-ink/[0.02] stroke-line"
        strokeWidth="1.5"
      />
      <path
        d="M37 31 Q50 27 63 31 L61 47 Q50 44 39 47 Z"
        className="fill-line/50"
      />
      <path
        d="M39 87 Q50 84 61 87 L63 103 Q50 99 37 103 Z"
        className="fill-line/50"
      />
    </svg>
  );
}
