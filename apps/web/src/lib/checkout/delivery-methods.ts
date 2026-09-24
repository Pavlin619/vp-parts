/**
 * How a B2C order reaches the customer. Both go by courier; they differ only in
 * where the courier hands it over. The carrier and the exact address or office
 * are chosen inside the provider's own widget, which mounts under the option.
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
