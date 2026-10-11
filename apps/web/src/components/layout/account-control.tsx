"use client";

import Link from "next/link";
import { UserButton, useAuth } from "@clerk/nextjs";

export function AccountControl() {
  const { isSignedIn } = useAuth();

  if (isSignedIn) {
    return (
      <div className="flex p-1.5">
        <UserButton />
      </div>
    );
  }

  return (
    <Link
      href="/sign-in"
      className="p-2 rounded-lg hover:bg-bg-sunken transition-colors"
      aria-label="Вход"
    >
      <svg
        className="w-5 h-5 text-ink"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
        />
      </svg>
    </Link>
  );
}
