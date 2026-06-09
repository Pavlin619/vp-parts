import Link from "next/link";

export function UtilityStrip() {
  return (
    <div className="bg-ink py-2 px-6">
      <div className="max-w-[1360px] mx-auto flex items-center justify-between">
        <p className="text-white/70 text-xs">
          Безплатна доставка над €50 · 02 123 456 · София
        </p>
        <div className="flex items-center gap-4">
          <Link
            href="/account"
            className="text-white/70 text-xs hover:text-white transition-colors"
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
