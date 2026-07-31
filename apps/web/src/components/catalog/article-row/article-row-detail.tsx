"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { TechnicalSpecDto } from "@vp-parts-shop/shared";
import { cn } from "@/lib/utils";
import { OemNumberChip } from "./oem-number-chip";

type DetailSectionId = "specs" | "oem";

interface ArticleRowDetailProps {
  technicalSpecs: TechnicalSpecDto[];
  oemNumbers: string[];
}

const SECTION_LABEL: Record<DetailSectionId, string> = {
  specs: "Технически характеристики",
  oem: "OE номера",
};

/**
 * The expanded body of a catalog row — an accordion over the metadata the
 * catalog response already carries, so opening a row costs no extra request.
 * Sections with no data are not offered at all.
 */
export function ArticleRowDetail({
  technicalSpecs,
  oemNumbers,
}: ArticleRowDetailProps) {
  const sections = availableSections(technicalSpecs, oemNumbers);
  const [openSection, setOpenSection] = useState<DetailSectionId | null>(
    sections[0] ?? null,
  );

  const toggle = (section: DetailSectionId) =>
    setOpenSection((current) => (current === section ? null : section));

  return (
    <div className="border-t border-line bg-bg-card">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-line px-6 py-2.5">
        {sections.map((section) => (
          <button
            key={section}
            type="button"
            onClick={() => toggle(section)}
            aria-expanded={openSection === section}
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-[12.5px] font-semibold text-ink-3 transition-colors hover:bg-bg-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
              openSection === section && "bg-bg-sunken text-ink",
            )}
          >
            {SECTION_LABEL[section]}
            <ChevronRight
              className={cn(
                "h-3 w-3 text-ink-4 transition-transform",
                openSection === section && "rotate-90 text-accent",
              )}
              aria-hidden="true"
            />
          </button>
        ))}
      </div>

      {openSection && (
        <div className="px-6 pb-[22px] pt-[18px]">
          {openSection === "specs" && (
            <TechnicalSpecTable technicalSpecs={technicalSpecs} />
          )}
          {openSection === "oem" && <OemNumberGrid oemNumbers={oemNumbers} />}
        </div>
      )}
    </div>
  );
}

function TechnicalSpecTable({
  technicalSpecs,
}: {
  technicalSpecs: TechnicalSpecDto[];
}) {
  return (
    <table className="w-full max-w-[520px] border-collapse text-[13px]">
      <tbody>
        {/* The label is not a unique identity — TecDoc repeats it whenever a part
            carries several values for one criterion, notes especially. */}
        {technicalSpecs.map((spec, index) => (
          <tr
            key={`${spec.key}-${index}`}
            className="border-b border-line last:border-b-0"
          >
            <th
              scope="row"
              className="w-2/5 py-2 text-left font-normal text-ink-3"
            >
              {spec.key}
            </th>
            <td className="py-2 font-display font-medium text-ink">
              {spec.value}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function OemNumberGrid({ oemNumbers }: { oemNumbers: string[] }) {
  return (
    <div className="flex flex-wrap gap-[7px]">
      {oemNumbers.map((code, index) => (
        <OemNumberChip key={`${code}-${index}`} code={code} />
      ))}
    </div>
  );
}

/** The sections that actually have data, in display order. */
function availableSections(
  technicalSpecs: TechnicalSpecDto[],
  oemNumbers: string[],
): DetailSectionId[] {
  const sections: DetailSectionId[] = [];

  if (technicalSpecs.length > 0) {
    sections.push("specs");
  }
  if (oemNumbers.length > 0) {
    sections.push("oem");
  }

  return sections;
}
