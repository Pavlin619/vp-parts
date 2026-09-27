import { ChevronDown } from "lucide-react";

const ALL_REGIONS = "";

interface RegionSelectProps {
  regions: string[];
  region: string | null;
  onChange: (region: string | null) => void;
}

export function RegionSelect({ regions, region, onChange }: RegionSelectProps) {
  return (
    <div className="relative">
      <select
        aria-label="Област"
        value={region ?? ALL_REGIONS}
        onChange={(event) => onChange(event.target.value || null)}
        className="h-[42px] w-full appearance-none rounded-lg border border-line bg-bg-card pl-3 pr-8 text-[13.5px] text-ink focus:border-ink focus:outline-none"
      >
        <option value={ALL_REGIONS}>Всички области</option>
        {regions.map((each) => (
          <option key={each} value={each}>
            {each}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3"
        aria-hidden="true"
      />
    </div>
  );
}
