import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ManufacturerDto, ModelSeriesDto, VehicleVariantDto } from "@vp-parts-shop/shared";
import {
  manufacturersQueryOptions,
  modelSeriesQueryOptions,
  variantsQueryOptions,
} from "@/lib/api/catalog";
import { useVehicleContext, type SelectedVehicle } from "@/hooks/use-vehicle-context";

export type Step = 0 | 1 | 2;

export const STEP_LABELS = ["Марка", "Модел", "Двигател"] as const;

export const STEP_PLACEHOLDERS: Record<Step, string> = {
  0: "Търси марка...",
  1: "Търси модел...",
  2: "Търси двигател или код...",
};

export interface VehicleSelectorState {
  step: Step;
  search: string;
  setSearch: (s: string) => void;
  selectedMake: ManufacturerDto | null;
  selectedSeries: ModelSeriesDto | null;
  pendingVariant: VehicleVariantDto | null;
  isCurrentStepLoading: boolean;
  filteredManufacturers: ManufacturerDto[];
  filteredSeries: ModelSeriesDto[];
  filteredVariants: VehicleVariantDto[];
  stepValues: (string | null)[];
  handleSelectMake: (make: ManufacturerDto) => void;
  handleSelectSeries: (series: ModelSeriesDto) => void;
  handleSelectVariant: (variant: VehicleVariantDto) => void;
  handleConfirm: () => void;
  handleClose: () => void;
  handleStepClick: (targetStep: Step) => void;
}

// This hook is intended to be used inside a component that is remounted each time the
// modal opens (via a key prop in VehicleSelector). That is why lazy state initializers
// can safely read storedVehicle once at mount time — no synchronous effects needed.
export function useVehicleSelector(onClose: () => void, onConfirm?: () => void): VehicleSelectorState {
  const { setVehicle, selectedVehicle: storedVehicle } = useVehicleContext();

  const [step, setStep] = useState<Step>(() =>
    storedVehicle?.manufacturerId && storedVehicle?.seriesId ? 2 : 0,
  );
  const [search, setSearch] = useState("");
  const [selectedMake, setSelectedMake] = useState<ManufacturerDto | null>(() =>
    storedVehicle?.manufacturerId
      ? { id: storedVehicle.manufacturerId, name: storedVehicle.manufacturerName }
      : null,
  );
  const [selectedSeries, setSelectedSeries] = useState<ModelSeriesDto | null>(() =>
    storedVehicle?.seriesId
      ? {
          id: storedVehicle.seriesId,
          manufacturerId: storedVehicle.manufacturerId,
          name: storedVehicle.seriesName,
        }
      : null,
  );
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);

  const { data: manufacturers = [], isPending: isManufacturersPending } = useQuery(
    manufacturersQueryOptions,
  );

  const { data: seriesList = [], isPending: isSeriesPending } = useQuery({
    ...modelSeriesQueryOptions(selectedMake?.id ?? ""),
    enabled: !!selectedMake?.id,
  });

  const { data: variants = [], isPending: isVariantsPending } = useQuery({
    ...variantsQueryOptions(selectedSeries?.id ?? ""),
    enabled: !!selectedSeries?.id,
  });

  // Derive pending variant: explicit user pick takes priority, then fall back to the
  // stored vehicle so the previously-selected engine is auto-highlighted on reopen.
  const pendingVariant = useMemo(() => {
    if (selectedVariantId) {
      return variants.find((v) => v.vehicleId === selectedVariantId) ?? null;
    }
    if (storedVehicle && selectedSeries?.id === storedVehicle.seriesId) {
      return variants.find((v) => v.vehicleId === storedVehicle.vehicleId) ?? null;
    }
    return null;
  }, [selectedVariantId, variants, storedVehicle, selectedSeries?.id]);

  const isCurrentStepLoading =
    (step === 0 && isManufacturersPending) ||
    (step === 1 && isSeriesPending) ||
    (step === 2 && isVariantsPending);

  const lowerSearch = search.toLowerCase();
  const filteredManufacturers = manufacturers.filter((m) =>
    m.name.toLowerCase().includes(lowerSearch),
  );
  const filteredSeries = seriesList.filter((s) => s.name.toLowerCase().includes(lowerSearch));
  const filteredVariants = variants.filter((v) => v.name.toLowerCase().includes(lowerSearch));

  const stepValues: (string | null)[] = [
    selectedMake?.name ?? null,
    selectedSeries?.name ?? null,
    pendingVariant?.engine ?? null,
  ];

  function handleSelectMake(make: ManufacturerDto) {
    setSelectedMake(make);
    setSelectedSeries(null);
    setSelectedVariantId(null);
    setSearch("");
    setStep(1);
  }

  function handleSelectSeries(series: ModelSeriesDto) {
    setSelectedSeries(series);
    setSelectedVariantId(null);
    setSearch("");
    setStep(2);
  }

  function handleSelectVariant(variant: VehicleVariantDto) {
    setSelectedVariantId(variant.vehicleId);
  }

  function handleClose() {
    onClose();
  }

  function handleConfirm() {
    if (!selectedMake || !selectedSeries || !pendingVariant) return;
    const vehicle: SelectedVehicle = {
      vehicleId: pendingVariant.vehicleId,
      manufacturerId: selectedMake.id,
      seriesId: selectedSeries.id,
      manufacturerName: selectedMake.name,
      seriesName: selectedSeries.name,
      variantName: pendingVariant.name,
      engine: pendingVariant.engine,
      powerKw: pendingVariant.powerKw,
      yearFrom: pendingVariant.yearFrom,
      yearTo: pendingVariant.yearTo,
    };
    setVehicle(vehicle);
    if (onConfirm) {
      onConfirm();
    } else {
      onClose();
    }
  }

  function handleStepClick(targetStep: Step) {
    if (targetStep >= step) return;
    setStep(targetStep);
    setSearch("");
    if (targetStep < 2) setSelectedVariantId(null);
    if (targetStep < 1) setSelectedSeries(null);
  }

  return {
    step,
    search,
    setSearch,
    selectedMake,
    selectedSeries,
    pendingVariant,
    isCurrentStepLoading,
    filteredManufacturers,
    filteredSeries,
    filteredVariants,
    stepValues,
    handleSelectMake,
    handleSelectSeries,
    handleSelectVariant,
    handleConfirm,
    handleClose,
    handleStepClick,
  };
}
