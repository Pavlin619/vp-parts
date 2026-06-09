import { Camera } from "lucide-react";

interface VehicleFinderSearchInputProps {
  placeholder: string;
  showCamera?: boolean;
}

export function VehicleFinderSearchInput({
  placeholder,
  showCamera = false,
}: VehicleFinderSearchInputProps) {
  return (
    <div className="flex gap-2">
      <input
        type="text"
        placeholder={placeholder}
        className="flex-1 h-14 px-4 bg-bg-card border border-line rounded-lg text-sm text-ink placeholder:text-muted/60 uppercase tracking-widest focus:outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(11,18,32,0.06)]"
      />
      {showCamera && (
        <button className="w-14 h-14 flex items-center justify-center border border-line rounded-lg hover:bg-bg-sunken transition-colors flex-shrink-0">
          <Camera className="w-5 h-5 text-muted" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
