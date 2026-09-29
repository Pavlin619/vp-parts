export function ApproximatePlaceNote({ placeName }: { placeName: string }) {
  return (
    <p className="text-[12px] text-ink-3">
      Показваме офиси в {placeName} по приблизителното ви местоположение. Ако не сте там,
      изберете друго населено място.
    </p>
  );
}
