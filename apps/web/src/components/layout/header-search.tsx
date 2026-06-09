export function HeaderSearch() {
  return (
    <div className="flex-1 mx-4">
      <label htmlFor="header-search" className="sr-only">
        Търсене по номер, наименование или код
      </label>
      <div className="relative">
        <input
          id="header-search"
          type="search"
          placeholder="Търсене по номер (OEM), наименование или код…"
          className="w-full h-10 pl-10 pr-4 bg-bg-sunken border border-line rounded-lg text-sm text-ink placeholder:text-muted focus:outline-none focus:border-ink focus:bg-bg-card"
        />
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </div>
    </div>
  );
}
