import { useVehicleSelector } from "./use-vehicle-selector";
import { VehicleSelectorHeader } from "./header";
import { VehicleSelectorStepTabs } from "./step-tabs";
import { VehicleSelectionList } from "./selection-list";
import { VehiclePreviewSidebar } from "./preview-sidebar";
import { VehicleSelectorFooter } from "./footer";

interface VehicleSelectorContentProps {
  onClose: () => void;
}

export function VehicleSelectorContent({ onClose }: VehicleSelectorContentProps) {
  const selector = useVehicleSelector(onClose);

  return (
    <div
      className="bg-bg-card rounded-[16px] w-full max-w-5xl max-h-[90vh] flex flex-col shadow-[0_16px_40px_rgba(11,18,32,0.14)]"
      role="dialog"
      aria-modal="true"
      aria-label="Избор на автомобил"
    >
      <VehicleSelectorHeader onClose={selector.handleClose} />
      <VehicleSelectorStepTabs
        step={selector.step}
        stepValues={selector.stepValues}
        onStepClick={selector.handleStepClick}
      />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <VehicleSelectionList
          step={selector.step}
          search={selector.search}
          onSearchChange={selector.setSearch}
          isLoading={selector.isCurrentStepLoading}
          filteredManufacturers={selector.filteredManufacturers}
          filteredSeries={selector.filteredSeries}
          filteredVariants={selector.filteredVariants}
          pendingVariantId={selector.pendingVariant?.vehicleId}
          onSelectMake={selector.handleSelectMake}
          onSelectSeries={selector.handleSelectSeries}
          onSelectVariant={selector.handleSelectVariant}
        />
        <VehiclePreviewSidebar
          selectedMake={selector.selectedMake}
          selectedSeries={selector.selectedSeries}
          pendingVariant={selector.pendingVariant}
        />
      </div>
      <VehicleSelectorFooter
        pendingVariant={selector.pendingVariant}
        onClose={selector.handleClose}
        onConfirm={selector.handleConfirm}
      />
    </div>
  );
}
