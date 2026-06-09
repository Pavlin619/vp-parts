"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { VehicleSelector } from "@/components/catalog/vehicle-selector";

export default function VehiclesPage() {
  const [open, setOpen] = useState(true);
  const router = useRouter();

  function handleClose() {
    setOpen(false);
    router.back();
  }

  function handleConfirm() {
    setOpen(false);
    router.push("/");
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <VehicleSelector isOpen={open} onClose={handleClose} onConfirm={handleConfirm} />
    </div>
  );
}
