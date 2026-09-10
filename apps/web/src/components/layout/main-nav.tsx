import Link from "next/link";

const LINK =
  "px-3 py-1.5 text-sm text-ink-2 hover:text-ink hover:bg-bg-sunken rounded-lg transition-colors";

export function MainNav() {
  return (
    <nav className="hidden md:flex items-center gap-1" aria-label="Основна навигация">
      <Link href="/catalog" className={LINK}>
        Каталог
      </Link>
      {["Марки", "Промоции"].map((label) => (
        <a key={label} href="#" className={LINK}>
          {label}
        </a>
      ))}
    </nav>
  );
}
