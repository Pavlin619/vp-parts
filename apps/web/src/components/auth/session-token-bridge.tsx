"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect } from "react";
import { registerSession } from "@/lib/api/session-token";

/**
 * Hands Clerk's session to the API client, which runs outside React and so
 * cannot call `useAuth()` itself. Renders nothing.
 */
export function SessionTokenBridge() {
  const { isLoaded, isSignedIn, getToken } = useAuth();

  useEffect(() => {
    if (isLoaded) {
      registerSession({ isSignedIn: Boolean(isSignedIn), getToken: () => getToken() });
    }
  }, [isLoaded, isSignedIn, getToken]);

  return null;
}
