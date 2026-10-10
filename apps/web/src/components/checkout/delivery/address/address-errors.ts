import { isLocatableAddress } from "@vp-parts-shop/shared";
import { isCityValid, isPostcodeValid, type AddressFormValues } from "./address-form-values";

export type AddressErrors = Partial<
  Record<"city" | "postcode" | "street" | "streetNumber" | "block", string>
>;

/** The field that is missing for the route the customer started on: a street, or a quarter. */
export function addressErrors(values: AddressFormValues): AddressErrors {
  return {
    ...(!isCityValid(values) && { city: "Въведи населено място" }),
    ...(!isPostcodeValid(values) && { postcode: "Въведи 4 цифри" }),
    ...locatorErrors(values),
  };
}

function locatorErrors(values: AddressFormValues): AddressErrors {
  if (isLocatableAddress(values)) return {};

  const hasStreet = Boolean(values.street.trim());
  const hasNumber = Boolean(values.streetNumber.trim());

  if (hasStreet) return { streetNumber: "Въведи номер" };
  if (hasNumber) return { street: "Въведи улица" };
  if (values.quarter.trim()) return { block: "Добави блок, вход, етаж или апартамент" };

  return { street: "Въведи улица и номер" };
}
