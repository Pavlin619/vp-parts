import { ShippingMethod } from "@vp-parts-shop/shared";

/**
 * How a B2C order reaches the customer. Both go by courier; they differ only in
 * where the courier hands it over. The exact address or office is chosen in the
 * carrier's picker, which mounts under the option.
 */
export type DeliveryMethod = "courier-address" | "courier-office";

export interface DeliveryMethodOption {
  id: DeliveryMethod;
  label: string;
  description: string;
}

export const B2C_DELIVERY_METHODS: readonly DeliveryMethodOption[] = [
  {
    id: "courier-address",
    label: "Доставка с куриер до адрес",
    description: "До посочен от вас адрес",
  },
  {
    id: "courier-office",
    label: "Доставка с куриер до офис",
    description: "Вземане от офис или автомат на куриер",
  },
];

export const DEFAULT_DELIVERY_METHOD: DeliveryMethod = "courier-address";

/** The carrier an office delivery goes by, while Econt is the only one we integrate. */
export const OFFICE_DELIVERY_CARRIER = ShippingMethod.ECONT;

export const CARRIER_NAMES: Record<ShippingMethod, string> = {
  [ShippingMethod.ECONT]: "Еконт",
  [ShippingMethod.SPEEDY]: "Speedy",
};
