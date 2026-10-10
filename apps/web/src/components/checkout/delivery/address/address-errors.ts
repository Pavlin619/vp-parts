import { isPlaceChosen, type AddressFormValues, type LocatorMode } from "./address-form-values";

export type AddressErrors = Partial<
  Record<"place" | "street" | "streetNumber" | "quarter" | "block", string>
>;

/** What is missing for the route the customer chose: a street and number, or a quarter and where in it. */
export function addressErrors(values: AddressFormValues, mode: LocatorMode): AddressErrors {
  return {
    ...(!isPlaceChosen(values) && { place: "Избери населено място от списъка" }),
    ...(mode === "street" ? streetErrors(values) : quarterErrors(values)),
  };
}

function streetErrors({ street, streetNumber }: AddressFormValues): AddressErrors {
  return {
    ...(!street.trim() && { street: "Въведи улица" }),
    ...(!streetNumber.trim() && { streetNumber: "Въведи номер" }),
  };
}

function quarterErrors(values: AddressFormValues): AddressErrors {
  const isPlacedInQuarter = [values.block, values.entrance, values.floor, values.apartment].some(
    (part) => part.trim(),
  );

  return {
    ...(!values.quarter.trim() && { quarter: "Въведи квартал или ж.к." }),
    ...(!isPlacedInQuarter && { block: "Добави блок, вход, етаж или апартамент" }),
  };
}
