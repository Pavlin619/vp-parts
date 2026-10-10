import type { DeliveryAddressDto } from '@vp-parts-shop/shared';

/**
 * Econt's address has no block, entrance, floor, apartment or note — only `other`, which it
 * folds into the address the courier reads. The shared limits keep the longest possible
 * result well inside this; Econt itself refused nothing up to 8,000 characters.
 */
export const ECONT_OTHER_MAX_LENGTH = 200;

const NOTE_SEPARATOR = '; ';

/** The address as Econt's services take it; the street number is its `num`. */
export function econtAddressOf({
  placeId,
  street,
  streetNumber,
  quarter,
  ...details
}: DeliveryAddressDto): object {
  const other = otherOf(details);

  return {
    city: { id: Number(placeId) },
    ...(street && { street }),
    ...(streetNumber && { num: streetNumber }),
    ...(quarter && { quarter }),
    ...(other && { other }),
  };
}

/** "бл. 5, вх. Б, ет. 3, ап. 12; звънецът не работи" — where in the building, then the note. */
function otherOf({
  block,
  entrance,
  floor,
  apartment,
  note,
}: Omit<
  DeliveryAddressDto,
  'placeId' | 'street' | 'streetNumber' | 'quarter'
>): string {
  const place = [
    labelled('бл.', block),
    labelled('вх.', entrance),
    labelled('ет.', floor),
    labelled('ап.', apartment),
  ].filter(Boolean);

  return [place.join(', '), note?.trim()].filter(Boolean).join(NOTE_SEPARATOR);
}

function labelled(label: string, value: string | undefined): string {
  const text = value?.trim();

  return text ? `${label} ${text}` : '';
}
