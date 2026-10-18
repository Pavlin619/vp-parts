import type { ReactNode } from "react";
import { Store, Truck } from "lucide-react";
import {
  DeliveryMethod,
  PaymentMethod,
  type OrderDeliveryDto,
  type OrderDetailDto,
  type ShippingMethod,
} from "@vp-parts-shop/shared";
import {
  EMPTY_ADDRESS_FORM,
  formatAddress,
} from "@/components/checkout/delivery/address/address-form-values";
import { formatOfficeHours } from "@/lib/checkout/delivery/office-hours";
import { B2C_PAYMENT_METHODS } from "@/lib/checkout/payment/payment-methods";
import { formatShopDate } from "@/lib/delivery/format";
import { CarrierMark } from "./carrier-mark";

type DeliveryOrder = Pick<OrderDetailDto, "delivery" | "contact" | "paymentMethod">;

interface DeliveryDescription {
  label: string;
  carrier: ShippingMethod | null;
  place: string;
  details: string[];
}

/** Where the order goes and when, who receives it, and how it is paid, as chosen at checkout. */
export function OrderDeliveryDetails({ order }: { order: DeliveryOrder }) {
  const { delivery, contact } = order;
  const isPickup = delivery.method === DeliveryMethod.STORE_PICKUP;
  const { label, carrier, place, details } = describeDelivery(delivery);

  return (
    <section className="rounded-[12px] border border-line bg-bg-card p-5">
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">
        Доставка и плащане
      </h2>

      {delivery.expectedDeliveryDate && (
        <ExpectedDate isPickup={isPickup} date={delivery.expectedDeliveryDate} />
      )}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-x-6 gap-y-[18px]">
        <InfoBlock
          label={label}
          main={place}
          icon={carrier && <CarrierMark carrier={carrier} />}
          lines={details}
        />
        <InfoBlock
          label="Получател"
          main={`${contact.firstName} ${contact.lastName}`}
          lines={[contact.phoneNumber, contact.email]}
        />
        <InfoBlock label="Плащане" main={paymentLabel(order.paymentMethod)} lines={[]}>
          {order.paymentMethod === PaymentMethod.CASH_ON_DELIVERY && (
            <span className="mt-2 inline-flex h-[22px] items-center rounded-full bg-bg-sunken px-[9px] text-[11px] font-bold text-ink-2">
              {isPickup ? "Плаща се в магазина" : "Плаща се при получаване"}
            </span>
          )}
        </InfoBlock>
      </div>
    </section>
  );
}

function ExpectedDate({ isPickup, date }: { isPickup: boolean; date: string }) {
  const Icon = isPickup ? Store : Truck;

  return (
    <div className="mb-3 flex items-center gap-3 rounded-[10px] bg-ok-soft px-3.5 py-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-bg-card text-ok">
        <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
      </span>
      <dl>
        <dt className="text-[11.5px] text-ink-3">
          {isPickup ? "Готова за вземане" : "Очаквана доставка"}
        </dt>
        <dd className="mt-px font-display text-base font-semibold text-ink">
          {formatShopDate(date)}
        </dd>
      </dl>
    </div>
  );
}

function InfoBlock({
  label,
  main,
  icon,
  lines,
  children,
}: {
  label: string;
  main: string;
  icon?: ReactNode;
  lines: string[];
  children?: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <h3 className="mb-[7px] text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-4">
        {label}
      </h3>
      <p className="flex items-center gap-[7px] text-[13.5px] font-semibold text-ink">
        {icon}
        {main}
      </p>
      {lines.map((line) => (
        <p key={line} className="mt-0.5 break-words text-[12.5px] leading-[1.45] text-ink-3">
          {line}
        </p>
      ))}
      {children}
    </div>
  );
}

function paymentLabel(method: PaymentMethod): string {
  return B2C_PAYMENT_METHODS.find((option) => option.id === method)?.label ?? method;
}

function describeDelivery(delivery: OrderDeliveryDto): DeliveryDescription {
  switch (delivery.method) {
    case DeliveryMethod.COURIER_OFFICE:
      return {
        label: "Доставка до офис",
        carrier: delivery.carrier,
        place: delivery.office.name,
        details: [delivery.office.address, formatOfficeHours(delivery.office)].filter(
          (line): line is string => line !== null,
        ),
      };
    case DeliveryMethod.COURIER_ADDRESS: {
      const { city, postCode, ...lines } = delivery.address;

      return {
        label: "Доставка до адрес",
        carrier: delivery.carrier,
        place: formatAddress({
          ...EMPTY_ADDRESS_FORM,
          ...lines,
          place: { id: lines.placeId, name: city, postCode },
        }),
        details: lines.note ? [lines.note] : [],
      };
    }
    case DeliveryMethod.STORE_PICKUP:
      return {
        label: "Вземане от магазина",
        carrier: null,
        place: "Нашият магазин в Плевен",
        details: [],
      };
  }
}
