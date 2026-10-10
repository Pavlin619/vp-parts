import { type DeliveryAddressDto, type DeliveryPlaceDto } from "@vp-parts-shop/shared";

export interface AddressFormValues {
  place: DeliveryPlaceDto | null;
  street: string;
  streetNumber: string;
  quarter: string;
  block: string;
  entrance: string;
  floor: string;
  apartment: string;
  note: string;
}

export const EMPTY_ADDRESS_FORM: AddressFormValues = {
  place: null,
  street: "",
  streetNumber: "",
  quarter: "",
  block: "",
  entrance: "",
  floor: "",
  apartment: "",
  note: "",
};

export type LocatorMode = "street" | "quarter";

/** The route the values already take; a street wins, as it does for the carrier. */
export function locatorModeOf({ street, streetNumber, quarter }: AddressFormValues): LocatorMode {
  const hasStreet = Boolean(street.trim() || streetNumber.trim());

  return quarter.trim() && !hasStreet ? "quarter" : "street";
}

/** Switching route starts the door over, keeping the place and the note for the courier. */
export function withLocatorMode(values: AddressFormValues): AddressFormValues {
  return {
    ...EMPTY_ADDRESS_FORM,
    place: values.place,
    note: values.note,
  };
}

const LOCATOR_FIELDS = [
  "street",
  "streetNumber",
  "quarter",
  "block",
  "entrance",
  "floor",
  "apartment",
  "note",
] as const;

export const isPlaceChosen = ({ place }: AddressFormValues) => place !== null;

/** The address as the API takes it: keyed by place, with what was left empty dropped. */
export function toDeliveryAddress(values: AddressFormValues): DeliveryAddressDto {
  const filled = LOCATOR_FIELDS.flatMap((field) => {
    const value = values[field].trim();

    return value ? [[field, value] as const] : [];
  });

  return { placeId: values.place?.id ?? "", ...Object.fromEntries(filled) };
}

/** The form as the carrier's address fills it, for editing an accepted address again. */
export function addressFormValuesOf(
  address: DeliveryAddressDto,
  places: DeliveryPlaceDto[],
): AddressFormValues {
  const { placeId, ...locator } = address;

  return {
    ...EMPTY_ADDRESS_FORM,
    ...locator,
    place: places.find(({ id }) => id === placeId) ?? null,
  };
}

/** "ул. Опълченска 46, бл. 3, вх. Б, 1303 София" — the address on one line, without the note. */
export function formatAddress(values: AddressFormValues): string {
  const street = [values.street, values.streetNumber].filter(Boolean).join(" ");
  const parts = [
    street,
    values.quarter,
    labelled("бл.", values.block),
    labelled("вх.", values.entrance),
    labelled("ет.", values.floor),
    labelled("ап.", values.apartment),
    values.place ? `${values.place.postCode} ${values.place.name}` : "",
  ];

  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");
}

function labelled(label: string, value: string): string {
  return value.trim() ? `${label} ${value.trim()}` : "";
}
