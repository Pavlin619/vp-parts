import type { DeviceLocationStatus } from "@/hooks/use-device-location";

const FAILURE_COPY: Partial<Record<DeviceLocationStatus, string>> = {
  denied: "Нямаме достъп до местоположението ви. Потърсете по град или адрес.",
  unavailable: "Не успяхме да определим местоположението ви. Потърсете по град или адрес.",
};

export function DeviceLocationNotice({ status }: { status: DeviceLocationStatus }) {
  const copy = FAILURE_COPY[status];
  if (!copy) {
    return null;
  }

  return (
    <p role="alert" className="text-[12px] text-warn">
      {copy}
    </p>
  );
}
