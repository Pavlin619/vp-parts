import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

/** The cart with nothing in it — and the one way out of that. */
export function CartEmpty() {
  return (
    <div className="rounded-[12px] border border-line bg-bg-card px-6 py-[72px] text-center">
      <span
        className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-bg-sunken text-ink-3"
        aria-hidden="true"
      >
        <ShoppingCart className="h-6 w-6" />
      </span>

      <p className="mb-1.5 text-base font-semibold text-ink">
        Кошницата е празна
      </p>
      <p className="mb-5 text-[13px] text-ink-3">
        Добави части, за да продължиш към поръчка
      </p>

      <Link href="/catalog" className={buttonVariants({ size: "lg" })}>
        Към каталога
      </Link>
    </div>
  );
}
