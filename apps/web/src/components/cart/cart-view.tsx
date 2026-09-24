"use client";

import { Info } from "lucide-react";
import type { ArticleIdentityDto } from "@vp-parts-shop/shared";
import {
  MAX_CART_LINES,
  useCart,
  useCartItemCount,
  useCartLines,
  useIsCartFull,
} from "@/hooks/use-cart";
import { useCartAvailability } from "@/hooks/use-cart-availability";
import { useCartStatus } from "@/hooks/use-cart-status";
import { resolveOrderPromise } from "@/lib/cart/cart-promise";
import {
  cartTotals,
  type CartRowModel,
  type CartTotals,
} from "@/lib/cart/cart-totals";
import type { DeliveryPromise } from "@/lib/delivery/promise";
import { CartAvailabilityError } from "./cart-availability-error";
import { CartListHeader } from "./cart-list-header";
import { CartEmpty } from "./cart-empty";
import { CartListActions } from "./cart-list-actions";
import { CartRow } from "./cart-row";
import { CartSummary } from "./cart-summary";
import { CartWriteErrorBanner } from "./cart-write-error";
import { CheckoutSteps } from "./checkout-steps";

/**
 * The cart page's first step: review what is in the cart and in what
 * quantities. Delivery and payment are step two and live on their own page.
 *
 * The lines are the browser's — they survive a visit in `localStorage` — but
 * every figure on screen is read live at page load, never stored. A cart is the
 * last place a customer checks a price before committing to it, so a price
 * cached alongside the line is the one thing this page must not show.
 */
export function CartView() {
  const status = useCartStatus();
  const lines = useCartLines();
  const itemCount = useCartItemCount();
  const isFull = useIsCartFull();
  // Selected one at a time: subscribing to the whole store would re-render
  // every line on any cart change.
  const setQuantity = useCart((state) => state.setQuantity);
  const toggleLineSelected = useCart((state) => state.toggleLineSelected);
  const setAllLinesSelected = useCart((state) => state.setAllLinesSelected);
  const removeLine = useCart((state) => state.removeLine);
  const clear = useCart((state) => state.clear);

  const { rows, isPending, isError, hasPrices, refetch } = useCartAvailability(lines);

  // The summary answers "what am I about to order", so it counts only the
  // selected lines; the heading counts what the cart holds.
  const selectedRows = rows.filter((row) => row.line.isSelected);
  const totals = cartTotals(selectedRows);
  const promise = resolveOrderPromise(selectedRows);

  return (
    <>
      <CartHeading itemCount={itemCount} />
      <CheckoutSteps current={1} />

      <CartWriteErrorBanner />

      {isFull && <CartFullNotice />}

      {status === "loading" && <CartSkeleton />}

      {status === "empty" && <CartEmpty />}

      {status === "ready" && (
        <CartLines
          rows={rows}
          totals={totals}
          itemCount={itemCount}
          promise={promise}
          isPending={isPending}
          isError={isError}
          hasPrices={hasPrices}
          onRetry={refetch}
          onQuantityChange={setQuantity}
          onToggleSelected={toggleLineSelected}
          onToggleAll={setAllLinesSelected}
          onRemove={removeLine}
          onClear={clear}
        />
      )}
    </>
  );
}

interface CartLinesProps {
  rows: CartRowModel[];
  totals: CartTotals;
  itemCount: number;
  /** The deadline the selected lines are racing, if there is one. */
  promise: DeliveryPromise | null;
  isPending: boolean;
  isError: boolean;
  /** Whether prices are already on screen, which changes what a failure means. */
  hasPrices: boolean;
  onRetry: () => void;
  onQuantityChange: (article: ArticleIdentityDto, quantity: number) => void;
  onToggleSelected: (article: ArticleIdentityDto) => void;
  onToggleAll: (isSelected: boolean) => void;
  onRemove: (article: ArticleIdentityDto) => void;
  onClear: () => void;
}

/**
 * The lines beside their summary.
 *
 * A failed *refetch* keeps the prices already on screen — the retry prompt says
 * they may be stale, which beats blanking figures the customer can see.
 */
function CartLines({
  rows,
  totals,
  itemCount,
  promise,
  isPending,
  isError,
  hasPrices,
  onRetry,
  onQuantityChange,
  onToggleSelected,
  onToggleAll,
  onRemove,
  onClear,
}: CartLinesProps) {
  const selectedCount = rows.filter((row) => row.line.isSelected).length;

  return (
    <>
      {isError && (
        <CartAvailabilityError
          hasPrices={hasPrices}
          unloadedTitle="В момента не можем да заредим цените и наличностите на кошницата."
          onRetry={onRetry}
        />
      )}

      <div className="grid items-start gap-7 pb-16 xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* The container the lines and their headings both lay out from, so a
            table of columns and the labels naming them can never disagree. */}
        <div className="@container min-w-0">
          <CartListHeader
            areAllSelected={selectedCount === rows.length}
            areSomeSelected={selectedCount > 0}
            onToggleAll={onToggleAll}
          />

          <ul className="flex flex-col gap-2" aria-busy={isPending}>
            {rows.map((row) => (
              <li key={`${row.line.brandId}-${row.line.articleNumber}`}>
                <CartRow
                  row={row}
                  onQuantityChange={(quantity) =>
                    onQuantityChange(row.line, quantity)
                  }
                  onToggleSelected={() => onToggleSelected(row.line)}
                  onRemove={() => onRemove(row.line)}
                />
              </li>
            ))}
          </ul>

          <CartListActions onClear={onClear} itemCount={itemCount} />
        </div>

        <aside className="xl:sticky xl:top-24">
          <CartSummary
            totals={totals}
            isPending={isPending}
            hasPrices={hasPrices}
            promise={promise}
          />
        </aside>
      </div>
    </>
  );
}

function CartHeading({ itemCount }: { itemCount: number }) {
  return (
    <div className="mb-3.5 flex items-center gap-3.5">
      <h1 className="font-display text-[32px] font-semibold tracking-[-0.02em] text-ink">
        Кошница
      </h1>
      <span className="text-sm text-ink-3">
        {itemCount} {itemCount === 1 ? "артикул" : "артикула"}
      </span>
    </div>
  );
}

/**
 * Why the catalog stopped offering to add parts. The limit is the batch the
 * whole cart is priced by, so the line past it would cost every other line its
 * price rather than just going unpriced itself.
 */
function CartFullNotice() {
  return (
    <p className="mb-6 flex items-start gap-[7px] rounded-[12px] border border-line bg-bg-sunken px-4 py-3 text-[12.5px] leading-[1.45] text-ink-2">
      <Info className="mt-px h-4 w-4 shrink-0 text-ink-4" aria-hidden="true" />
      Кошницата е пълна — до {MAX_CART_LINES} различни артикула. Премахнете
      артикул, за да добавите друг.
    </p>
  );
}

/**
 * Stands in until we know what the cart holds. The server cannot see the
 * mirror, so it can render neither the lines nor the empty state — and
 * flashing "your cart is empty" at someone whose cart is full is worse than a
 * moment of grey.
 */
function CartSkeleton() {
  return (
    <div
      data-testid="cart-skeleton"
      aria-hidden="true"
      className="grid items-start gap-7 pb-16 xl:grid-cols-[minmax(0,1fr)_360px]"
    >
      <div className="flex flex-col gap-2">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="block h-[90px] animate-pulse rounded-[12px] bg-bg-sunken"
          />
        ))}
      </div>
      <span className="block h-[280px] animate-pulse rounded-[12px] bg-bg-sunken" />
    </div>
  );
}
