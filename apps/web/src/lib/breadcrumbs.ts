/**
 * The contract between a trail builder and the `Breadcrumbs` component, kept
 * apart from both so a second builder does not have to reach into the first.
 */
export interface BreadcrumbItem {
  key: string;
  label: string;
  /** Absent on the crumb standing for the page already on screen. */
  href?: string;
}

/**
 * Drops the link from the last crumb. It stands for the page being shown, and
 * a link back to the current page reads as a way out of it.
 */
export function markLastAsCurrent(crumbs: BreadcrumbItem[]): BreadcrumbItem[] {
  return crumbs.map((crumb, index) =>
    index === crumbs.length - 1 ? { ...crumb, href: undefined } : crumb,
  );
}
