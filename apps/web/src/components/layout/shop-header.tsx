"use client";

import { useState } from "react";
import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { SiteLogo } from "./site-logo";
import { MainNav } from "./main-nav";
import { HeaderSearch } from "./header-search";
import { VehiclePill } from "./vehicle-pill";
import { VehicleSelector } from "@/components/catalog/vehicle-selector";

export function ShopHeader() {
  const [vehicleSelectorOpen, setVehicleSelectorOpen] = useState(false);

  return (
    <>
      <header className="bg-bg-card border-b border-line sticky top-0 z-40">
        {/* Wraps rather than scrolls: the search box needs the whole width to
            be usable, and below `md` there is not enough of it left over once
            the brand and the account actions have taken theirs. */}
        <div className="page-container py-3 flex flex-wrap items-center gap-x-4 gap-y-2.5">
          <SiteLogo />

          <MainNav />

          <HeaderSearch />

          <div className="ml-auto flex items-center gap-2 flex-shrink-0 md:ml-0">
            <VehiclePill onOpenSelector={() => setVehicleSelectorOpen(true)} />

            <Link
              href="/account"
              className="p-2 rounded-lg hover:bg-bg-sunken transition-colors"
              aria-label="Акаунт"
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

            <Link
              href="/cart"
              className="p-2 rounded-lg hover:bg-bg-sunken transition-colors"
              aria-label="Кошница"
            >
              <ShoppingCart className="w-5 h-5 text-ink" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </header>

      <VehicleSelector
        isOpen={vehicleSelectorOpen}
        onClose={() => setVehicleSelectorOpen(false)}
      />
    </>
  );
}
