"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { OemNumberDto, TechnicalSpecDto } from "@vp-parts-shop/shared";
import { cn } from "@/lib/utils";
import { ArticleRowNumbers } from "./article-row-numbers";
import { ArticleRowSubstitutes } from "./article-row-substitutes";
import { ArticleRowVehicles } from "./article-row-vehicles";

type DetailSectionId = "specs" | "substitutes" | "numbers" | "vehicles";

interface ArticleRowDetailProps {
  /** TecDoc brand id; needed with the number to read this exact part. */
  brandId: string;
  articleNumber: string;
  technicalSpecs: TechnicalSpecDto[];
  oemNumbers: OemNumberDto[];
}

const SECTION_LABEL: Record<DetailSectionId, string> = {
  specs: "Технически характеристики",
  substitutes: "Заменяеми",
  numbers: "Алтернативни номера",
  vehicles: "Приложими автомобили",
};

/**
 * The expanded body of a catalog row — an accordion over the article's detail.
 *
 * Only the technical specs come free with the catalog response. Every other
 * section reads from TecDoc when opened — cross-references and vehicle linkages
 * are volumes no list response could carry per row — which is why none of them
 * is ever the section that opens by itself.
 */
export function ArticleRowDetail({
  brandId,
  articleNumber,
  technicalSpecs,
  oemNumbers,
}: ArticleRowDetailProps) {
  const sections = availableSections(technicalSpecs);
  const [openSection, setOpenSection] = useState<DetailSectionId | null>(
    defaultOpenSection(technicalSpecs),
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
          {openSection === "substitutes" && (
            <ArticleRowSubstitutes
              brandId={brandId}
              articleNumber={articleNumber}
            />
          )}
          {openSection === "numbers" && (
            <ArticleRowNumbers
              brandId={brandId}
              articleNumber={articleNumber}
              oemNumbers={oemNumbers}
            />
          )}
          {openSection === "vehicles" && (
            <ArticleRowVehicles
              brandId={brandId}
              articleNumber={articleNumber}
            />
          )}
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

/**
 * The sections worth offering, in display order. The read-on-demand sections
 * are always offered: whether an article has cross-references or applicable
 * vehicles is only known once they are fetched, and fetching them per row to
 * decide is the cost those sections are designed to avoid.
 *
 * Substitutes lead them: they are the same cross-references as the alternative
 * numbers below, but as parts a visitor can compare and buy, which is the more
 * useful of the two answers.
 */
function availableSections(
  technicalSpecs: TechnicalSpecDto[],
): DetailSectionId[] {
  const sections: DetailSectionId[] = [];

  if (technicalSpecs.length > 0) {
    sections.push("specs");
  }
  sections.push("substitutes", "numbers", "vehicles");

  return sections;
}

/**
 * Only a section that costs nothing may open by itself; anything else would
 * fire a TecDoc read for every row a visitor expands.
 */
function defaultOpenSection(
  technicalSpecs: TechnicalSpecDto[],
): DetailSectionId | null {
  return technicalSpecs.length > 0 ? "specs" : null;
}
