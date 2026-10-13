"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { HandleSSOCallback } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { sameOriginPath, withRedirectUrl } from "@/lib/auth/redirect-target";

const WAY_OUT_DELAY_MS = 6000;

interface SignUpSsoCallbackProps {
  /** Where the sign-up started, as `redirect_url` carried it. */
  redirectUrl?: string;
}

/**
 * Finishes `GoogleSignUpButton`'s sign-up; an existing Google account is signed
 * in instead. The session sync files the customer once the session is live.
 */
export function SignUpSsoCallback({ redirectUrl }: SignUpSsoCallbackProps) {
  const router = useRouter();
  const isStuck = useHasElapsed(WAY_OUT_DELAY_MS);

  return (
    <div className="flex flex-col items-center gap-3">
      <p role="status" className="text-[14px] text-ink-3">
        Влизаме с Google…
      </p>
      <HandleSSOCallback
        navigateToApp={({ decorateUrl }) => {
          const destination = decorateUrl(sameOriginPath(redirectUrl, window.location.origin));

          if (destination.startsWith("http")) {
            window.location.href = destination;
            return;
          }

          router.replace(destination);
        }}
        navigateToSignIn={() => router.replace(withRedirectUrl("/sign-in", redirectUrl))}
        navigateToSignUp={() => router.replace(withRedirectUrl("/sign-up", redirectUrl))}
      />

      {/* HandleSSOCallback does nothing for a flow it cannot place, such as one cancelled at Google. */}
      {isStuck && (
        <Link
          href={withRedirectUrl("/sign-up", redirectUrl)}
          className="text-[13px] font-semibold text-ink underline-offset-2 hover:underline"
        >
          Обратно към регистрацията
        </Link>
      )}
    </div>
  );
}

function useHasElapsed(delayMs: number): boolean {
  const [hasElapsed, setHasElapsed] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setHasElapsed(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs]);

  return hasElapsed;
}
