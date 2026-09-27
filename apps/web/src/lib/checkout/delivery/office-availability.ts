import {
  DeliveryOfficeType,
  type DeliveryOfficeDto,
  type ParcelEstimateDto,
} from "@vp-parts-shop/shared";

/** Where the parcel estimate stands, as the office picker reads it. */
export type ParcelCheck =
  | { state: "checking" }
  | { state: "failed" }
  | { state: "ready"; parcel: ParcelEstimateDto };

export type OfficeBlockReason =
  | "PARCEL_CHECKING"
  | "PARCEL_CHECK_FAILED"
  | "PARCEL_NOT_LOCKER_ELIGIBLE";

export const OFFICE_BLOCK_REASON_COPY: Record<OfficeBlockReason, string> = {
  PARCEL_CHECKING: "Проверяваме дали пратката се побира в автомат…",
  PARCEL_CHECK_FAILED: "Не успяхме да проверим дали пратката се побира в автомат.",
  PARCEL_NOT_LOCKER_ELIGIBLE: "Пратката не може да бъде доставена до автомат.",
};

export type OfficeAvailability =
  | { isSelectable: true }
  | { isSelectable: false; reason: OfficeBlockReason };

/**
 * Whether the customer may pick this office. A staffed office takes any parcel;
 * a locker only one the API has shown to fit its largest cell.
 */
export function officeAvailability(
  office: DeliveryOfficeDto,
  parcelCheck: ParcelCheck,
): OfficeAvailability {
  if (office.type !== DeliveryOfficeType.LOCKER) {
    return { isSelectable: true };
  }

  switch (parcelCheck.state) {
    case "checking":
      return { isSelectable: false, reason: "PARCEL_CHECKING" };
    case "failed":
      return { isSelectable: false, reason: "PARCEL_CHECK_FAILED" };
    case "ready":
      return parcelCheck.parcel.isLockerEligible
        ? { isSelectable: true }
        : { isSelectable: false, reason: "PARCEL_NOT_LOCKER_ELIGIBLE" };
  }
}

/**
 * The remembered office, if the carrier still lists it and the parcel may still
 * go there. A locker is kept while the parcel is being re-weighed.
 */
export function resolveSelectedOffice(
  offices: DeliveryOfficeDto[],
  officeCode: string | null,
  parcelCheck: ParcelCheck,
): DeliveryOfficeDto | null {
  const office = offices.find(({ code }) => code === officeCode);

  if (!office) {
    return null;
  }

  const availability = officeAvailability(office, parcelCheck);
  const isKept = availability.isSelectable || availability.reason === "PARCEL_CHECKING";

  return isKept ? office : null;
}
