import { PaymentMethod } from "@vp-parts-shop/shared";

export interface PaymentMethodOption {
  id: PaymentMethod;
  label: string;
  description: string;
}

export const B2C_PAYMENT_METHODS: readonly PaymentMethodOption[] = [
  {
    id: PaymentMethod.CARD,
    label: "Плащане с карта",
    description: "Visa, Mastercard · сигурно плащане",
  },
  {
    id: PaymentMethod.CASH_ON_DELIVERY,
    label: "Наложен платеж",
    description: "В брой при получаване",
  },
];
