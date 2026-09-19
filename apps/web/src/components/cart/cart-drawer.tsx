"use client";

import { Dialog } from "@base-ui/react/dialog";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import type { MouseEvent } from "react";
import { ArrowRight, X } from "lucide-react";
import { formatPrice } from "@vp-parts-shop/shared";
import { AvailabilityLoadError } from "@/components/catalog/availability-load-error";
import { Button, buttonVariants } from "@/components/ui/button";
import { useCart, useCartItemCount, useCartLines } from "@/hooks/use-cart";
import { useCartDrawer } from "@/hooks/use-cart-drawer";
import { availabilityQueryOptions } from "@/lib/api/catalog";
import { buildCartRows, cartTotals } from "@/lib/cart/cart-totals";
import { CartEmpty } from "./cart-empty";
import { CartDrawerRow } from "./cart-drawer-row";

/**
 * The cart as a panel over the page — opened from the header and by every
 * add-to-cart button, so adding a part confirms itself where the visitor is
 * standing instead of pulling them out of the list they are working through.
 *
 * It shows what the cart holds and what it costs, and nothing about delivery:
 * a promise depends on the method chosen at checkout, and one quoted in a panel
 * that closes on the next click is a promise nobody can act on. The cart page
 * is one click away for that.
 *
 * Mounted once at the root layout — the marketing and shop route groups each
 * carry their own header, and both need the same drawer under them. Everything
 * inside the portal renders only while the drawer is up, so a closed drawer
 * costs neither a price read nor a subscription to the cart.
 */
export function CartDrawer() {
  const isOpen = useCartDrawer((state) => state.isOpen);
  const closeCartDrawer = useCartDrawer((state) => state.closeCartDrawer);

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          closeCartDrawer();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-ink/55 transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup className="fixed inset-y-0 right-0 z-50 flex w-[calc(100vw-40px)] max-w-[420px] flex-col border-l border-line bg-bg-card shadow-overlay outline-none transition-transform duration-200 data-ending-style:translate-x-full data-starting-style:translate-x-full">
          <CartDrawerContent onClose={closeCartDrawer} />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * The panel's contents. Split out so it mounts with the portal: the price read
 * below starts when the drawer opens and stops when it closes, rather than
 * running on every page the layout renders.
 */
function CartDrawerContent({ onClose }: { onClose: () => void }) {
  const lines = useCartLines();
  const itemCount = useCartItemCount();
  const setQuantity = useCart((state) => state.setQuantity);
  const removeLine = useCart((state) => state.removeLine);

  const { data, isError, refetch } = useQuery({
    ...availabilityQueryOptions(lines),
    enabled: lines.length > 0,
  });

  const rows = buildCartRows(lines, data ?? (isError ? null : undefined));
  // The total answers "what am I about to order", so it counts the selected
  // lines only — the heading counts everything the cart holds.
  const totals = cartTotals(rows.filter((row) => row.line.isSelected));
  const isPending = lines.length > 0 && data === undefined && !isError;

  // Every link in the drawer — the empty state's way to the catalogue, a row's
  // thumbnail and number, "Виж кошницата" — leads off this page, and the
  // drawer has no business still covering the one it navigated to. Caught
  // once here by delegation rather than on each link, so a link added to a
  // future row or empty state inherits the rule for free. Quantity and
  // remove are plain buttons, never anchors, so they fall through untouched.
  const closeOnNavigate = (event: MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("a")) {
      onClose();
    }
  };

  return (
    <div className="contents" onClick={closeOnNavigate}>
      <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div className="flex items-baseline gap-2.5">
          <Dialog.Title className="font-display text-lg font-semibold text-ink">
            Кошница
          </Dialog.Title>
          <span className="text-[13px] text-ink-3">
            {itemCount} {itemCount === 1 ? "артикул" : "артикула"}
          </span>
        </div>

        <Dialog.Close
          aria-label="Затвори"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-ink-3 transition-colors hover:bg-bg-sunken hover:text-ink"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Dialog.Close>
      </header>

      <div className="flex-1 overflow-y-auto px-5">
        {lines.length === 0 ? (
          <CartEmpty className="border-0 bg-transparent px-2 py-16" />
        ) : (
          <>
            {isError && (
              <AvailabilityLoadError
                onRetry={() => refetch()}
                title="В момента не можем да заредим цените на кошницата."
                className="border-b border-line py-8"
              />
            )}

            <div className="divide-y divide-line" aria-busy={isPending}>
              {rows.map((row) => (
                <CartDrawerRow
                  key={`${row.line.brandId}-${row.line.articleNumber}`}
                  row={row}
                  onQuantityChange={(quantity) =>
                    setQuantity(row.line, quantity)
                  }
                  onRemove={() => removeLine(row.line)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {lines.length > 0 && (
        <footer className="border-t border-line px-5 py-4">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-sm font-semibold text-ink">Общо с ДДС</span>
            {isPending ? (
              <span
                className="block h-[26px] w-[104px] animate-pulse rounded bg-bg-sunken"
                aria-hidden="true"
              />
            ) : (
              <span
                data-testid="cart-drawer-total"
                className="font-display text-[22px] font-semibold tracking-[-0.02em] tabular-nums text-ink"
              >
                {formatPrice(totals.totalIncVat)}
              </span>
            )}
          </div>

          {totals.hasBlockedLines && !isPending && (
            <p className="mt-2 text-[11.5px] leading-[1.45] text-danger">
              Сумата не включва артикулите с недостатъчна наличност.
            </p>
          )}

          {totals.hasUnpricedLines && !isPending && (
            <p className="mt-2 text-[11.5px] leading-[1.45] text-warn">
              Сумата не включва артикулите без актуална цена.
            </p>
          )}

          <Link
            href="/cart"
            className={buttonVariants({
              size: "lg",
              className: "mt-4 h-11 w-full gap-2 rounded-md text-sm font-semibold",
            })}
          >
            Виж кошницата
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>

          <Button
            type="button"
            variant="ghost"
            size="lg"
            onClick={onClose}
            className="mt-2 h-10 w-full rounded-md text-[13px] font-medium text-ink-2"
          >
            Продължи пазаруването
          </Button>
        </footer>
      )}
    </div>
  );
}
