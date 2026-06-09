"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { VehicleSelector } from "@/components/catalog/vehicle-selector";
import { useVehicleContext } from "@/hooks/use-vehicle-context";

export default function VehiclesPage() {
  const [open, setOpen] = useState(true);
  const router = useRouter();
  const { selectedVehicle } = useVehicleContext();
  const initialVehicleId = useRef(selectedVehicle?.vehicleId ?? null);

  useEffect(() => {
    if (selectedVehicle && selectedVehicle.vehicleId !== initialVehicleId.current) {
      router.push("/");
    }
  }, [selectedVehicle, router]);

  function handleClose() {
    setOpen(false);
    router.back();
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <VehicleSelector isOpen={open} onClose={handleClose} />
    </div>
  );
}
