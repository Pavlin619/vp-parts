"use client";

import { useRef, useState, type ComponentType, type KeyboardEvent } from "react";
import {
  ArticleRowNumbers,
  ArticleRowSubstitutes,
  ArticleRowVehicles,
} from "@/components/catalog/article-row";
import {
  ARTICLE_SECTION_LABEL,
  type ArticleSectionId,
} from "@/lib/catalog/article-sections";
import { cn } from "@/lib/utils";

interface ArticleDetailSectionsProps {
  /** TecDoc brand id; needed with the number to read this exact part. */
  brandId: string;
  articleNumber: string;
}

interface SectionPanelProps {
  brandId: string;
  articleNumber: string;
}

/** The specs table has its own place in the page's middle column. */
type PageSectionId = Exclude<ArticleSectionId, "specs">;

const SECTIONS: PageSectionId[] = ["substitutes", "numbers", "vehicles"];

const SECTION_PANEL: Record<PageSectionId, ComponentType<SectionPanelProps>> = {
  substitutes: ArticleRowSubstitutes,
  numbers: ArticleRowNumbers,
  vehicles: ArticleRowVehicles,
};

const ARROW_STEP: Record<string, number> = {
  ArrowRight: 1,
  ArrowLeft: -1,
};

/**
 * The article detail page's lower half: the same cross-reference and vehicle
 * linkage sections a catalog row expands into, as a full-width tab strip.
 *
 * The row's rule that no section may open by itself does not hold here — it
 * exists so expanding one of twenty rows does not fetch, whereas this page is a
 * single part a visitor asked for by name. Substitutes therefore load with the
 * page, since a visitor reading one part is comparing it against the others.
 * Every other section still waits to be selected.
 */
export function ArticleDetailSections({
  brandId,
  articleNumber,
}: ArticleDetailSectionsProps) {
  const [selectedSection, setSelectedSection] =
    useState<PageSectionId>("substitutes");
  const tabRefs = useRef<Partial<Record<PageSectionId, HTMLButtonElement>>>({});

  const moveSelection = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = ARROW_STEP[event.key];

    if (step === undefined) {
      return;
    }

    event.preventDefault();

    const current = SECTIONS.indexOf(selectedSection);
    const next = SECTIONS[(current + step + SECTIONS.length) % SECTIONS.length];

    setSelectedSection(next);
    tabRefs.current[next]?.focus();
  };

  const SelectedPanel = SECTION_PANEL[selectedSection];

  return (
    <section className="overflow-hidden rounded-[14px] border border-line bg-bg-card">
      <div
        role="tablist"
        aria-label={`Допълнителна информация за ${articleNumber}`}
        onKeyDown={moveSelection}
        className="flex items-center gap-1 overflow-x-auto border-b border-line bg-bg-sunken px-2 py-2"
      >
        {SECTIONS.map((section) => (
          <button
            key={section}
            ref={(tab) => {
              if (tab) {
                tabRefs.current[section] = tab;
              }
            }}
            type="button"
            role="tab"
            id={tabId(section)}
            aria-selected={selectedSection === section}
            aria-controls={panelId(section)}
            // Roving tabindex: one Tab press reaches the strip and the arrows
            // move within it, rather than the strip costing a press per section.
            tabIndex={selectedSection === section ? 0 : -1}
            onClick={() => setSelectedSection(section)}
            className={cn(
              "inline-flex h-9 shrink-0 items-center rounded-md px-4 text-[13px] font-semibold text-ink-3 transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
              selectedSection === section &&
                "border border-line bg-bg-card text-ink shadow-sm",
            )}
          >
            {ARTICLE_SECTION_LABEL[section]}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={panelId(selectedSection)}
        aria-labelledby={tabId(selectedSection)}
        className="px-5 py-6"
      >
        <SelectedPanel brandId={brandId} articleNumber={articleNumber} />
      </div>
    </section>
  );
}

function tabId(section: PageSectionId): string {
  return `article-section-tab-${section}`;
}

function panelId(section: PageSectionId): string {
  return `article-section-panel-${section}`;
}
