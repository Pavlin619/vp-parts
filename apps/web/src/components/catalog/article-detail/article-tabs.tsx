"use client";

import { Tabs } from "@base-ui/react/tabs";
import type { CompatibleVehicleDto } from "@vp-parts-shop/shared";
import { cn } from "@/lib/utils";

type TabId = "description" | "compatibility" | "documents";

interface ArticleTabsProps {
  /** Falls back to placeholder copy until a real description field exists. */
  description?: string;
  compatibleVehicles: CompatibleVehicleDto[];
}

// TODO(design-placeholder): description copy and documents are not part of
// ArticleDetailDto. Static content is used to match the design — wire to real
// data or remove these tabs once decided.
const PLACEHOLDER_DESCRIPTION =
  "Подробно описание на продукта все още не е налично. Тук ще се показват " +
  "характеристиките, предназначението и предимствата на частта.";

// TODO(reviews): a dedicated "Отзиви" tab was removed for launch — there is no
// review data yet. Reintroduce it here once a reviews feature exists.

const TAB_TRIGGER_CLASS = cn(
  "-mb-px cursor-pointer border-b-2 border-transparent pb-3 text-sm font-medium",
  "text-muted transition-colors outline-none hover:text-ink",
  "focus-visible:text-ink data-[active]:border-ink data-[active]:text-ink",
);

export function ArticleTabs({
  description,
  compatibleVehicles,
}: ArticleTabsProps) {
  const tabs: { id: TabId; label: string }[] = [
    { id: "description", label: "Описание" },
    { id: "compatibility", label: `Съвместимост (${compatibleVehicles.length})` },
    { id: "documents", label: "Документи" },
  ];

  return (
    <Tabs.Root
      defaultValue="description"
      render={<section aria-label="Допълнителна информация" />}
    >
      <Tabs.List className="flex gap-6 border-b border-line">
        {tabs.map((tab) => (
          <Tabs.Tab key={tab.id} value={tab.id} className={TAB_TRIGGER_CLASS}>
            {tab.label}
          </Tabs.Tab>
        ))}
      </Tabs.List>

      <Tabs.Panel value="description" className="pt-6">
        {/* TODO(design-placeholder): static description copy. */}
        <p className="max-w-prose text-sm leading-relaxed text-ink-2">
          {description ?? PLACEHOLDER_DESCRIPTION}
        </p>
      </Tabs.Panel>

      <Tabs.Panel value="compatibility" className="pt-6">
        <CompatibilityPanel vehicles={compatibleVehicles} />
      </Tabs.Panel>

      <Tabs.Panel value="documents" className="pt-6">
        {/* TODO(design-placeholder): document list is not implemented yet. */}
        <p className="text-sm text-muted">
          Няма налични документи за този продукт.
        </p>
      </Tabs.Panel>
    </Tabs.Root>
  );
}

function CompatibilityPanel({ vehicles }: { vehicles: CompatibleVehicleDto[] }) {
  if (vehicles.length === 0) {
    return (
      <p className="text-sm text-muted">
        Няма данни за съвместими автомобили.
      </p>
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {vehicles.map((vehicle) => (
        <li
          key={vehicle.vehicleId}
          className="rounded-md border border-line px-4 py-2 text-sm text-ink"
        >
          {vehicle.name}
        </li>
      ))}
    </ul>
  );
}
