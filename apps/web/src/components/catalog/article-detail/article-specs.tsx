import type { TechnicalSpecDto } from "@vp-parts-shop/shared";

interface ArticleSpecsProps {
  technicalSpecs: TechnicalSpecDto[];
}

/**
 * Static article information shown in the middle column: the technical specs
 * table. Presentational only. OEM cross-reference numbers now live in the
 * dedicated bottom detail section.
 */
export function ArticleSpecs({ technicalSpecs }: ArticleSpecsProps) {
  if (technicalSpecs.length === 0) {
    return null;
  }

  return (
    <section aria-label="Технически характеристики">
      <h2 className="mb-3 text-base font-semibold uppercase tracking-wide text-muted">
        Технически характеристики
      </h2>
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
  );
}
