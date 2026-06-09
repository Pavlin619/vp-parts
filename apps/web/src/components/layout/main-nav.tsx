export function MainNav() {
  return (
    <nav className="hidden md:flex items-center gap-1" aria-label="Основна навигация">
      {["Каталог", "Марки", "Промоции"].map((label) => (
        <a
          key={label}
          href="#"
          className="px-3 py-1.5 text-sm text-ink-2 hover:text-ink hover:bg-bg-sunken rounded-lg transition-colors"
        >
          {label}
        </a>
      ))}
    </nav>
  );
}
