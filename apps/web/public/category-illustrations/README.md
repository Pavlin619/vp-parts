# Category illustrations

One per TecDoc assembly-group root, registered by node id in
`src/lib/catalog/category-illustration.ts`. An unregistered root renders the
neutral tile instead, so a file that is missing is never a broken image.

## Provenance

Generated with ChatGPT. None of it is third-party work, so no licence travels
with these files and there is no author to credit. An image added later from an
outside source does carry one — record it here before registering it, and check
whether it obliges us to render a credit somewhere the visitor can see.

## Format

1000 px wide WebP at quality 80. The card slot tops out at 300 CSS px — see
`sizes` in `category-thumb.tsx` — so 1000 px already covers the widest variant
Next.js will generate from it, and a larger source only costs repository size.
