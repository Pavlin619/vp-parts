"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { PRIMARY_ACTION_CLASS } from "@/components/checkout/delivery/address/address-action-buttons";
import { TextField } from "@/components/common/text-field";
import { cn } from "@/lib/utils";

export const RESEND_COOLDOWN_SECONDS = 30;

const CODE_LENGTH = 6;
const TEXT_ACTION_CLASS =
  "text-[12.5px] font-semibold text-ink underline-offset-2 hover:underline disabled:text-ink-4 disabled:no-underline";

interface EmailCodeStepProps {
  email: string;
  /** Resolves to the message to show, or null once the account is signed in. */
  onVerify: (code: string) => Promise<string | null>;
  /** Resolves to the message to show, or null once a new code is on its way. */
  onResend: () => Promise<string | null>;
  onChangeEmail: () => void;
  className?: string;
}

type Feedback = { kind: "error" | "notice"; text: string };

export function EmailCodeStep({
  email,
  onVerify,
  onResend,
  onChangeEmail,
  className,
}: EmailCodeStepProps) {
  const [code, setCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const resendCooldown = useResendCooldown();

  const verify = async (event: FormEvent) => {
    event.preventDefault();

    setIsVerifying(true);
    setFeedback(null);
    const refusal = await onVerify(code);

    if (refusal) {
      setIsVerifying(false);
      setFeedback({ kind: "error", text: refusal });
    }
  };

  const resend = async () => {
    setIsResending(true);
    setFeedback(null);
    const refusal = await onResend();
    setIsResending(false);

    if (refusal) {
      setFeedback({ kind: "error", text: refusal });
      return;
    }

    resendCooldown.restart();
    setFeedback({ kind: "notice", text: "Изпратихме нов код." });
  };

  return (
    <form
      aria-label="Потвърждение на имейла"
      noValidate
      onSubmit={verify}
      className={cn("flex flex-col gap-3", className)}
    >
      <p className="text-[13px] text-ink-2">
        Изпратихме {CODE_LENGTH}-цифрен код на <span className="font-semibold">{email}</span>.
        Въведете го, за да потвърдите имейла.
      </p>

      <TextField
        label="Код от имейла"
        inputMode="numeric"
        autoComplete="one-time-code"
        value={code}
        onValueChange={(value) => setCode(value.replace(/\D/g, "").slice(0, CODE_LENGTH))}
      />

      {feedback && (
        <p
          role={feedback.kind === "error" ? "alert" : "status"}
          className={cn(
            "text-[12.5px]",
            feedback.kind === "error" ? "text-danger" : "text-ink-3",
          )}
        >
          {feedback.text}
        </p>
      )}

      <Button
        type="submit"
        disabled={code.length < CODE_LENGTH || isVerifying}
        className={PRIMARY_ACTION_CLASS}
      >
        {isVerifying ? "Проверяваме…" : "Потвърди"}
      </Button>

      <div className="flex justify-between gap-3">
        <button
          type="button"
          onClick={resend}
          disabled={resendCooldown.secondsLeft > 0 || isResending}
          className={TEXT_ACTION_CLASS}
        >
          {resendCooldown.secondsLeft > 0
            ? `Изпрати нов код след ${resendCooldown.secondsLeft} с`
            : "Изпрати нов код"}
        </button>
        <button type="button" onClick={onChangeEmail} className={TEXT_ACTION_CLASS}>
          Промени имейла
        </button>
      </div>
    </form>
  );
}

function useResendCooldown() {
  const [availableAt, setAvailableAt] = useState(() => cooldownEnd());
  const [now, setNow] = useState(() => Date.now());
  const isCoolingDown = now < availableAt;

  useEffect(() => {
    if (!isCoolingDown) return;

    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isCoolingDown]);

  return {
    secondsLeft: Math.max(0, Math.ceil((availableAt - now) / 1000)),
    restart: () => {
      setAvailableAt(cooldownEnd());
      setNow(Date.now());
    },
  };
}

function cooldownEnd(): number {
  return Date.now() + RESEND_COOLDOWN_SECONDS * 1000;
}
