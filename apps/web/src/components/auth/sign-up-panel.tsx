"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { sameOriginPath } from "@/lib/auth/redirect-target";
import { RegistrationForm } from "./registration-form";

interface SignUpPanelProps {
  /** Clerk's `redirect_url`, as the query string carried it. */
  redirectUrl?: string;
}

export function SignUpPanel({ redirectUrl }: SignUpPanelProps) {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const [isSigningUp, setIsSigningUp] = useState(false);
  const isAlreadySignedIn = isSignedIn && !isSigningUp;

  const continueOn = useCallback(
    () => router.replace(sameOriginPath(redirectUrl, window.location.origin)),
    [router, redirectUrl],
  );

  useEffect(() => {
    if (isLoaded && isAlreadySignedIn) continueOn();
  }, [isLoaded, isAlreadySignedIn, continueOn]);

  if (isAlreadySignedIn) {
    return null;
  }

  const signInHref = redirectUrl
    ? `/sign-in?redirect_url=${encodeURIComponent(redirectUrl)}`
    : "/sign-in";

  return (
    <div className="w-full max-w-[480px] rounded-[12px] border border-line bg-bg-card p-5 sm:p-6">
      <h1 className="text-[20px] font-semibold text-ink">Регистрация</h1>
      <p className="mb-4 mt-1 text-[13px] text-ink-3">
        Създайте профил и следете поръчките си.
      </p>

      <RegistrationForm onComplete={continueOn} onSignUpStart={() => setIsSigningUp(true)} />

      <p className="mt-4 text-center text-[13px] text-ink-3">
        Вече имате профил?{" "}
        <Link href={signInHref} className="font-semibold text-ink underline-offset-2 hover:underline">
          Вход
        </Link>
      </p>
    </div>
  );
}
