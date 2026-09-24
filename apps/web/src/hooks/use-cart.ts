"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  articleIdentityKey,
  MAX_CART_LINE_QUANTITY,
  MAX_CART_LINES,
  type ArticleIdentityDto,
  type CartDto,
  type CartLineDto,
} from "@vp-parts-shop/shared";
import { ApiError } from "@/lib/api";
import {
  addCartLine,
  clearCart,
  getCart,
  readCartToken,
  removeCartLine,
  setCartSelection,
  updateCartLine,
} from "@/lib/api/cart";
import { useIsHydrated } from "./use-is-hydrated";

export { MAX_CART_LINES };

/**
 * Why a cart write did not land, for a surface that wants to say something
 * went wrong. `OFFLINE` also covers any server error the two named cases
 * don't distinguish — the message it renders as is a reasonable fallback
 * either way.
 */
export type CartWriteErrorCode =
  | "CART_FULL"
  | "CART_ITEM_NOT_FOUND"
  | "OFFLINE"
  | "SYNC_FAILED";

export interface CartWriteError {
  code: CartWriteErrorCode;
}

/**
 * What a cart line keeps of the catalog so a row paints without a second read.
 * Deliberately the smallest set the row renders from — price and stock are
 * never stored, because a figure saved yesterday is the one thing a cart must
 * not show.
 *
 * {@link addedAtPriceIncVat} is the one exception and is never rendered as the
 * price: it is what the cart compares the live figure against to say the price
 * has moved since the part went in.
 */
export interface CartLine extends ArticleIdentityDto {
  brandName: string;
  brandLogoUrl: string | null;
  description: string;
  thumbnailUrl: string | null;
  quantity: number;
  /** Whether this line is to be ordered. Everything added starts selected. */
  isSelected: boolean;
  addedAtPriceIncVat: number | null;
}

/** A line's catalog half, as the surface adding it to the cart knows it. */
export type CartLineArticle = Omit<
  CartLine,
  "quantity" | "isSelected" | "addedAtPriceIncVat"
>;

/** How long the stepper may be held before the change is sent. */
const QUANTITY_WRITE_DELAY_MS = 400;

interface CartState {
  lines: CartLine[];
  /** The server's id for this cart, empty until it has answered once. */
  cartId: string;
  /** The server's version of what `lines` shows — see {@link adoptServerCart}. */
  version: number;
  /** Why the last write did not land; cleared by the next one that does. */
  lastWriteError: CartWriteError | null;

  /**
   * Adds `quantity`, or raises the existing line by it when the part is in.
   * A part not already in a full cart is refused — see {@link MAX_CART_LINES}.
   * `priceIncVat` is the live figure on screen, kept as the line's reference.
   *
   * The mirror updates before this resolves — the promise is for a caller that
   * wants to know when the write itself has landed, e.g. to show a spinner.
   */
  addLine: (
    article: CartLineArticle,
    quantity: number,
    priceIncVat?: number | null,
  ) => Promise<void>;
  /** Whether {@link addLine} would take this part. */
  canAddLine: (article: ArticleIdentityDto) => boolean;
  setQuantity: (article: ArticleIdentityDto, quantity: number) => void;
  toggleLineSelected: (article: ArticleIdentityDto) => void;
  setAllLinesSelected: (isSelected: boolean) => void;
  removeLine: (article: ArticleIdentityDto) => void;
  clear: () => void;

  /** Takes the server's cart as the truth, unless it is older than what we hold. */
  adoptServerCart: (cart: CartDto) => void;
  /** Dismisses the current {@link lastWriteError} before the next write clears it. */
  dismissWriteError: () => void;
  /** Records that the background read failed, unless a write already has. */
  reportSyncFailure: () => void;
  /** Resolves once every queued write has been sent and answered. */
  whenSettled: () => Promise<void>;
  /** Whether a write is in flight or still waiting out its debounce. */
  hasPendingWrite: () => boolean;
}

const lineKey = (article: ArticleIdentityDto) =>
  articleIdentityKey(article.brandId, article.articleNumber);

const clampQuantity = (quantity: number) =>
  Math.min(MAX_CART_LINE_QUANTITY, Math.max(1, Math.trunc(quantity)));

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
 * The cart.
 *
 * The lines live on the server so they follow the customer between devices and
 * so checkout reads what is being bought from somewhere the browser cannot
 * rewrite. What is held here is a *mirror*: the shopper sees their click land
 * at once, and the write follows.
 *
 * Writes are queued and sent one at a time. Concurrency here is not a
 * throughput problem worth solving — a person clicks one thing at a time — but
 * an ordering one: a slow add answering after the removal that followed it
 * would put the line back.
 */
export const useCart = create<CartState>()(
  persist(
    (set, get) => {
      const write = writeQueue(set, get);

      return {
        lines: [],
        cartId: "",
        version: 0,
        lastWriteError: null,

        canAddLine: (article) => hasRoomFor(get().lines, article),

        addLine: (article, quantity, priceIncVat = null) => {
          const key = lineKey(article);
          const lines = get().lines;
          const isInCart = lines.some((line) => lineKey(line) === key);

          if (!isInCart && lines.length >= MAX_CART_LINES) {
            set({ lastWriteError: { code: "CART_FULL" } });
            return Promise.resolve();
          }

          // Narrowed rather than spread: a caller may hand us a whole catalog
          // DTO, and its images, specs and OE numbers belong neither in a cart
          // line nor in the request body the API validates.
          const catalog = onlyCartFields(article);

          set({
            lines: isInCart
              ? lines.map((line) =>
                  lineKey(line) === key
                    ? {
                        ...line,
                        quantity: clampQuantity(line.quantity + quantity),
                        // Re-selected on the way in: adding a part is a
                        // statement that it is wanted, whatever the line was
                        // set to before.
                        isSelected: true,
                      }
                    : line,
                )
              : [
                  ...lines,
                  {
                    ...catalog,
                    quantity: clampQuantity(quantity),
                    isSelected: true,
                    addedAtPriceIncVat: priceIncVat,
                  },
                ],
          });

          return write.send(`add:${key}`, () =>
            addCartLine({
              ...catalog,
              quantity: clampQuantity(quantity),
              addedAtPriceIncVat: priceIncVat,
            }),
          );
        },

        setQuantity: (article, quantity) => {
          const clamped = clampQuantity(quantity);

          set((state) => ({
            lines: state.lines.map((line) =>
              lineKey(line) === lineKey(article)
                ? { ...line, quantity: clamped }
                : line,
            ),
          }));

          write.sendAfterPause(`quantity:${lineKey(article)}`, () =>
            updateCartLine(identityOf(article), { quantity: clamped }),
          );
        },

        toggleLineSelected: (article) => {
          const key = lineKey(article);
          const line = get().lines.find((entry) => lineKey(entry) === key);

          if (!line) {
            return;
          }

          const toggled = !line.isSelected;

          set((state) => ({
            lines: state.lines.map((line) =>
              lineKey(line) === key ? { ...line, isSelected: toggled } : line,
            ),
          }));

          write.send(`select:${key}`, () =>
            updateCartLine(identityOf(article), { isSelected: toggled }),
          );
        },

        setAllLinesSelected: (isSelected) => {
          set((state) => ({
            lines: state.lines.map((line) => ({ ...line, isSelected })),
          }));

          write.send("select:all", () => setCartSelection(isSelected));
        },

        removeLine: (article) => {
          const key = lineKey(article);

          set((state) => ({
            lines: state.lines.filter((line) => lineKey(line) !== key),
          }));

          // A quantity change queued for this line (or any other write still
          // waiting out its debounce) would otherwise fire after the removal
          // and hit a line the server no longer has.
          write.cancelPendingFor(key);
          write.send(`remove:${key}`, () => removeCartLine(identityOf(article)));
        },

        clear: () => {
          set({ lines: [] });

          write.send("clear", clearCart);
        },

        adoptServerCart: (cart) => {
          // A response that crossed with a newer one would rewind the cart. A
          // different id is always taken: that is a sign-in handing us the
          // account's cart, not an older answer about this one.
          if (cart.id === get().cartId && cart.version < get().version) {
            return;
          }

          set({
            lines: cart.lines.map(toCartLine),
            cartId: cart.id,
            version: cart.version,
            lastWriteError: null,
          });
        },

        dismissWriteError: () => set({ lastWriteError: null }),

        reportSyncFailure: () => {
          if (!get().lastWriteError) {
            set({ lastWriteError: { code: "SYNC_FAILED" } });
          }
        },

        whenSettled: () => write.whenSettled(),

        hasPendingWrite: () => write.hasPendingWrite(),
      };
    },
    {
      name: "vp-cart-mirror",
      version: 1,
      partialize: ({ lines, cartId, version }) => ({ lines, cartId, version }),
    },
  ),
);

type SetCartState = (partial: Partial<CartState>) => void;
type GetCartState = () => CartState;

/**
 * Sends cart writes one at a time, in the order they were made.
 *
 * Writes keyed the same while one is still waiting replace it — holding the
 * quantity stepper is one change the shopper is making, not eight, and the
 * server only needs the number they stopped on.
 */
interface DebouncedWrite {
  timeout: ReturnType<typeof setTimeout>;
  /** Resolves once the write this timeout eventually fires has been answered. */
  settled: Promise<void>;
}

function writeQueue(set: SetCartState, get: GetCartState) {
  let chain: Promise<void> = Promise.resolve();
  let inFlight = 0;
  const pending = new Map<string, DebouncedWrite>();

  const run = (request: () => Promise<CartDto>): Promise<void> => {
    inFlight += 1;
    chain = chain
      .then(async () => {
        try {
          get().adoptServerCart(await request());
        } catch (error) {
          await recover(toWriteErrorCode(error));
        }
      })
      .finally(() => {
        inFlight -= 1;
      });

    return chain;
  };

  /**
   * A refused write leaves the mirror showing something the server never
   * accepted, so the cart is re-read rather than guessed at. When that cannot
   * be done either, the optimistic lines stay on screen — the shopper is
   * offline, and blanking their cart is the worse of the two wrong answers.
   *
   * A missing cart token is the case to be careful with, whether because no
   * cart was ever minted or because it was evicted after one was: a read
   * would answer "empty" from the absence of a token rather than from the
   * server, and quietly undo the click that failed.
   *
   * Either way `code` is what a surface renders — the re-read only decides
   * whether the mirror can still be trusted, not what caused the write to fail.
   */
  const recover = async (code: CartWriteErrorCode) => {
    if (!readCartToken()) {
      set({ lastWriteError: { code } });
      return;
    }

    try {
      get().adoptServerCart(await getCart());
      set({ lastWriteError: { code } });
    } catch {
      set({ lastWriteError: { code: "OFFLINE" } });
    }
  };

  const cancel = (key: string) => {
    clearTimeout(pending.get(key)?.timeout);
    pending.delete(key);
  };

  return {
    send(key: string, request: () => Promise<CartDto>): Promise<void> {
      cancel(key);
      return run(request);
    },

    sendAfterPause(key: string, request: () => Promise<CartDto>) {
      cancel(key);

      let resolveSettled = () => {};
      const settled = new Promise<void>((resolve) => {
        resolveSettled = resolve;
      });

      const timeout = setTimeout(() => {
        pending.delete(key);
        run(request).finally(resolveSettled);
      }, QUANTITY_WRITE_DELAY_MS);

      pending.set(key, { timeout, settled });
    },

    /** Cancels any write still waiting out its debounce for this line. */
    cancelPendingFor(lineKeyToCancel: string) {
      for (const key of pending.keys()) {
        if (key.endsWith(`:${lineKeyToCancel}`)) {
          cancel(key);
        }
      }
    },

    hasPendingWrite() {
      return inFlight > 0 || pending.size > 0;
    },

    async whenSettled() {
      while (pending.size > 0) {
        await Promise.all([...pending.values()].map((write) => write.settled));
      }

      await chain;
    },
  };
}

function toWriteErrorCode(error: unknown): CartWriteErrorCode {
  return error instanceof ApiError &&
    (error.errorCode === "CART_FULL" || error.errorCode === "CART_ITEM_NOT_FOUND")
    ? error.errorCode
    : "OFFLINE";
}

function identityOf(article: ArticleIdentityDto): ArticleIdentityDto {
  return { brandId: article.brandId, articleNumber: article.articleNumber };
}

/**
 * The catalog fields a cart line is made of, and only those. Add-to-cart is
 * called with whatever object the calling surface already has — on the detail
 * page that is the full article DTO — and structural typing lets the extra
 * fields through unnoticed.
 */
function onlyCartFields(article: CartLineArticle): CartLineArticle {
  return {
    brandId: article.brandId,
    articleNumber: article.articleNumber,
    brandName: article.brandName,
    brandLogoUrl: article.brandLogoUrl,
    description: article.description,
    thumbnailUrl: article.thumbnailUrl,
  };
}

/** The wire line without `addedAt`, which nothing on a cart surface renders. */
function toCartLine(line: CartLineDto): CartLine {
  return {
    brandId: line.brandId,
    articleNumber: line.articleNumber,
    brandName: line.brandName,
    brandLogoUrl: line.brandLogoUrl,
    description: line.description,
    thumbnailUrl: line.thumbnailUrl,
    quantity: line.quantity,
    isSelected: line.isSelected,
    addedAtPriceIncVat: line.addedAtPriceIncVat,
  };
}

/**
 * Shared so the pre-hydration read is one stable array rather than a fresh `[]`
 * per render, which would re-run every memo downstream of it.
 */
const NO_LINES: CartLine[] = [];

/**
 * The cart's lines, as a surface may read them: empty until hydration
 * completes, the mirrored lines after.
 *
 * `persist` rehydrates from `localStorage` while the module loads, so a
 * component subscribing to the store directly would render stored lines on its
 * first client pass against server HTML that could only ever be empty. Every
 * cart surface reads through here, and one that distinguishes "empty cart" from
 * "not read yet" asks `useCartStatus()`.
 */
export function useCartLines(): CartLine[] {
  const isHydrated = useIsHydrated();
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
  const isHydrated = useIsHydrated();
  const hasRoom = useCart((state) => hasRoomFor(state.lines, article));

  return !isHydrated || hasRoom;
}

/** Whether the cart holds as many lines as it may — see {@link MAX_CART_LINES}. */
export function useIsCartFull(): boolean {
  return useCartLines().length >= MAX_CART_LINES;
}
