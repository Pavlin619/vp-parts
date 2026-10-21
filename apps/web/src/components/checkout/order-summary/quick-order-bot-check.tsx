"use client";

import { useEffect, useRef } from "react";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { TriangleAlert } from "lucide-react";
import { useQuickOrder } from "@/hooks/use-quick-order";
import { BotCheckChallenge } from "@/lib/security/bot-check-challenge";
import { TURNSTILE_SITE_KEY } from "@/lib/security/turnstile";

/** Long enough for a visitor Cloudflare asks to tick its box. */
const CHALLENGE_TIMEOUT_MS = 120_000;

/**
 * Cloudflare's check that a quick order comes from a person, run when the order
 * is placed rather than when the form opens. It draws nothing unless Cloudflare
 * needs the visitor to tick a box, which then shows beside the button. One it
 * cannot vouch for gets no puzzle, so the account is offered instead.
 * See docs/ORDERS.md → "Quick order".
 */
export function QuickOrderBotCheck() {
  const hasFailed = useQuickOrder((state) => state.botCheck.hasFailed);
  const widget = useRef<TurnstileInstance | null>(null);
  const challenge = useRef<BotCheckChallenge | null>(null);

  useEffect(() => () => useQuickOrder.getState().setBotCheckSolver(null), []);

  const register = () => {
    const loaded = new BotCheckChallenge(
      { execute: () => widget.current?.execute(), reset: () => widget.current?.reset() },
      CHALLENGE_TIMEOUT_MS,
    );
    challenge.current = loaded;
    useQuickOrder.getState().setBotCheckSolver(() => loaded.solve());
  };

  const fail = () => {
    challenge.current?.fail();
    useQuickOrder.getState().failBotCheck();
  };

  return (
    <div>
      <Turnstile
        ref={widget}
        siteKey={TURNSTILE_SITE_KEY}
        options={{
          execution: "execute",
          appearance: "interaction-only",
          language: "bg",
          size: "flexible",
          theme: "light",
        }}
        scriptOptions={{ onError: fail }}
        onWidgetLoad={register}
        onSuccess={(token) => challenge.current?.pass(token)}
        onError={fail}
        onUnsupported={fail}
        onTimeout={fail}
      />

      {hasFailed && (
        <p
          role="alert"
          className="mt-2 flex items-start gap-[7px] rounded-[10px] bg-bg-sunken px-3 py-2.5 text-[12px] leading-[1.45] text-danger"
        >
          <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            Не успяхме да потвърдим, че поръчката не е от робот. Опитайте отново или поръчайте с
            вход в профила си.
          </span>
        </p>
      )}
    </div>
  );
}
