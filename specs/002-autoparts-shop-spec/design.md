# Design Reference: VP Parts

**Source**: Claude Design export — `https://api.anthropic.com/v1/design/h/Wo0SQHvnCyTsmCRQApAchw`

**Purpose**: This file is the canonical design reference for all frontend implementation tasks. Every component, page, and visual decision described here comes directly from the approved prototype. Implementors MUST match the visual output described here. Do not invent component patterns or visual styles outside this document.

**Locale**: Bulgarian (Cyrillic) — all UI labels are in Bulgarian.

---

## Design System Overview

| Attribute | Decision |
|---|---|
| Aesthetic | Light premium — off-white canvas, deep navy ink, sharp typography |
| Accent | Orange (#FF5A1F) |
| Density | Balanced — airy on landing, denser on listing/browse (mechanic-tool feel) |
| Layout | 12-column grid, 8px base spacing unit, `max-width: 1360px`, `padding: 0 24px` |
| Novelty | Conservative — proven patterns done excellently |
| Mobile | Full mobile-first support, tested at ≥ 360px viewport width |
| Language | Bulgarian Cyrillic at launch |

---

## Design Tokens

These map directly to `apps/web/tailwind.config.ts` and `apps/web/src/app/globals.css`.

### Colors

```css
/* Backgrounds */
--bg:         #F7F6F3   /* page canvas — off-white */
--bg-alt:     #FFFFFF   /* card/input surface */
--bg-sunken:  #EEECE6   /* recessed areas */

/* Ink (text/icon) */
--ink:        #0B1220   /* primary text, deep navy */
--ink-2:      #2A3242   /* secondary text */
--ink-3:      #5B6577   /* muted text, labels */
--ink-4:      #8B94A3   /* disabled, placeholder */

/* Borders */
--line:       #E2DFD6   /* default border */
--line-2:     #D3CFC2   /* stronger border, hover state */

/* Accent */
--accent:       #FF5A1F   /* primary CTA, badges, highlights */
--accent-hover: #E84A12   /* CTA hover */
--accent-soft:  #FFE9DF   /* accent background tint */

/* Semantic */
--ok:       #128B4B   /* in-stock, success */
--ok-soft:  #DDF1E3   /* in-stock background tint */
--warn:     #B26A00   /* low-stock, warning */
--danger:   #C3241C   /* error, out-of-stock */
--info:     #1F4FBF   /* informational */
```

**Tailwind mapping** (configure as CSS variables in `globals.css`, extend Tailwind theme):
- `bg-canvas` → `#F7F6F3`
- `bg-card` → `#FFFFFF`
- `text-ink` → `#0B1220`
- `text-muted` → `#5B6577`
- `accent` → `#FF5A1F`
- `ok` → `#128B4B`

### Typography

```css
--font-sans:    'Inter', -apple-system, BlinkMacSystemFont, sans-serif
--font-display: 'Space Grotesk', 'Inter', sans-serif   /* headings, part numbers, prices */
--font-mono:    'JetBrains Mono', ui-monospace, monospace  /* SKU codes, OEM numbers */
```

Load from Google Fonts: `Inter` (weights 400, 500, 600) + `Space Grotesk` (weights 400, 500, 600) + `JetBrains Mono` (weight 400).

Base: `font-size: 14px`, `line-height: 1.45`, `-webkit-font-smoothing: antialiased`, `font-feature-settings: "cv11", "ss01"`.

**Usage rules**:
- Body copy, labels, navigation → Inter (`font-sans`)
- Headings (`h1`–`h3`), prices, part numbers, statistics → Space Grotesk (`font-display`)
- SKU codes, OEM reference numbers, tech specs → JetBrains Mono (`font-mono`)
- Prices use `font-feature-settings: "tnum"` (tabular numerals) via `.num` class

### Spacing

8px base unit. Defined scale: `4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64px`.

### Border Radius

```css
--r-sm: 4px    /* badges, small elements */
--r-md: 8px    /* buttons, inputs, chips */
--r-lg: 12px   /* cards */
--r-xl: 16px   /* modals, large containers */
```

No "blobby" radii. Sharp, technical aesthetic. Never use `border-radius > 16px` except for pill-shaped chips (`border-radius: 999px`).

### Shadows

```css
--shadow-sm: 0 1px 0 rgba(11,18,32,0.04), 0 1px 2px rgba(11,18,32,0.04)
--shadow-md: 0 4px 12px rgba(11,18,32,0.06), 0 1px 2px rgba(11,18,32,0.04)
--shadow-lg: 0 16px 40px rgba(11,18,32,0.10), 0 2px 4px rgba(11,18,32,0.05)
```

Prefer `1px border` over shadows for cards. Shadows are used for overlays (modals, cart drawer).

---

## Component Library

### Buttons

All buttons: `height: 40px`, `padding: 0 16px`, `border-radius: var(--r-md)`, `font-weight: 500`, `font-size: 14px`, `transition: 120ms`.

| Variant | Class | Background | Text | Border |
|---|---|---|---|---|
| Primary CTA | `btn-primary` | `--accent` | white | none |
| Dark/Nav | `btn-dark` | `--ink` | white | none |
| Ghost | `btn-ghost` | transparent | `--ink` | `--line-2` |
| Soft | `btn-soft` | `--bg-alt` | `--ink` | `--line` |

Sizes: `btn-sm` (h:32, p:0 12, fs:13) · `btn-lg` (h:48, p:0 20, fs:15) · `btn-icon` (w:40, square, centered icon).

Active state: `transform: translateY(1px)`.

Hover on ghost/soft: border changes to `--ink-3`, bg to white.

### Inputs

```css
height: 40px; padding: 0 12px;
background: var(--bg-alt);
border: 1px solid var(--line);
border-radius: var(--r-md);
```
Focus ring: `border-color: var(--ink); box-shadow: 0 0 0 3px rgba(11,18,32,0.06)`.

### Search Bar (`.search-wrap`)

Full-width pill container with:
- Left icon: magnifying glass (18px)
- Freetext input with placeholder "Търсене по номер (OEM), наименование или код…"
- Right side: camera icon button (scan photo), barcode icon button, dark "Търси" button
- Used in both the main header and the vehicle selection modal

### Chips (`.chip`)

`height: 28px`, `padding: 0 10px`, `border-radius: 999px`, `border: 1px solid --line`, `bg: --bg-alt`, `font-size: 12px`, `font-weight: 500`.

Solid variant (`.chip-solid`): `bg: --ink`, `color: white`.

Used for: active filter tags, recently viewed vehicles.

### Badges (`.badge`)

`height: 20px`, `padding: 0 8px`, `border-radius: 4px`, `font-size: 11px`, `font-weight: 600`, `text-transform: uppercase`, `letter-spacing: 0.02em`.

| Variant | Class | Color |
|---|---|---|
| In Stock | `.badge-ok` | `--ok-soft` bg, `--ok` text |
| Low Stock / Warning | `.badge-warn` | `#FFF0D6` bg, `--warn` text |
| Promo / Accent | `.badge-accent` | `--accent-soft` bg, `--accent-hover` text |
| Brand tier OE | `.badge-ink` | `--ink` bg, white text |

### Cards (`.card`)

```css
background: var(--bg-alt);
border: 1px solid var(--line);
border-radius: var(--r-lg);  /* 12px */
```

No box-shadow on standard cards — border only.

### Part Image Placeholder (`.ph`)

When no product image is available:
```css
background: repeating-linear-gradient(135deg, transparent 0 6px, rgba(11,18,32,0.05) 6px 7px),
            var(--bg-sunken);
border: 1px solid var(--line);
```
Shows brand + SKU label in JetBrains Mono, 10px, uppercase. Visually distinct from real product images.

---

## Logo

SVG logo: navy square with rounded corners (rx:5), white "V" chevron path, orange accent rectangle. Paired with `VP` in Space Grotesk 600 and `Parts` in `--ink-3` weight 400, 16px.

Light variant: square fill white, text white — used on dark backgrounds (utility strip).

---

## Page Layouts

### Utility Strip (top of every page)

Dark navy bar above header. Left side: shipping threshold info, phone number, store locations (white/70% opacity, 12px, icons). Right side: "Професионален акаунт" / "Помощ" / language switcher.

### Header

Three-column layout inside `.container`:

**Left**: Logo + horizontal nav links (Каталог / Марки / Промоции / Сервиз)

**Center**: Full-width search bar (`.search-wrap`) — dominant, takes most horizontal space

**Right**: `VehiclePill` + account icon + wishlist icon + cart icon with badge count

#### VehiclePill

- **No vehicle selected**: dark button "Избери автомобил" with car icon
- **Vehicle selected**: pill showing `Make · ModelShort` (600 weight) / engine + years (12px, muted). X button clears vehicle. Clicking opens vehicle selector modal.

### Homepage / Landing

1. **Hero section** — two-column grid:
   - **Left**: eyebrow "Резервни части · от 1998", `h1` (display font, large, `<em>` on italic word), subtitle paragraph, stats row (4 stats in Space Grotesk with large numerals + small labels)
   - **Right**: `SelectorCard` (white card, `--r-xl`, shadow-md) with:
     - Title "Намери части за твоята кола"
     - Tab row: Ручно / VIN / Рег. №
     - Three step buttons (Марка / Модел / Двигател) — each has a number bubble, label, and dropdown-style button. Completed steps show checkmark + selected value. Disabled steps are grayed out.
     - Divider "или"
     - VIN input + camera scan button
     - Recent vehicles as chips
     - Primary CTA button (full-width, btn-lg, btn-primary)

2. **Category grid** — 12 category cards in a 4-column grid (3-column mobile). Each card: icon (28px in `--bg-sunken` square, r:8), category name (13px, 500), article count (muted, 12px). Clickable.

3. **Promo strip** — 2-3 promotional banners

4. **Trust strip / Brand wall** — brand logos

5. **Mobile preview** — 3 phone frames showing mobile versions of home, vehicle selector, and listing

### Vehicle Selector Modal

Full-screen overlay (`.modal-backdrop`). Modal card centered, white, `--r-xl`, shadow-lg.

**Header**: Car icon in navy square + title "Избери автомобил" + subtitle. Tab switcher: "Стъпка по стъпка" | "VIN". Close button.

**Wizard tab** (3-step):

Step indicator bar (`.wizard-steps`): 3 steps — Марка / Модел / Двигател. Active step highlighted. Completed steps show checkmark. Clicking a completed step goes back.

Left panel (`.wiz-col`):
- Search input (placeholder changes per step)
- Step 0 (Make): popular makes grid + full alphabetical list. Each item: make name + article count. Active item highlighted with navy background + white text.
- Step 1 (Model): filterable list. Each item: model name (bold) + years range (muted).
- Step 2 (Engine): list. Each item: engine code (600 weight) + specs (displacement / kW / hp) in display font + KBA code.

Right panel (`.wiz-preview`): live summary of current selection as selections are made. Shows make + model + engine specs. Confirm button activates once all 3 steps complete.

**VIN tab**: large VIN input (17 chars) + camera scan button + confirm.

### Category Browse Page

Two-column layout: sidebar + main content.

**Sidebar** (`.browse-side`):
- "Категории" section: vertical nav list, each item: name + count. Active item: accent left border + ink text.
- "Твоят автомобил" section (if vehicle selected): white card showing make/model (600) + engine (muted), "Промени" link in accent color.

**Main content**:
- Breadcrumbs
- Category title + subcategory cards grid (2-column). Each subcat card: name (600) + count.
- Top sellers list

### Parts Listing Page

Two-column layout: filters sidebar + article grid/list.

**Filters sidebar** (`.filters`):

- **Vehicle block** (if selected): navy background, accent-colored car icon, make/model/engine, "Промени" link. This block is always at the top when a vehicle is selected.
- **Наличност block**: "Само налични" checkbox, "Само съвместими" checkbox (only shown if vehicle selected).
- **Марка block**: checkboxes with brand name + count per brand.
- **Ниво block**: OE / AM tier filter chips.
- **Цена block**: range slider or min/max inputs.
- Active filters: chip row at top of results ("Изчисти всички" link).

**Results area**:
- Header row: article count + vehicle context ("съвместими с BMW 320d"), sort dropdown, grid/list toggle buttons.
- **Fit banner** (if vehicle selected): highlighted banner "Показваме само части съвместими с [vehicle]".
- Article cards (grid default, list toggle available):

**Grid card** (`.part-card`):
- Image area (placeholder if no image)
- Brand name + tier badge (OE/AM)
- Article name (600 weight)
- SKU in mono font (muted)
- Fit indicator badge if vehicle selected: "✓ Съвместима" (`badge-ok`) or "96% съвместимост"
- Price: large number in Space Grotesk, strikethrough old price if discounted. All prices in BGN/EUR.
- Stock badge: "В наличност" (`badge-ok`) / "Последни 3 бр." (`badge-warn`) / "Изчерпан" (danger text)
- Delivery estimate: "Доставка: Утре"
- "Добави в кошницата" button (btn-primary, full-width)

### Product Detail Page (PDP)

Three-column layout: gallery | info | buy box.

**Gallery** (left):
- Large main image / placeholder
- 4 thumbnail strip below, active thumb has accent border

**Info panel** (center):
- Brand name (600) + tier badge + star rating row
- `h1`: part name + line name in Space Grotesk
- SKU in mono, "Арт. № ... · Линия ..."
- **Specs block** (`.pdp-specs`): `<dl>` table — left labels, right values. Rows: Размер / Дебелина / Тип / Монтаж / Датчик / ABS / Гаранция / Произход
- **OEM numbers** (`.pdp-oem`): "OEM номера (съвместими)" label + tag cloud of OEM codes in mono font
- **Tab strip**: Описание | Съвместимост | Отзиви (N) | Документи
  - Compatibility tab: table with columns: Модел / Двигател / Години / KBA — left-aligned, tabular data
  - Description tab: two paragraphs of product copy

**Buy box** (right, sticky):
- Price in Space Grotesk (large, 600 weight). Old price strikethrough if discounted.
- Stock badge + delivery estimate
- Quantity stepper (−/+/input)
- "Добави в кошницата" btn-primary btn-lg (full-width)
- "Добави в любими" ghost button
- Vehicle fit indicator badge (prominent, near top of buy box)

### Cart Drawer

Slides in from right. Overlay backdrop.
- Header: "Кошница (N артикула)" + close button
- Item list: each item has thumbnail, name, brand, qty stepper, price, remove button
- Footer: subtotal ex-VAT + VAT amount + grand total (all in Space Grotesk)
- "Към плащане" btn-primary btn-lg (full-width)
- "Продължи пазаруването" ghost link

---

## Mobile Patterns

Three phone frames shown on landing — same design language scaled to mobile:

- **Home (mobile)**: compact header (logo + user icon + cart icon), search bar, vehicle pill (navy card), 2×4 category grid
- **Vehicle selector (mobile)**: full-screen, step-by-step same as desktop wizard but full-width, no preview panel
- **Listing (mobile)**: filter chips as a horizontal scroll strip instead of sidebar, card list view default

Breakpoint: adapt layout at `768px`. Vehicle selector becomes full-screen bottom sheet on mobile.

---

## Key UX Patterns

1. **Browse without login** — no auth gate on catalog, vehicle selection, or adding to cart (anonymous cart). Login prompt appears only at checkout.

2. **Vehicle pill persistence** — once selected, the vehicle pill is always visible in the header on every page. One click to change it. Selection persists in `localStorage` (session) and server-side for logged-in users.

3. **"Fits your car" is contextual, not mandatory** — if no vehicle is selected, parts show without fit indicator. If selected, every listing/card/PDP shows fit badge. Promotes vehicle selection as a value-add, not a gate.

4. **Out-of-stock items are still shown** — labelled "Изчерпан" with danger color but remain visible in listings. "Add to Cart" button is hidden for these.

5. **Low stock urgency** — "Последни N бр." in warn color on both listing cards and PDP buy box.

6. **Price display hierarchy**: Discounted price (large, ink) + old price (strikethrough, muted). All numbers in Space Grotesk. VAT always shown as a separate line at cart/checkout.

7. **Breadcrumbs** on every interior page: Начало > Category > Subcategory > Article. Each level is a clickable link except the last (current page).

---

## Implementation Notes for Developers

- **shadcn/ui primitives** map to these design tokens. Override via `tailwind.config.ts` — do not modify `src/components/ui/` files directly.
- **`cn()` always** for conditional Tailwind classes. No inline `style={{}}` except for truly dynamic CSS custom properties.
- **`formatPrice(cents)`** from `@vp-parts-shop/shared` is the only way to display any monetary value. Never format prices inline.
- **Space Grotesk for numerics** — wrap all prices, SKUs, part numbers, and statistics in a class that applies `font-family: var(--font-display)` + `font-feature-settings: "tnum"`.
- **JetBrains Mono for codes** — SKU codes, OEM reference numbers, KBA codes, VIN input.
- **1px borders, not shadows** for cards. Shadows only for floating overlays (modal, drawer, dropdown).
- **Images**: use `next/image` with explicit width/height. Use the striped diagonal `--bg-sunken` placeholder (not a generic gray box) when no product image is available.
- **Accessibility**: all interactive elements need `aria-label`. Vehicle selector modal traps focus. Search inputs use `role="combobox"` with autocomplete dropdown.
