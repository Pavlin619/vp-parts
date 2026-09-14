"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  articleIdentityKey,
  AVAILABILITY_MAX_ARTICLES,
  type ArticleIdentityDto,
} from "@vp-parts-shop/shared";
import { MAX_QUANTITY } from "@/lib/delivery/availability";
import { useHydration } from "./use-vehicle-context";

/**
 * What a cart line keeps of the catalog so a row paints without a second read.
 * Deliberately the smallest set the row renders from — price and stock are
 * never stored, because a figure saved yesterday is the one thing a cart must
 * not show.
 */
export interface CartLine extends ArticleIdentityDto {
  brandName: string;
  brandLogoUrl: string | null;
  description: string;
  thumbnailUrl: string | null;
  quantity: number;
  /** Whether this line is to be ordered. Everything added starts selected. */
  isSelected: boolean;
}

/** A line's catalog half, as the surface adding it to the cart knows it. */
export type CartLineArticle = Omit<CartLine, "quantity" | "isSelected">;

/**
 * Most lines the cart may hold.
 *
 * Every line on the cart page is priced by one batch availability request, and
 * that endpoint refuses a batch over {@link AVAILABILITY_MAX_ARTICLES} — so a
 * cart past the cap would price not some of its lines but none of them. The
 * cart is the only surface that has to enforce this itself: every catalog
 * surface is already bounded by its page size, while a cart grows one add at a
 * time.
 */
export const MAX_CART_LINES = AVAILABILITY_MAX_ARTICLES;

interface CartState {
  lines: CartLine[];
  /**
   * Adds `quantity`, or raises the existing line by it when the part is in.
   * A part not already in a full cart is refused — see {@link MAX_CART_LINES}.
   */
  addLine: (article: CartLineArticle, quantity: number) => void;
  /** Whether {@link addLine} would take this part. */
  canAddLine: (article: ArticleIdentityDto) => boolean;
  setQuantity: (article: ArticleIdentityDto, quantity: number) => void;
  toggleLineSelected: (article: ArticleIdentityDto) => void;
  setAllLinesSelected: (isSelected: boolean) => void;
  removeLine: (article: ArticleIdentityDto) => void;
  clear: () => void;
}

const lineKey = (article: ArticleIdentityDto) =>
  articleIdentityKey(article.brandId, article.articleNumber);

const clampQuantity = (quantity: number) =>
  Math.min(MAX_QUANTITY, Math.max(1, Math.trunc(quantity)));

/**
 * Whether these lines can take this part. A part already in the cart always
 * can: it raises a line rather than adding one, so it costs the batch nothing.
 */
const hasRoomFor = (lines: CartLine[], article: ArticleIdentityDto) => {
  const key = lineKey(article);

  return (
    lines.length < MAX_CART_LINES || lines.some((line) => lineKey(line) === key)
  );
};

/**
 * The cart, held in the browser and persisted across visits.
 *
 * Lines are identified by brand *and* number: two suppliers file the same
 * article number for different parts, so a number-keyed cart would merge one
 * company's part into the other's line.
 */
export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      lines: [],

      canAddLine: (article) => hasRoomFor(get().lines, article),

      addLine: (article, quantity) =>
        set((state) => {
          const key = lineKey(article);
          const isInCart = state.lines.some((line) => lineKey(line) === key);

          if (!isInCart) {
            if (state.lines.length >= MAX_CART_LINES) {
              return state;
            }

            return {
              lines: [
                ...state.lines,
                { ...article, quantity: clampQuantity(quantity), isSelected: true },
              ],
            };
          }

          // Re-selected on the way in: adding a part is a statement that it is
          // wanted, whatever the line was set to before.
          return {
            lines: state.lines.map((line) =>
              lineKey(line) === key
                ? {
                    ...line,
                    quantity: clampQuantity(line.quantity + quantity),
                    isSelected: true,
                  }
                : line,
            ),
          };
        }),

      setQuantity: (article, quantity) =>
        set((state) => ({
          lines: state.lines.map((line) =>
            lineKey(line) === lineKey(article)
              ? { ...line, quantity: clampQuantity(quantity) }
              : line,
          ),
        })),

      toggleLineSelected: (article) =>
        set((state) => ({
          lines: state.lines.map((line) =>
            lineKey(line) === lineKey(article)
              ? { ...line, isSelected: !line.isSelected }
              : line,
          ),
        })),

      setAllLinesSelected: (isSelected) =>
        set((state) => ({
          lines: state.lines.map((line) => ({ ...line, isSelected })),
        })),

      removeLine: (article) =>
        set((state) => ({
          lines: state.lines.filter(
            (line) => lineKey(line) !== lineKey(article),
          ),
        })),

      clear: () => set({ lines: [] }),
    }),
    { name: "vp-cart" },
  ),
);

/**
 * Shared so the pre-hydration read is one stable array rather than a fresh `[]`
 * per render, which would re-run every memo downstream of it.
 */
const NO_LINES: CartLine[] = [];

/**
 * The cart's lines, as a surface may read them: empty until hydration
 * completes, the stored lines after.
 *
 * `persist` rehydrates from `localStorage` while the module loads, so a
 * component subscribing to the store directly would render stored lines on its
 * first client pass against server HTML that could only ever be empty. Every
 * cart surface reads through here, and one that distinguishes "empty cart" from
 * "not read yet" pairs this with `useHydration()`.
 */
export function useCartLines(): CartLine[] {
  const isHydrated = useHydration();
  const lines = useCart((state) => state.lines);

  return isHydrated ? lines : NO_LINES;
}

/** Total pieces in the cart, not lines — what the header badge counts. */
export function useCartItemCount(): number {
  const lines = useCartLines();

  return lines.reduce((total, line) => total + line.quantity, 0);
}

/**
 * Whether the cart would take this part, as a surface offering to add it reads
 * it. False only once the cart is full of *other* parts.
 *
 * Reads as `true` until hydration, matching the empty cart the server rendered:
 * a button that arrives disabled and then enables is a hydration mismatch.
 */
export function useCanAddLine(article: ArticleIdentityDto): boolean {
  const isHydrated = useHydration();
  const hasRoom = useCart((state) => hasRoomFor(state.lines, article));

  return !isHydrated || hasRoom;
}

/** Whether the cart holds as many lines as it may — see {@link MAX_CART_LINES}. */
export function useIsCartFull(): boolean {
  return useCartLines().length >= MAX_CART_LINES;
}
