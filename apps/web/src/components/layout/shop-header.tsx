"use client";

import { useState } from "react";
import { SiteLogo } from "./site-logo";
import { MainNav } from "./main-nav";
import { HeaderSearch } from "./header-search";
import { VehiclePill } from "./vehicle-pill";
import { CartLink } from "./cart-link";
import { AccountControl } from "./account-control";
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

            <AccountControl />

            <CartLink />
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
