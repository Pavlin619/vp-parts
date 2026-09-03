import Link from "next/link";

export function UtilityStrip() {
  return (
    <div className="bg-ink py-2">
      <div className="page-container flex items-center justify-between">
        <p className="text-white/70 text-xs">
          Безплатна доставка над €50
          <span className="hidden sm:inline"> · 02 123 456 · София</span>
        </p>
        <div className="flex items-center gap-4">
          {/* The header's account icon says the same thing below `sm`, where
              the strip has no room for all three. */}
          <Link
            href="/account"
            className="hidden text-white/70 text-xs transition-colors hover:text-white sm:inline"
          >
            Професионален акаунт
          </Link>
          <a
            href="#"
            className="text-white/70 text-xs hover:text-white transition-colors"
          >
            Помощ
          </a>
        </div>
      </div>
    </div>
  );
}
