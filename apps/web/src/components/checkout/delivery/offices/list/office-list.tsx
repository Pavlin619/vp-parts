import type { DeliveryOfficeDto } from "@vp-parts-shop/shared";
import { officeAvailability, type ParcelCheck } from "@/lib/checkout/delivery/office-availability";
import { distanceInMeters, type GeoPoint } from "@/lib/checkout/delivery/office-distance";
import { OfficeListItem } from "./office-list-item";

const MAX_LISTED_OFFICES = 50;

interface ServedPlace {
  officeCode: string;
  name: string;
}

interface OfficeListProps {
  offices: DeliveryOfficeDto[];
  parcelCheck: ParcelCheck;
  hoveredCode: string | null;
  /** What each office's distance is measured from; null shows none. */
  referencePoint: GeoPoint | null;
  /** A chosen village with no office of its own, and the office that serves it. */
  servedPlace: ServedPlace | null;
  onOpen: (officeCode: string) => void;
  onHover: (officeCode: string | null) => void;
}

export function OfficeList({
  offices,
  parcelCheck,
  hoveredCode,
  referencePoint,
  servedPlace,
  onOpen,
  onHover,
}: OfficeListProps) {
  if (offices.length === 0) {
    return (
      <p className="px-1 py-6 text-center text-[12.5px] text-ink-3">
        Няма офиси, които отговарят на търсенето.
      </p>
    );
  }

  return (
    <div>
      <ul aria-label="Офиси" className="flex flex-col gap-1.5">
        {offices.slice(0, MAX_LISTED_OFFICES).map((office) => (
          <li key={office.code}>
            <OfficeListItem
              office={office}
              availability={officeAvailability(office, parcelCheck)}
              isHovered={office.code === hoveredCode}
              distanceMeters={referencePoint && distanceInMeters(referencePoint, office)}
              servedPlaceName={
                office.code === servedPlace?.officeCode ? servedPlace.name : null
              }
              onOpen={onOpen}
              onHover={onHover}
            />
          </li>
        ))}
      </ul>

      {offices.length > MAX_LISTED_OFFICES && (
        <p className="px-1 pt-2.5 text-[11.5px] text-ink-3">
          Показани са {MAX_LISTED_OFFICES} от {offices.length}. Уточнете търсенето, за да видите
          останалите.
        </p>
      )}
    </div>
  );
}
