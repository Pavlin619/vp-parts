import Link from "next/link";

export function SiteLogo() {
  return (
    <Link
      href="/"
      className="flex items-center gap-2 flex-shrink-0"
      aria-label="VP Parts — начало"
    >
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden="true">
        <rect width="36" height="36" rx="5" fill="#0B1220" />
        <path d="M10 10L18 26L26 10H22L18 18L14 10H10Z" fill="white" />
        <rect x="20" y="28" width="8" height="3" rx="1" fill="#FF5A1F" />
      </svg>
      <span className="font-display font-semibold text-ink text-base leading-none">
        VP <span className="font-normal text-muted">Parts</span>
      </span>
    </Link>
  );
}
