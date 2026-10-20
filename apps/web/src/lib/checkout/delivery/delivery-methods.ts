import { ShippingMethod } from "@vp-parts-shop/shared";

/**
 * How a B2C order reaches the customer: by courier, to an address or an office
 * chosen in the carrier's picker under the option, or collected from our store.
 */
export type DeliveryMethod = "courier-address" | "courier-office" | "store-pickup";

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
  {
    id: "store-pickup",
    label: "Вземане от магазин",
    description: "Безплатно, от нашия магазин в Плевен",
  },
];

/** The carrier checkout delivers with, to an office or an address; Econt is our only one. */
export const CHECKOUT_CARRIER = ShippingMethod.ECONT;
