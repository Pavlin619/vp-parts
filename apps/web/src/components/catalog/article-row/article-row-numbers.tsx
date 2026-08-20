"use client";

import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AlternativeNumberDto, OemNumberDto } from "@vp-parts-shop/shared";
import { alternativeNumbersQueryOptions } from "@/lib/api/catalog";
import { PartNumberChip } from "./part-number-chip";
import { SectionLoadError } from "./section-load-error";

interface ArticleRowNumbersProps {
  articleNumber: string;
  oemNumbers: OemNumberDto[];
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
 * be ordered by. Two halves, because they arrive on different schedules —
 * TecDoc ships the OE numbers with the article itself, while the numbers other
 * brands sell it under only come out of a comparable-number search.
 *
 * That search is why this component fetches at all, and why it is mounted only
 * once the section is opened: the read is the cost of the section, not of the
 * row. The query cache is what makes reopening it — or opening it on another
 * row for the same part — free.
 */
export function ArticleRowNumbers({
  articleNumber,
  oemNumbers,
}: ArticleRowNumbersProps) {
  return (
    <div className="flex flex-col gap-5">
      {oemNumbers.length > 0 && (
        <NumberBlock title="OE номера">
          <ChipList numbers={mergePartNumbers(fromOemNumbers(oemNumbers))} />
        </NumberBlock>
      )}

      <NumberBlock title="Номера от производители">
        <AlternativeNumbers articleNumber={articleNumber} />
      </NumberBlock>
    </div>
  );
}

function AlternativeNumbers({ articleNumber }: { articleNumber: string }) {
  const { data, isPending, isError, refetch } = useQuery(
    alternativeNumbersQueryOptions(articleNumber),
  );

  if (isPending) {
    return <AlternativeNumbersSkeleton />;
  }

  if (isError) {
    return (
      <SectionLoadError
        message="В момента не можем да заредим номерата от други производители."
        onRetry={() => refetch()}
      />
    );
  }

  if (data.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-line-2 bg-canvas p-5 text-[13px] text-ink-3">
        Няма номера от други производители за този артикул.
      </p>
    );
  }

  return <ChipList numbers={mergePartNumbers(fromAlternativeNumbers(data))} />;
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

function AlternativeNumbersSkeleton() {
  return (
    <div
      className="flex flex-wrap gap-[7px]"
      data-testid="article-row-alternative-numbers-skeleton"
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
