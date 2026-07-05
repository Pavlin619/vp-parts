import type { TechnicalSpecDto } from "@vp-parts-shop/shared";
import { cn } from "@/lib/utils";

interface ArticleSpecsProps {
  technicalSpecs: TechnicalSpecDto[];
  oemNumbers: string[];
}

function SectionHeading({
  children,
  bordered = true,
}: {
  children: React.ReactNode;
  bordered?: boolean;
}) {
  return (
    <h2
      className={cn(
        "mb-3 text-base font-semibold uppercase tracking-wide text-muted",
        bordered && "border-b border-line pb-2",
      )}
    >
      {children}
    </h2>
  );
}

/**
 * Static article information shown in the middle column: the technical specs
 * table and the OEM cross-reference numbers. Presentational only.
 */
export function ArticleSpecs({ technicalSpecs, oemNumbers }: ArticleSpecsProps) {
  return (
    <div className="flex flex-col gap-8">
      {technicalSpecs.length > 0 && (
        <section aria-label="Технически характеристики">
          <SectionHeading bordered={false}>
            Технически характеристики
          </SectionHeading>
          <dl>
            {technicalSpecs.map((spec) => (
              <div
                key={spec.key}
                className="flex items-baseline justify-between gap-4 py-2"
              >
                <dt className="text-sm text-muted">{spec.key}</dt>
                <dd className="text-right text-sm font-medium text-ink">
                  {spec.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {oemNumbers.length > 0 && (
        <section aria-label="OEM номера">
          <SectionHeading>OEM номера (съвместими)</SectionHeading>
          <div className="rounded-[12px] bg-bg-sunken p-4">
            <ul className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
              {oemNumbers.map((oem) => (
                <li key={oem} className="font-mono text-xs text-ink">
                  {oem}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}
