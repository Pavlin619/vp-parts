"use client";

import { useEffect, useState } from "react";
import { useSignUp } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { SECONDARY_ACTION_CLASS } from "@/components/checkout/delivery/address/address-action-buttons";
import { describeSignUpError } from "@/lib/auth/clerk-errors";
import { sameOriginPath, withRedirectUrl } from "@/lib/auth/redirect-target";
import { GoogleLogo } from "./google-logo";

const SSO_CALLBACK_PATH = "/sign-up/sso-callback";

interface GoogleSignUpButtonProps {
  /** Where to land once signed up, as `redirect_url` carried it. */
  redirectUrl?: string;
}

/** Leaves for Google; `SignUpSsoCallback` finishes the sign-up on the way back. See docs/AUTH.md. */
export function GoogleSignUpButton({ redirectUrl }: GoogleSignUpButtonProps) {
  const { signUp } = useSignUp();
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  // Back from Google can restore this page from the back-forward cache, still disabled.
  useEffect(() => {
    const enableOnRestoreFromCache = (event: PageTransitionEvent) => {
      if (event.persisted) setIsRedirecting(false);
    };

    window.addEventListener("pageshow", enableOnRestoreFromCache);
    return () => window.removeEventListener("pageshow", enableOnRestoreFromCache);
  }, []);

  const signUpWithGoogle = async () => {
    const destination = sameOriginPath(redirectUrl, window.location.origin);

    setIsRedirecting(true);
    setFailure(null);

    const { error } = await signUp.sso({
      strategy: "oauth_google",
      redirectUrl: destination,
      redirectCallbackUrl: withRedirectUrl(SSO_CALLBACK_PATH, destination),
    });

    if (error) {
      setFailure(describeSignUpError(error).message);
      setIsRedirecting(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        disabled={isRedirecting}
        onClick={() => void signUpWithGoogle()}
        className={SECONDARY_ACTION_CLASS}
      >
        <GoogleLogo />
        Регистрация с Google
      </Button>

      {failure && (
        <p role="alert" className="text-[12.5px] text-danger">
          {failure}
        </p>
      )}
    </div>
  );
}
