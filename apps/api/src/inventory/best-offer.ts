import { DeliveryOutcome, DeliveryRule, ownStockOutcome } from './delivery';

/** Our own aggregated stock for a part. Prices are integer EUR cents. */
export interface OwnOffer {
  quantity: number;
  priceExVatCents: number;
  priceIncVatCents: number;
}

/**
 * A single supplier's stock line for a part, with its delivery already
 * resolved. `sellPriceCents` is the supplier's VAT-inclusive sell price (the
 * backoffice feed already includes VAT). Each line is one supplier + warehouse
 * combination; lines are never merged so we always know exactly how much each
 * supplier holds.
 */
export interface SupplierOffer {
  supplierSource: string;
  warehouseCode: string | null;
  quantity: number;
  buyPriceCents: number;
  sellPriceCents: number;
  /** Inherent delivery capability, used for the static warehouse grouping. */
  rule: DeliveryRule;
  delivery: DeliveryOutcome;
}

export interface BestOfferInput {
  own: OwnOffer | null;
  suppliers: SupplierOffer[];
}

export interface BestOfferOptions {
  /** Used only to derive the ex-VAT price from a supplier's VAT-inclusive price. */
  vatRate: number;
}

/**
 * One fulfillable source contributing to the displayed offer, kept separate per
 * supplier + warehouse so the (future) order-sourcing logic can buy the right
 * quantity from each. `supplierSource: null` denotes our own stock, which has
 * no buy price. `sellPriceCents` is VAT-inclusive.
 */
export interface OfferSource {
  supplierSource: string | null;
  warehouseCode: string | null;
  quantity: number;
  buyPriceCents: number | null;
  sellPriceCents: number;
}

export interface BestOffer {
  available: boolean;
  priceExVatCents: number | null;
  priceIncVatCents: number | null;
}

/** A group of sources that share the same delivery outcome (and so rank). */
interface DeliveryBucket {
  outcome: DeliveryOutcome;
  sources: OfferSource[];
}

/**
 * Selects the single offer to display for a part. Our own stock is the primary
 * source: when present, our stock is the fastest (IN_STOCK) option and suppliers
 * only add quantity onto a (slower) delivery band. The displayed sell price is
 * ours, but we never undercut our suppliers — if a supplier lists the part below
 * us we keep our price, and if our price is below the cheapest supplier we raise
 * the displayed price up to that supplier's price to protect margin. When we do
 * not carry the part, the fastest delivery band with stock wins, and within that
 * band the supplier with the lowest buy price sets the displayed sell price.
 * `sources` keeps the per-supplier split so we never lose track of who holds how
 * much; the customer-facing per-warehouse quantities are derived separately in
 * the inventory service.
 */
export function selectBestOffer(
  input: BestOfferInput,
  options: BestOfferOptions,
): BestOffer {
  const { own, suppliers } = input;
  const carriesOwn = own !== null;

  const buckets = new Map<number, DeliveryBucket>();

  if (own && own.quantity > 0) {
    addSource(buckets, ownStockOutcome(), {
      supplierSource: null,
      warehouseCode: null,
      quantity: own.quantity,
      buyPriceCents: null,
      sellPriceCents: own.priceIncVatCents,
    });
  }

  for (const supplier of suppliers) {
    if (supplier.quantity <= 0) continue;
    addSource(buckets, supplier.delivery, {
      supplierSource: supplier.supplierSource,
      warehouseCode: supplier.warehouseCode,
      quantity: supplier.quantity,
      buyPriceCents: supplier.buyPriceCents,
      sellPriceCents: supplier.sellPriceCents,
    });
  }

  if (buckets.size === 0) {
    return {
      available: false,
      priceExVatCents: carriesOwn ? own.priceExVatCents : null,
      priceIncVatCents: carriesOwn ? own.priceIncVatCents : null,
    };
  }

  const fastestSources = fastestWindowSources(buckets);

  return {
    available: true,
    ...resolvePrice(own, suppliers, fastestSources, options.vatRate),
  };
}

/**
 * The sources of the fastest (lowest-rank) delivery window, cheapest-first with
 * our own stock first, so the price resolver reads from the supplier we would
 * actually fulfil from.
 */
function fastestWindowSources(
  buckets: Map<number, DeliveryBucket>,
): OfferSource[] {
  const fastest = [...buckets.values()].reduce((current, candidate) =>
    candidate.outcome.rank < current.outcome.rank ? candidate : current,
  );
  return sortedCheapestFirst(fastest.sources);
}

function addSource(
  buckets: Map<number, DeliveryBucket>,
  outcome: DeliveryOutcome,
  source: OfferSource,
): void {
  const bucket = buckets.get(outcome.rank);
  if (bucket) {
    bucket.sources.push(source);
    return;
  }
  buckets.set(outcome.rank, { outcome, sources: [source] });
}

/** A source we buy in, i.e. anything but our own stock. */
type PurchasedSource = OfferSource & { buyPriceCents: number };

/**
 * Order of the suppliers we would buy a part from within one delivery band:
 * lowest buy price, then lowest sell price. The second key is not cosmetic —
 * two suppliers quoting the same buy price at the same speed is common enough
 * to matter, and with buy price as the only key the price we display is
 * whichever row the database happened to return first.
 */
function bySourcingPreference(
  a: PurchasedSource | SupplierOffer,
  b: PurchasedSource | SupplierOffer,
): number {
  return (
    a.buyPriceCents - b.buyPriceCents || a.sellPriceCents - b.sellPriceCents
  );
}

/** Our own stock (no buy price) first, then the suppliers we would source from. */
function sortedCheapestFirst(sources: OfferSource[]): OfferSource[] {
  const ownStock = sources.filter((source) => source.buyPriceCents === null);
  const purchased = sources
    .filter(
      (source): source is PurchasedSource => source.buyPriceCents !== null,
    )
    .sort(bySourcingPreference);

  return [...ownStock, ...purchased];
}

/**
 * When we carry the part our own sell price is the baseline, but we never
 * undercut the supplier we would actually buy from: if our price is below that
 * supplier's (VAT-inclusive) sell price we raise the displayed price up to it,
 * otherwise we keep ours. When we do not carry the part that same supplier sets
 * the price. Supplier sell prices already include VAT, so we only derive the
 * ex-VAT figure from them.
 */
function resolvePrice(
  own: OwnOffer | null,
  suppliers: SupplierOffer[],
  sortedSources: OfferSource[],
  vatRate: number,
): { priceExVatCents: number; priceIncVatCents: number } {
  if (own) {
    const referenceIncVat = sourcedSupplierSellPrice(suppliers);
    const weUndercutSuppliers =
      referenceIncVat !== null && own.priceIncVatCents < referenceIncVat;

    if (weUndercutSuppliers) {
      return fromIncVatPrice(referenceIncVat, vatRate);
    }

    return {
      priceExVatCents: own.priceExVatCents,
      priceIncVatCents: own.priceIncVatCents,
    };
  }

  return fromIncVatPrice(sortedSources[0].sellPriceCents, vatRate);
}

/**
 * The (VAT-inclusive) sell price of the supplier we would source the part from:
 * fastest delivery first, then the lowest buy price within that delivery band —
 * because that is the supplier we would actually buy it from. Null when no
 * supplier has stock.
 */
function sourcedSupplierSellPrice(suppliers: SupplierOffer[]): number | null {
  let sourced: SupplierOffer | null = null;
  for (const supplier of suppliers) {
    if (supplier.quantity <= 0) continue;
    if (sourced === null || isPreferredSupplier(supplier, sourced)) {
      sourced = supplier;
    }
  }
  return sourced?.sellPriceCents ?? null;
}

/** Faster delivery wins; within one delivery band the sourcing order decides. */
function isPreferredSupplier(
  candidate: SupplierOffer,
  current: SupplierOffer,
): boolean {
  if (candidate.delivery.rank !== current.delivery.rank) {
    return candidate.delivery.rank < current.delivery.rank;
  }
  return bySourcingPreference(candidate, current) < 0;
}

/** Derives the ex-VAT figure from a VAT-inclusive price (no VAT added on top). */
function fromIncVatPrice(
  incVat: number,
  vatRate: number,
): { priceExVatCents: number; priceIncVatCents: number } {
  return {
    priceExVatCents: Math.round(incVat / (1 + vatRate)),
    priceIncVatCents: incVat,
  };
}
