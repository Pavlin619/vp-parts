"use client";

import { SearchBar } from "@/components/catalog/search/search-bar";

/**
 * `order-last` below `md` drops the box onto its own full-width row while the
 * account actions stay up on the brand row. Rendering a second, mobile-only
 * copy would be the obvious alternative and is wrong twice over: `SearchBar`
 * holds the typed query in state, and its input carries a document-unique id.
 */
export function HeaderSearch() {
  return (
    <div className="order-last w-full min-w-0 md:order-none md:mx-4 md:w-auto md:flex-1">
      <SearchBar />
    </div>
  );
}
