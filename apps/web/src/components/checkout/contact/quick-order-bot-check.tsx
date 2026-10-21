"use client";

import { Turnstile } from "@marsidev/react-turnstile";
import { TriangleAlert } from "lucide-react";
import { useQuickOrder } from "@/hooks/use-quick-order";
import { TURNSTILE_SITE_KEY } from "@/lib/security/turnstile";

/**
 * Cloudflare's check that a quick order comes from a person. Most visitors pass
 * it unseen; one it cannot vouch for gets no puzzle to fall back on, so the
 * account is offered instead. See docs/ORDERS.md → "Quick order".
 */
export function QuickOrderBotCheck() {
  const round = useQuickOrder((state) => state.botCheck.round);
  const hasFailed = useQuickOrder((state) => state.botCheck.hasFailed);
  const solve = useQuickOrder((state) => state.solveBotCheck);
  const expire = useQuickOrder((state) => state.expireBotCheck);
  const fail = useQuickOrder((state) => state.failBotCheck);

  return (
    <div className="mt-3.5">
      <Turnstile
        key={round}
        siteKey={TURNSTILE_SITE_KEY}
        options={{ language: "bg", size: "flexible", theme: "light" }}
        scriptOptions={{ onError: fail }}
        onSuccess={solve}
        onExpire={expire}
        onError={fail}
        onUnsupported={fail}
      />

      {hasFailed && (
        <p
          role="alert"
          className="mt-2 flex items-start gap-[7px] rounded-[10px] bg-bg-sunken px-3 py-2.5 text-[12px] leading-[1.45] text-danger"
        >
          <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            Не успяхме да потвърдим, че поръчката не е от робот. Опреснете страницата или
            поръчайте с вход в профила си.
          </span>
        </p>
      )}
    </div>
  );
}
