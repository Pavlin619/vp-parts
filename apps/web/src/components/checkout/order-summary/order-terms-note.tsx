import Link from "next/link";
import { LEGAL_PAGES } from "@/lib/legal/legal-pages";

const LINK_CLASSES = "font-medium text-ink-2 underline underline-offset-2 hover:text-ink";

/** What placing the order agrees to, under the button that places it. */
export function OrderTermsNote() {
  return (
    <p className="mt-2.5 text-[11.5px] leading-[1.45] text-ink-3">
      С поръчката приемате{" "}
      <Link href={LEGAL_PAGES.terms} className={LINK_CLASSES}>
        Общите условия
      </Link>
      . Вижте{" "}
      <Link href={LEGAL_PAGES.withdrawal} className={LINK_CLASSES}>
        правото на отказ
      </Link>{" "}
      и{" "}
      <Link href={LEGAL_PAGES.privacy} className={LINK_CLASSES}>
        политиката за поверителност
      </Link>
      .
    </p>
  );
}
