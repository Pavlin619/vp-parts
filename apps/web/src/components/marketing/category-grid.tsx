import Link from "next/link";

export const CATEGORIES = [
  { name: "Спирачки", slug: "brakes", icon: "⬡" },
  { name: "Двигател", slug: "engine", icon: "⬡" },
  { name: "Окачване", slug: "suspension", icon: "⬡" },
  { name: "Електрика", slug: "electrical", icon: "⬡" },
  { name: "Климатик", slug: "ac", icon: "⬡" },
  { name: "Трансмисия", slug: "transmission", icon: "⬡" },
  { name: "Изпускателна система", slug: "exhaust", icon: "⬡" },
  { name: "Охлаждане", slug: "cooling", icon: "⬡" },
];

export function CategoryGrid() {
  return (
    <section className="max-w-[1360px] mx-auto px-6 pb-16">
      <h2 className="font-display font-semibold text-ink text-xl mb-6">
        Разгледай по категория
      </h2>
      <ul
        className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3"
        aria-label="Категории части"
      >
        {CATEGORIES.map((cat) => (
          <li key={cat.slug}>
            <Link
              href={`/catalog/${cat.slug}`}
              className="flex flex-col items-center gap-3 p-4 bg-bg-card border border-line rounded-[12px] hover:border-ink-3 hover:shadow-[0_4px_12px_rgba(11,18,32,0.06)] transition-all text-center group"
            >
              <div
                className="w-10 h-10 rounded-lg bg-bg-sunken flex items-center justify-center text-lg"
                aria-hidden="true"
              >
                {cat.icon}
              </div>
              <span className="text-xs font-medium text-ink group-hover:text-accent transition-colors leading-snug">
                {cat.name}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
