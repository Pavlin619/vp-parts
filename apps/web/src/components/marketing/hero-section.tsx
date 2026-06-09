import { VehicleFinderCard } from "./vehicle-finder-card";

const STATS = [
  { value: "500 000+", label: "артикула" },
  { value: "1 200+", label: "марки" },
  { value: "98%", label: "наличност" },
  { value: "от 1998", label: "опит" },
];

export function HeroSection() {
  return (
    <section className="max-w-[1360px] mx-auto px-6 py-12 md:py-20">
      <div className="grid md:grid-cols-2 gap-12 items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted mb-4">
            Резервни части · от 1998
          </p>
          <h1 className="font-display font-semibold text-ink text-4xl md:text-5xl leading-tight mb-6">
            Намери правилните части за{" "}
            <em className="not-italic text-accent">твоя автомобил</em>
          </h1>
          <p className="text-ink-2 text-base leading-relaxed mb-8 max-w-lg">
            Над половин милион артикула от водещи производители. Изберете
            вашия автомобил и вижте само съвместимите части — без грешки,
            без губене на време.
          </p>

          <dl className="grid grid-cols-4 gap-4">
            {STATS.map((stat) => (
              <div key={stat.label}>
                <dt className="font-display font-semibold text-ink text-2xl">
                  {stat.value}
                </dt>
                <dd className="text-xs text-muted mt-1">{stat.label}</dd>
              </div>
            ))}
          </dl>
        </div>

        <VehicleFinderCard />
      </div>
    </section>
  );
}
