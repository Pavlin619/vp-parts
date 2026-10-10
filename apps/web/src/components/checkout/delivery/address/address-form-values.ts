export interface AddressFormValues {
  city: string;
  postcode: string;
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
  city: "",
  postcode: "",
  street: "",
  streetNumber: "",
  quarter: "",
  block: "",
  entrance: "",
  floor: "",
  apartment: "",
  note: "",
};

const POSTCODE_PATTERN = /^\d{4}$/;

export const isCityValid = ({ city }: AddressFormValues) => city.trim().length >= 2;

export const isPostcodeValid = ({ postcode }: AddressFormValues) =>
  POSTCODE_PATTERN.test(postcode);

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
    `${values.postcode} ${values.city}`,
  ];

  return parts.map((part) => part.trim()).filter(Boolean).join(", ");
}

function labelled(label: string, value: string): string {
  return value.trim() ? `${label} ${value.trim()}` : "";
}
