import { MapPin } from "lucide-react";

export function PickPlacePrompt() {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <MapPin className="h-6 w-6 text-ink-4" aria-hidden="true" />
      <p className="text-[12.5px] text-ink-3">
        Изберете населено място или натиснете „Близо до мен“.
      </p>
    </div>
  );
}
