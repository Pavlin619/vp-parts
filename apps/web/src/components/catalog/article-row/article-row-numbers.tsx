"use client";

import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AlternativeNumberDto, OemNumberDto } from "@vp-parts-shop/shared";
import { partNumbersQueryOptions } from "@/lib/api/catalog";
import { PartNumberChip } from "./part-number-chip";
import { SectionLoadError } from "./section-load-error";

interface ArticleRowNumbersProps {
  /** TecDoc brand id; the numbers behind these belong to one brand's part. */
  brandId: string;
  articleNumber: string;
}

/**
 * One number in the section, flattened from either half. An OE number and a
 * cross-reference differ in what the marque means — a vehicle manufacturer for
 * one, a parts brand for the other — but not in how they merge or copy, so both
 * reduce to this before rendering.
 */
export interface PartNumber {
  code: string;
  manufacturerName: string | null;
  note: string | null;
}

/** One chip: a number and every marque that files it. */
export interface MergedPartNumber {
  code: string;
  manufacturerNames: string[];
  note: string | null;
}

/**
 * The alternative-numbers section of a catalog row: every number this part can
 * be ordered by, in the two kinds a chip list distinguishes — the vehicle
 * makers' own OE numbers and the numbers other parts brands sell the equivalent
 * under.
 *
 * Both halves are read here rather than carried by the row: the alternatives
 * because they are only known once the cross-references resolve, the OE numbers
 * because they are the bulkiest field on an article and a list would pay for
 * them on every row to render them on none. That read is the cost of the
 * section, not of the row, which is why the component is mounted only once the
 * section is opened. The query cache is what makes reopening it — or opening it
 * on another row for the same part — free.
 */
export function ArticleRowNumbers({
  brandId,
  articleNumber,
}: ArticleRowNumbersProps) {
  const { data, isPending, isError, refetch } = useQuery(
    partNumbersQueryOptions(brandId, articleNumber),
  );

  if (isPending) {
    return <PartNumbersSkeleton />;
  }

  if (isError) {
    return (
      <SectionLoadError
        message="В момента не можем да заредим номерата за този артикул."
        onRetry={() => refetch()}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {data.oemNumbers.length > 0 && (
        <NumberBlock title="OE номера">
          <ChipList
            numbers={mergePartNumbers(fromOemNumbers(data.oemNumbers))}
          />
        </NumberBlock>
      )}

      <NumberBlock title="Номера от производители">
        {data.alternativeNumbers.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-2 bg-canvas p-5 text-[13px] text-ink-3">
            Няма номера от други производители за този артикул.
          </p>
        ) : (
          <ChipList
            numbers={mergePartNumbers(
              fromAlternativeNumbers(data.alternativeNumbers),
            )}
          />
        )}
      </NumberBlock>
    </div>
  );
}

function NumberBlock({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3.5">
      <h4 className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-2">
        {title}
      </h4>
      {children}
    </section>
  );
}

function ChipList({ numbers }: { numbers: MergedPartNumber[] }) {
  return (
    <div className="flex flex-wrap gap-[7px]">
      {numbers.map((number) => (
        <PartNumberChip
          key={number.code}
          code={number.code}
          manufacturer={number.manufacturerNames.join(", ") || undefined}
          note={number.note ?? undefined}
        />
      ))}
    </div>
  );
}

function PartNumbersSkeleton() {
  return (
    <div
      className="flex flex-wrap gap-[7px]"
      data-testid="article-row-part-numbers-skeleton"
      aria-hidden="true"
    >
      {[0, 1, 2, 3].map((chip) => (
        <div
          key={chip}
          className="h-[30px] w-[104px] animate-pulse rounded-md border border-line bg-bg-sunken"
        />
      ))}
    </div>
  );
}

function fromOemNumbers(oemNumbers: OemNumberDto[]): PartNumber[] {
  return oemNumbers.map((oemNumber) => ({
    code: oemNumber.articleNumber,
    manufacturerName: oemNumber.manufacturerName,
    note: oemNumber.interchangeability,
  }));
}

function fromAlternativeNumbers(
  alternativeNumbers: AlternativeNumberDto[],
): PartNumber[] {
  return alternativeNumbers.map((alternativeNumber) => ({
    code: alternativeNumber.articleNumber,
    manufacturerName: alternativeNumber.brandName,
    note: null,
  }));
}

/**
 * One chip per number, keeping TecDoc's order.
 *
 * TecDoc files an OE number once per vehicle make that uses it, so a part
 * shared across a group's marques arrives as the same number several times over
 * — a VAG filter under VW, AUDI, SEAT and ŠKODA. Merging them collapses that
 * into a single chip naming all four instead of four chips repeating one number.
 *
 * The marque is optional on an OE number, and an unattributed number is still a
 * real reference, so it keeps its chip and simply carries no marque.
 */
export function mergePartNumbers(numbers: PartNumber[]): MergedPartNumber[] {
  const byCode = new Map<string, MergedPartNumber>();

  for (const number of numbers) {
    const merged = byCode.get(number.code);

    if (!merged) {
      byCode.set(number.code, {
        code: number.code,
        manufacturerNames:
          number.manufacturerName === null ? [] : [number.manufacturerName],
        note: number.note,
      });
      continue;
    }

    if (
      number.manufacturerName !== null &&
      !merged.manufacturerNames.includes(number.manufacturerName)
    ) {
      merged.manufacturerNames.push(number.manufacturerName);
    }

    // The note qualifies the number, not the marque, so the first one TecDoc
    // gives stands for the merged chip.
    merged.note ??= number.note;
  }

  return [...byCode.values()];
}
