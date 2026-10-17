import Link from "next/link";
import { Check, Mail } from "lucide-react";
import type { OrderDetailDto } from "@vp-parts-shop/shared";
import { buttonVariants } from "@/components/ui/button";
import { formatShopDateTime } from "@/lib/delivery/format";
import { cn } from "@/lib/utils";
import { OrderReferenceChip } from "./order-reference-chip";

// The theme maps shadcn's `muted` to an ink tone, so the outline variant's hover is overridden.
const GHOST_BUTTON_CLASS =
  "h-10 rounded-md border-line-2 bg-transparent px-4 text-ink hover:border-ink-3 hover:bg-bg-card hover:text-ink max-sm:w-full";

type HeroOrder = Pick<OrderDetailDto, "orderReference" | "createdAt" | "contact">;

/** The page's answer to "did it go through?": the thanks, the reference and where the email goes. */
export function OrderConfirmationHero({ order }: { order: HeroOrder }) {
  return (
    <section className="flex flex-col gap-3.5 rounded-[12px] border border-line bg-bg-card p-5 sm:flex-row sm:items-start sm:gap-[18px] sm:px-6 sm:py-[26px]">
      <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-ok-soft text-ok animate-in fade-in zoom-in-50 duration-[380ms] motion-reduce:animate-none">
        <Check className="h-7 w-7" aria-hidden="true" />
      </span>

      <div className="min-w-0 flex-1">
        <h1 className="text-pretty font-display text-[23px] font-semibold leading-[1.15] tracking-[-0.02em] text-ink sm:text-[28px]">
          Благодарим, {order.contact.firstName}! Поръчката е приета.
        </h1>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-ink-3">
          <OrderReferenceChip reference={order.orderReference} />
          <span>{formatShopDateTime(order.createdAt)}</span>
        </div>

        <p className="mt-4 flex items-start gap-[9px] rounded-[10px] bg-bg-sunken px-[13px] py-[11px] text-[12.5px] leading-normal text-ink-2">
          <Mail className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" aria-hidden="true" />
          <span>
            Потвърждението изпращаме на{" "}
            <b className="font-semibold text-ink">{order.contact.email}</b>.
          </span>
        </p>

        <div className="mt-[18px] flex flex-wrap gap-2">
          <Link
            href="/"
            className={cn(buttonVariants({ variant: "outline", size: "lg" }), GHOST_BUTTON_CLASS)}
          >
            Продължете пазаруването
          </Link>
        </div>
      </div>
    </section>
  );
}
