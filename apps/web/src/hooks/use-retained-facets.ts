"use client";

import { useState } from "react";

interface RetainedFacets<T> {
  scopeKey: string;
  facets: T[];
}

/**
 * Keeps the last non-empty facet block for a given result set.
 *
 * The API computes the technical-attribute facets on page 1 only — they
 * describe the whole match set, so every later page would ship a copy of page
 * 1's block — and documents that the client is to hold on to them while
 * paginating. Without this the dimension filters would disappear the moment the
 * visitor opened page 2.
 *
 * `scopeKey` identifies the result set the block describes. When it changes the
 * retained block is dropped rather than shown against results it no longer
 * describes.
 */
export function useRetainedFacets<T>(
  facets: T[] | undefined,
  scopeKey: string,
): T[] {
  const [retained, setRetained] = useState<RetainedFacets<T>>({
    scopeKey,
    facets: [],
  });

  const next = nextRetained(retained, facets, scopeKey);

  // Adjusting state during render: React re-runs this component immediately,
  // before committing, so `next` is what the caller renders either way.
  if (next !== retained) {
    setRetained(next);
  }

  return next.facets;
}

/**
 * Returns the current value unchanged whenever nothing has moved, which is what
 * makes the render-time update above settle after one pass instead of looping.
 * Blocks are compared by content rather than by identity on purpose: a caller
 * that builds the array inline hands over a new reference every render, and an
 * identity check would then never settle.
 */
function nextRetained<T>(
  current: RetainedFacets<T>,
  incoming: T[] | undefined,
  scopeKey: string,
): RetainedFacets<T> {
  if (incoming !== undefined && incoming.length > 0) {
    const isUnchanged =
      scopeKey === current.scopeKey && isSameBlock(incoming, current.facets);

    return isUnchanged ? current : { scopeKey, facets: incoming };
  }

  return scopeKey === current.scopeKey ? current : { scopeKey, facets: [] };
}

function isSameBlock<T>(incoming: T[], current: T[]): boolean {
  return (
    incoming.length === current.length &&
    incoming.every((facet, index) => facet === current[index])
  );
}
