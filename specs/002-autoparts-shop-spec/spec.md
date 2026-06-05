# Feature Specification: Autoparts Shop — Online Store

**Feature Branch**: `002-autoparts-shop-spec`

**Created**: 2026-06-03

**Status**: Draft

**Input**: Full product specification for a Bulgarian automotive parts e-commerce shop serving B2C customers and professional mechanics (B2B), integrated with an existing Spring Boot backoffice.

---

## Overview
An online shop extending a Bulgarian automotive parts retailer's physical business to digital channels. The shop does not hold its own inventory — all stock and pricing data comes from suppliers via the existing backoffice system, which is the single authority on availability, price, and supplier routing. The shop enables vehicle-first part discovery, accurate live pricing, self-service ordering, and gives the backoffice operator full visibility of online orders without adopting a separate fulfilment system.


---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Vehicle-First Part Discovery (Priority: P1)

A customer who does not know part numbers selects their vehicle (make, model series, year/engine variant) and browses compatible parts by category. The system shows all matching parts regardless of stock — parts with no supplier stock are labelled "currently unavailable". Parts with stock show the best available price across all suppliers. The customer can switch their vehicle at any time without losing their cart.

**Why this priority**: This is the primary discovery path for B2C customers. Without it the shop cannot serve the vast majority of retail visitors who do not know part numbers.

**Independent Test**: A tester can open the shop, select a vehicle, navigate to a category, and verify that parts list correctly — this delivers the core browsing value independently of checkout.

**Acceptance Scenarios**:

1. **Given** an anonymous or logged-in visitor on the homepage, **When** they select a vehicle manufacturer, **Then** only model series belonging to that manufacturer are shown in the next step.
2. **Given** a manufacturer is selected, **When** the customer selects a model series, **Then** only year/engine variants for that series are shown and the previous step cannot be skipped.
3. **Given** a vehicle is fully selected, **When** the customer navigates to a category (e.g., Brakes), **Then** all parts compatible with that vehicle are listed, including those without current stock (labelled "Currently Unavailable").
4. **Given** a part listing, **When** a part has stock across multiple suppliers, **Then** only the lowest price is shown; no supplier identity is exposed to the customer.
5. **Given** a vehicle is selected, **When** the customer closes and reopens the browser tab (same session), **Then** their vehicle selection is still active and no re-selection is required.
6. **Given** a logged-in customer, **When** they return in a new browser session, **Then** their most recently selected vehicle is pre-populated.
7. **Given** a customer has a vehicle selected and has items in their cart, **When** they switch to a different vehicle, **Then** their cart is retained and they are shown only a confirmation prompt before switching.
8. **Given** a vehicle is selected and a category has no matching parts at all, **When** the customer navigates to that category, **Then** they see an empty-state message explaining no parts are listed for their vehicle in this category, with a suggestion to contact the store.
9. **Given** the vehicle selector on a mobile device, **When** the customer interacts with it, **Then** it opens as a full-screen modal or bottom-sheet that does not require horizontal scrolling; each selector step is clearly labelled and the current selection is always visible.

---

### User Story 2 — Part Number Search (Priority: P1)

A customer or mechanic who knows a part number (or a fragment of one) types it into the search bar. The system normalises the input — stripping brand names, extra spaces, hyphens, and case differences — and returns matching parts. If the customer also has a vehicle selected, results indicate whether each part fits their vehicle.

**Why this priority**: Mechanics and experienced customers rely entirely on number search. It is the fastest path for repeat buyers and B2B accounts.

**Independent Test**: A tester can type a known part number into the search bar and verify that the correct part appears — this works independently of vehicle selection or account state.

**Acceptance Scenarios**:

1. **Given** a search input of "WL6340 WIX" (brand name attached), **When** the customer submits, **Then** the system strips the brand token and searches for "WL6340".
2. **Given** a search input of " wl-6340 " (lowercase, hyphen, surrounding spaces), **When** submitted, **Then** the system normalises to "WL6340" and returns the same results as an exact match.
3. **Given** a normalised part number that exactly matches one article in the catalogue, **When** the search is submitted, **Then** the customer is taken directly to that part's detail page.
4. **Given** a part number that matches multiple articles (e.g., cross-references), **When** searched, **Then** a results page lists all matching parts with brand, description, and best price; the customer chooses which to view.
5. **Given** a part number with no match in the catalogue, **When** searched, **Then** the customer sees a "no results" message with a suggestion to search by vehicle, browse categories, or contact the store — not a blank page.
6. **Given** the customer starts typing in the search bar (minimum 3 characters), **When** typing pauses briefly, **Then** an autocomplete dropdown appears showing up to 8 matching part numbers or article names without requiring a full submit.
7. **Given** a customer with a vehicle selected searches a part number that is in the catalogue, **When** results are shown, **Then** each result includes a "Fits your vehicle" or "Does not fit your vehicle" indicator.

---

### User Story 3 — Part Detail Page (Priority: P1)

A customer viewing a specific part sees all relevant information: part number, brand, description, technical specifications, images, OEM cross-references, compatible vehicles, and real-time availability and price. They can add the part to their cart from this page.

**Why this priority**: The detail page is the conversion point. Every other search path leads here. Without it, discovery has no outcome.

**Independent Test**: A tester can navigate directly to a part URL and verify all information renders correctly with accurate availability status — independently testable without completing a purchase.

**Acceptance Scenarios**:

1. **Given** a logged-in B2C customer viewing a part detail page, **When** the page loads, **Then** they see the standard retail price with VAT clearly labelled, the part's availability status, and an "Add to Cart" button.
2. **Given** a logged-in mechanic viewing the same page, **When** the page loads, **Then** they see their trade price (not the retail price) with VAT labelled; they do not see the retail price.
3. **Given** an anonymous visitor viewing a part detail page, **When** the page loads, **Then** they can see the price and part details and the "Add to Cart" button is shown and functional; the item is added to a browser-local cart stored in the visitor's session.
4. **Given** a part that is out of stock at all suppliers, **When** the detail page loads, **Then** no "Add to Cart" button is shown; instead an "Out of Stock" indicator appears with a suggestion to check back later or contact the store.
5. **Given** a part with low stock (last few units), **When** the page loads, **Then** the availability indicator shows "Low Stock" with an estimated delivery time if known.
6. **Given** a customer with a vehicle selected viewing a part detail page, **When** the page loads, **Then** a clearly visible "Fits your [Vehicle Name]" or "Does not fit your vehicle" badge is shown near the part title.
7. **Given** a customer clicks "Add to Cart", **When** the action completes, **Then** a cart sidebar/drawer opens or updates, showing the item was added and the current cart total; the customer is not navigated away from the page.
8. **Given** the quantity selector on the detail page, **When** a customer changes the quantity before adding to cart, **Then** the correct quantity is added in one action.
9. **Given** a part detail page, **When** the page loads, **Then** a "Related Parts" section shows other parts in the same category that also fit the customer's selected vehicle (if a vehicle is selected) or the same vehicle compatibility in general.

---

### User Story 4 — Cart Management (Priority: P1)

A logged-in customer accumulates parts in their cart, edits quantities, removes items, and reviews the total with VAT breakdown before proceeding to checkout. The cart is kept in sync with live stock — if a part's availability changes between adding it and checkout, the customer is notified before being allowed to proceed.

**Why this priority**: The cart is the bridge between discovery and purchase. Without reliable cart management, no order can be placed.

**Independent Test**: A tester can add multiple parts, adjust quantities, remove one, and verify the totals recalculate correctly — without proceeding to checkout.

**Acceptance Scenarios**:

1. **Given** a logged-in customer who added items to the cart in a previous session, **When** they return and open the cart, **Then** all previously added items are still present with correct quantities and current prices.
2. **Given** a logged-in customer's cart is stored server-side, **When** they log in on a different device, **Then** their cart is the same as on their other device.
3. **Given** an item in the cart, **When** the customer changes its quantity, **Then** the line total and cart total update immediately; no page reload is required.
4. **Given** an item in the cart, **When** the customer removes it, **Then** it disappears from the cart and the total updates; if the cart becomes empty, an empty-cart state is shown with a prompt to browse.
5. **Given** the cart contains items, **When** the cart is displayed, **Then** each line shows: part image, part number, brand, description, quantity, unit price (with VAT label), line total; the cart footer shows subtotal, VAT amount, and grand total.
6. **Given** a customer navigating browsing pages (not checkout), **When** they open the cart, **Then** it appears as a sidebar/drawer without leaving the current page; a full cart page is accessible via a dedicated link.
7. **Given** the customer clicks "Proceed to Checkout", **When** the system performs the pre-checkout availability check, **Then** if any item has gone out of stock since being added, the customer is shown exactly which items are affected and asked to remove them before continuing.
8. **Given** a logged-in mechanic, **When** viewing the cart, **Then** a "Save Cart" option allows them to name and store the cart for later without placing an order; saved carts are accessible from their account.
9. **Given** a saved cart, **When** the mechanic reopens it, **Then** prices are refreshed to current live prices before display.

---

### User Story 5 — Checkout Flow (Priority: P1)

A logged-in customer completes a purchase by providing a delivery address, selecting a shipping method and payment option, reviewing a live-confirmed order summary, and paying. The system verifies availability and price in real time before charging. On success, the customer receives an on-screen confirmation and a confirmation email.

**Why this priority**: Checkout is the core transaction. Without it the shop generates no revenue.

**Independent Test**: A tester can complete a full end-to-end checkout with a test payment and verify that an order is created and confirmation is received.

**Acceptance Scenarios**:

1. **Given** a customer at checkout step 1, **When** they enter a delivery address, **Then** the address form validates Bulgarian address fields (city, postcode, street) before allowing progression.
2. **Given** a valid address, **When** the customer reaches the shipping step, **Then** they see available courier options (Econt, Speedy) with calculated shipping costs and estimated delivery times displayed per option.
3. **Given** an order total below the cash-on-delivery threshold, **When** the payment step is reached, **Then** Cash on Delivery is offered as a payment option alongside Stripe card payment and myPOS card payment.
4. **Given** an order total at or above the cash-on-delivery threshold, **When** the payment step is reached, **Then** Cash on Delivery is not offered; only card payment options are shown.
5. **Given** the customer reaches the payment step, **When** the system performs the pre-payment availability and price confirmation, **Then** if any item's price has changed since the cart was built, the customer is shown the exact price differences and must confirm before payment is taken.
6. **Given** the customer reaches the payment step, **When** any item is found to be out of stock at this moment, **Then** the customer cannot proceed until the affected item is removed; the order MUST NOT be placed for an unavailable part.
7. **Given** a customer completes payment successfully, **When** the payment is confirmed, **Then** they are shown an order confirmation screen with order reference number, full item list, total paid, and estimated delivery timeframe.
8. **Given** a successful payment, **When** the order confirmation email is sent, **Then** it contains the same order details shown on screen plus the delivery address and chosen courier.
9. **Given** a payment attempt that fails (declined card, timeout), **When** the failure occurs, **Then** the customer is shown a clear error message and returned to the payment step with their cart and all entered data intact — nothing is lost.
10. **Given** an anonymous visitor who has items in their cart, **When** they click "Proceed to Checkout", **Then** they are redirected to the login/registration page with their intended destination preserved; after login, their cart items are merged into their account cart and checkout continues. They are not offered anonymous checkout. [See Assumptions for business justification.]

---

### User Story 6 — Order Tracking (Priority: P2)

A customer who has placed an order can see its current status in plain language, review a history of all past orders, and receive live status updates without refreshing the page. They receive an email notification at each status change.

**Why this priority**: Post-purchase visibility reduces customer support contacts and builds trust. Required for mechanic B2B accounts who need to communicate status to their workshop clients.

**Independent Test**: A tester can navigate to the order detail page of a known order and verify the status displays correctly — independently of placing a new order.

**Acceptance Scenarios**:

1. **Given** a logged-in customer on their order history page, **When** the page loads, **Then** all past orders are listed in reverse chronological order, each showing order reference, date, item count, total, and current status.
2. **Given** the order history list, **When** the customer selects an order, **Then** the detail page shows the full item list, each item's price and quantity, delivery address, chosen courier, courier tracking reference (if dispatched), payment method, and a timeline of status changes.
3. **Given** a customer on the order detail page while their order is being processed, **When** the backoffice operator updates the order status, **Then** the page updates automatically without the customer needing to refresh — the new status appears within a few seconds.
4. **Given** an order that progresses through status changes, **When** each transition occurs, **Then** the customer sees these plain-language labels on the detail page and timeline:
   - **Processing** — "Your order has been received and we are preparing it"
   - **Items Prepared** — "Your parts have been sourced and are ready for dispatch"
   - **On the Way** — "Your order has been handed to the courier" (with tracking reference and courier name)
   - **Delivered** — "Your order has been delivered"
5. **Given** each status transition, **When** the status changes, **Then** an email notification is sent to the customer with the new status label, plain-language description, and order reference.
6. **Given** an order in **Processing** status, **When** the customer requests cancellation, **Then** they can submit a cancellation request via a clearly labelled button; the backoffice operator receives the request and processes it manually; the customer is informed that cancellation is subject to review.
7. **Given** an order that has reached **On the Way** or **Delivered** status, **When** the customer views the detail page, **Then** the cancellation option is not shown; cancellation is no longer possible.

---

### User Story 7 — Customer Account Registration and Management (Priority: P2)

A new visitor creates an account, verifies their email, and manages their profile including saved delivery addresses. An existing customer can log in, reset a forgotten password, and access their order history.

**Why this priority**: Account management is a prerequisite for cart persistence, checkout, and order tracking. Required before B2B mechanic functionality.

**Independent Test**: A tester can complete registration, receive a verification email, log in, and update their profile — independently of placing any order.

**Acceptance Scenarios**:

1. **Given** a new visitor on the registration page, **When** they submit the form with first name, last name, email, phone number, and a password meeting requirements, **Then** a verification email is sent and they are shown a message to check their inbox.
2. **Given** a registration password, **When** validated, **Then** it must be at least 8 characters and contain at least one letter and one number; the requirements are shown to the customer before they submit.
3. **Given** the customer clicks the verification link in the email, **When** the link is valid and not expired, **Then** their account is activated and they are logged in.
4. **Given** a customer on the login page, **When** they submit correct credentials, **Then** they are logged in and redirected to their intended destination (or the homepage if none).
5. **Given** a customer who has forgotten their password, **When** they request a reset using their registered email, **Then** a password reset email is sent with a single-use link; the link expires after 1 hour.
6. **Given** a logged-in customer in their account settings, **When** they add a delivery address, **Then** it is saved and listed as an available address at checkout; they can have multiple saved addresses.
7. **Given** a logged-in customer in their account settings, **When** they edit or delete a saved address, **Then** the change takes effect immediately and is reflected at next checkout.
8. **Given** a logged-in customer in their account area, **When** they navigate to "Order History", **Then** they see all their past orders (same as Story 6 order history page).

---

### User Story 8 — Mechanic Trade Account Application (Priority: P2)

A professional mechanic or workshop owner applies for a trade (B2B) account by providing their business details. Their account enters a pending state. The backoffice operator reviews and approves or rejects the application. On approval, the mechanic sees trade pricing everywhere in the shop.

**Why this priority**: Mechanic accounts are a key revenue channel (higher volume, repeat orders). The approval workflow must exist before mechanics can benefit from trade pricing.

**Independent Test**: A tester can submit a mechanic application, and a second tester acting as the operator can approve it — verifiable without placing an order.

**Acceptance Scenarios**:

1. **Given** a registered customer in their account area, **When** they navigate to "Apply for Trade Account", **Then** they see a form requesting: business name, EIK (Bulgarian business registration number), VAT number (optional), business address, and contact phone for the business.
2. **Given** the mechanic submits the trade application form, **When** it is submitted, **Then** their account is flagged as "Pending Approval" and they see a clear on-screen message that their application is under review.
3. **Given** a mechanic in "Pending Approval" state browsing the shop, **When** they view parts and prices, **Then** they still see standard retail prices (trade pricing is not active until approved).
4. **Given** the backoffice operator views the pending applications list, **When** they approve an application, **Then** the mechanic's account is upgraded to the Mechanic role and they receive an email notifying them that their trade account is active.
5. **Given** the backoffice operator rejects an application, **When** the rejection is submitted, **Then** the mechanic receives an email with a reason (entered by the operator) and their account returns to a standard customer state.

---

### User Story 9 — Mechanic B2B Shopping Experience (Priority: P2)

An approved mechanic browsing and purchasing in the shop always sees their trade price, can order in larger quantities, can reference orders by vehicle or job context, and can save carts across sessions.

**Why this priority**: Mechanic accounts are a major revenue stream. Without the distinct pricing and workflow, the trade offering has no value proposition.

**Independent Test**: A tester with a mechanic account can browse the shop and confirm trade prices are shown universally, then complete a purchase — independently testable once the account is approved.

**Acceptance Scenarios**:

1. **Given** an approved mechanic browsing any part listing or detail page, **When** the page loads, **Then** only their trade price is shown — the standard retail price is never displayed to them.
2. **Given** a mechanic adding a part to their cart, **When** they set a quantity above the standard retail maximum (if any limit exists), **Then** the system allows the higher quantity up to available stock.
3. **Given** a mechanic viewing their order history, **When** they filter or search by vehicle registration or job reference, **Then** matching orders are returned; mechanics can tag an order with a vehicle registration at checkout.
4. **Given** a mechanic in their account area, **When** they view "Saved Carts", **Then** they can see all named saved carts, open any one, and either resume it or convert it to a new order.
5. **Given** a mechanic who has saved multiple vehicles for regular customer vehicles, **When** they return to the shop, **Then** they can select a saved vehicle directly without re-entering the full make/model/year flow.

---

### User Story 10 — Backoffice Fulfilment Dashboard (Priority: P3)

The backoffice operator sees all incoming online orders, manages a fulfilment task list for suppliers without API integration, monitors auto-ordered Intercars items, and reviews a daily summary. They take explicit actions ("Mark as Ordered", "Mark as Confirmed") that trigger downstream status updates to the customer.

**Why this priority**: Without fulfilment visibility, the operator cannot process orders. However this lives in the existing backoffice system and does not block the customer-facing shop from launching first.

**Independent Test**: A tester can place an online order and an operator can view it in the dashboard and advance its status — independently of any other backoffice feature.

**Acceptance Scenarios**:

1. **Given** a new online order is placed, **When** the order is confirmed, **Then** the dashboard shows it within 60 seconds in the "New Orders" section; optionally, the operator's browser tab updates with an unread count badge.
2. **Given** the fulfilment task list, **When** the operator views it, **Then** each task shows: customer order reference, part number and description, quantity, assigned supplier name, time elapsed since the order was placed.
3. **Given** a task for a manual (non-API) supplier, **When** the operator places the order with the supplier externally and clicks "Mark as Ordered", **Then** the task moves to "Awaiting Confirmation" state and the customer order status updates to "Processing".
4. **Given** a task in "Awaiting Confirmation" state, **When** the operator receives the stock and clicks "Mark as Confirmed", **Then** the task moves to a completed state and the order progresses to "Items Prepared" — which triggers the customer notification email.
5. **Given** an order that was auto-routed to Intercars (API-integrated supplier), **When** the operator views it in the dashboard, **Then** it appears in a separate "Auto-Ordered" section with the Intercars reference and current API-reported status; no operator action is required.
6. **Given** the daily summary panel, **When** the operator views it, **Then** they see the count of: orders received today, orders currently pending fulfilment, orders dispatched today, orders delivered today.

---

### Edge Cases

- What happens when a vehicle's model year spans a production range and the customer's exact year matches two overlapping variants? Show all applicable variants and allow the customer to select the most specific match; if uncertain, suggest contacting the store.
- What happens when a part has no image? Show a standardised "no image available" placeholder that is clearly distinct from an actual product image.
- What happens when a part's price changes between the cart being built and the final pre-payment check? Show the old price, the new price, and the difference; require the customer to explicitly confirm before proceeding.
- What happens when a courier API is unavailable at checkout? Fall back to displaying standard flat-rate shipping estimates with a note that the exact cost will be confirmed; do not block checkout.
- What happens when a customer's email verification link has expired? Show a clear message with a one-click option to re-send a fresh link.
- What happens when two sessions for the same logged-in customer both modify the cart simultaneously? The last-write wins and both sessions see the current server state on next load; no silent data loss.
- What happens when a mechanic's trade account is suspended after they have items in their cart? At next cart load their prices revert to retail; they are notified by a banner that their trade account status has changed.
- What happens when the backoffice availability API is unreachable during checkout? Checkout is blocked; the customer sees a generic "Unable to confirm availability" message and is invited to try again shortly — they are never charged in an uncertain state.

---

## Requirements *(mandatory)*

### Functional Requirements

**Part Discovery**

- **FR-001**: The system MUST present a vehicle selection flow in the order: manufacturer → model series → year/engine variant. Each step MUST filter the options available in the next step. Steps cannot be skipped.
- **FR-002**: The system MUST display all catalogue parts compatible with the selected vehicle, regardless of current supplier stock. Parts with no available stock MUST be labelled "Currently Unavailable".
- **FR-003**: For parts with available stock, the system MUST display the lowest price available across all suppliers that currently have stock. The supplier name MUST NOT be displayed to the customer.
- **FR-004**: The system MUST persist the customer's selected vehicle for the duration of the session. For logged-in customers, the selection MUST persist across sessions.
- **FR-005**: The system MUST allow the customer to change or clear the selected vehicle at any time from any page.
- **FR-006**: The system MUST support part number search that normalises input by: stripping leading/trailing whitespace, removing brand name tokens, collapsing internal spaces, removing hyphens, and converting to uppercase before matching.
- **FR-007**: The search MUST provide autocomplete suggestions when the input is 3 or more characters, returning up to 8 suggestions without requiring a full form submit.
- **FR-008**: When a part number resolves to a single article, the system MUST navigate directly to that article's detail page. When multiple articles match, the system MUST show a results list.
- **FR-009**: When a part number search returns no results, the system MUST show a non-empty-state page with navigation options and a contact-the-store prompt.
- **FR-010**: When a vehicle is selected and a part number search is performed, each result MUST indicate whether the part is compatible with the selected vehicle.

**Part Detail**

- **FR-011**: The part detail page MUST display: part number, brand, description, all available images (or a placeholder if none), technical specifications, OEM cross-reference numbers, list of compatible vehicles, availability status, price(s), and an add-to-cart interaction.
- **FR-012**: Availability MUST be communicated as one of: "In Stock", "Low Stock" (with estimated delivery time), or "Out of Stock".
- **FR-013**: For B2C customers and anonymous visitors, the standard retail price (inclusive and exclusive of VAT) MUST be shown. For approved mechanic accounts, only the trade price (inclusive and exclusive of VAT) MUST be shown.
- **FR-014**: An "Add to Cart" button MUST only be shown when the part has available stock. Out-of-stock parts MUST show an informational state instead.
- **FR-015**: Anonymous visitors MUST be able to add items to a browser-local cart. The local cart MUST be persisted in the browser for the duration of their session. When an anonymous visitor attempts to proceed to checkout, they MUST be redirected to login/registration with their cart and intended destination preserved. On successful login, the local cart MUST be automatically merged into their account cart before checkout continues.
- **FR-016**: When a vehicle is selected, the part detail page MUST display a vehicle compatibility indicator ("Fits your [vehicle]" or "Does not fit your vehicle").
- **FR-017**: The detail page MUST show a "Related Parts" section containing other parts compatible with the same vehicle in the same category.

**Cart**

- **FR-018**: The cart MUST be persisted server-side for logged-in customers so it is consistent across devices and browser sessions.
- **FR-019**: The anonymous browser-local cart and the server-side account cart are distinct stores. On login, every item in the local cart MUST be merged into the account cart (quantity summed for duplicate articles). After merge, the local cart is cleared. This merge MUST happen before the customer reaches the checkout step.
- **FR-020**: The cart display MUST show per-line: part image, part number, brand, description, quantity, unit price (ex-VAT and inc-VAT), and line total. The cart footer MUST show subtotal, VAT amount, and grand total.
- **FR-021**: The customer MUST be able to change item quantities and remove items from the cart without leaving the cart view.
- **FR-022**: Before proceeding to checkout, the system MUST perform a live availability check. Any item found to be out of stock MUST be flagged; the customer MUST be required to remove flagged items before checkout can proceed.
- **FR-023**: Mechanic accounts MUST be able to save a named cart and retrieve it later from their account area.
- **FR-024**: When a mechanic reopens a saved cart, prices MUST be refreshed to current live prices before display.

**Checkout**

- **FR-025**: Checkout MUST be restricted to logged-in customers. Anonymous visitors attempting to proceed to checkout MUST be redirected to login/registration with their intended destination preserved.
- **FR-026**: The checkout flow MUST collect, in order: delivery address, shipping method, payment method, and a final order review before payment.
- **FR-027**: The delivery address form MUST validate Bulgarian address fields: city/town, postcode (4-digit Bulgarian format), street name, and street number. A house/apartment number field MUST be optional.
- **FR-028**: Shipping methods MUST include at least Econt and Speedy courier delivery. Each option MUST show the calculated shipping cost and an estimated delivery window.
- **FR-029**: Payment methods MUST include: Stripe (international card), myPOS (card payment — the existing merchant POS provider, supports all Bulgarian bank-issued cards), Cash on Delivery. Cash on Delivery MUST NOT be offered when the order total exceeds the configured COD threshold.
- **FR-030**: Immediately before payment is initiated, the system MUST perform a real-time confirmation of every item's availability and current price against the live backoffice data. This check MUST NOT use any cached price data.
- **FR-031**: If the pre-payment check reveals a price change, the customer MUST be shown the old price, the new price, and the difference for each affected item, and MUST explicitly confirm before payment proceeds.
- **FR-032**: If the pre-payment check reveals an item is out of stock, the customer MUST NOT be charged; the checkout flow MUST halt and prompt the customer to remove the affected item.
- **FR-033**: If payment fails, the customer's cart, address, and all entered checkout data MUST be preserved so they can retry without re-entering information.
- **FR-034**: On successful payment, the system MUST display an on-screen order confirmation with: order reference, item list, total charged, payment method, delivery address, and estimated delivery timeframe.
- **FR-035**: On successful payment, a confirmation email MUST be sent to the customer containing the same details as the on-screen confirmation.
- **FR-036**: VAT MUST be shown as a separate line item on all order summaries and confirmation documents. VAT rate is 20%. All displayed amounts are in EUR, formatted via `formatPrice(cents)` from `@vp-parts-shop/shared`.

**Order Tracking**

- **FR-037**: A logged-in customer's order history page MUST list all their past orders in reverse chronological order, each showing: order reference, date, item count, order total, and current status.
- **FR-038**: The order detail page MUST show: full item list, quantities and prices, delivery address, shipping method, courier name, courier tracking reference (once dispatched), payment method, and a timeline of status transitions with timestamps.
- **FR-039**: The order detail page MUST reflect status changes in real time. The customer MUST NOT need to refresh the page to see a new status.
- **FR-040**: Order status MUST be communicated to the customer using the following four plain-language states:
  - **Processing**: "Your order has been received and we are preparing it"
  - **Items Prepared**: "Your parts have been sourced and are ready for dispatch"
  - **On the Way**: "Your order has been handed to the courier" (with tracking reference)
  - **Delivered**: "Your order has been delivered"
- **FR-041**: An email notification MUST be sent to the customer when the order transitions to each of the four status states.
- **FR-042**: A cancellation request option MUST be shown on orders in **Processing** status. Orders in **Items Prepared**, **On the Way**, or **Delivered** status MUST NOT show the cancellation option.

**Customer Accounts**

- **FR-043**: Registration MUST require: first name, last name, email address, phone number, and password. Email MUST be unique across all accounts.
- **FR-044**: Passwords MUST be at least 8 characters and contain at least one letter and one digit. Password requirements MUST be displayed to the customer before submission.
- **FR-045**: Email verification MUST be required before an account can be used. Verification links MUST expire after 24 hours. The customer MUST be able to request a new link if theirs has expired.
- **FR-046**: Password reset links MUST expire after 1 hour and MUST be single-use.
- **FR-047**: Customers MUST be able to save multiple delivery addresses and select among them at checkout.
- **FR-048**: The account area MUST provide access to: profile details, saved addresses, order history, saved carts (mechanics only), and trade account application or status.

**Mechanic Accounts**

- **FR-049**: Any registered customer MUST be able to apply for a trade account by providing: business name, EIK, optional VAT number, business address, and business contact phone.
- **FR-050**: A mechanic application MUST enter "Pending Approval" state until the backoffice operator acts on it.
- **FR-051**: While in "Pending Approval" state, the customer MUST see standard retail prices and MUST NOT have access to trade pricing.
- **FR-052**: On operator approval, the account MUST be upgraded to the Mechanic role and the customer MUST receive an activation email.
- **FR-053**: On operator rejection, the account returns to standard customer state and the customer MUST receive an email containing the operator's stated reason.
- **FR-054**: Approved mechanics MUST see only trade prices everywhere in the shop — on listings, detail pages, cart, and all order documents.
- **FR-055**: Mechanics MUST be able to tag an order at checkout with a vehicle registration number and/or a job reference string; these are searchable in their order history.
- **FR-056**: Mechanics MUST be able to save vehicles (make/model/year) to their account for quick re-selection on future visits.

**Backoffice Fulfilment Dashboard**

- **FR-057**: The dashboard MUST display a live list of all online orders, updated within 60 seconds of placement.
- **FR-058**: Each fulfilment task MUST show: customer order reference, part number, part description, quantity, assigned supplier, and elapsed time since order placement.
- **FR-059**: For manual suppliers (no API integration), the operator MUST be able to mark each task as "Ordered" and later as "Confirmed (Stock Received)".
- **FR-060**: When a task is marked "Confirmed", the corresponding customer order MUST automatically advance to "Items Prepared" status, triggering the customer email notification.
- **FR-061**: Orders fulfilled via the Intercars API MUST be displayed in a separate "Auto-Ordered" section with their Intercars reference and current API status. No operator action MUST be required for these.
- **FR-062**: The daily summary MUST display: orders received today, orders pending fulfilment, orders dispatched today, orders delivered today.
- **FR-063**: The dashboard MUST display a pending mechanic applications count and provide access to the approval queue.
- **FR-064**: The operator MUST be able to approve or reject mechanic applications from within the dashboard, with a mandatory reason field for rejections.

---

### Key Entities

- **Article**: A catalogued automotive part. Identified by a normalised article number and brand. Has technical attributes, compatible vehicle list, images, and OEM cross-references. Does not carry stock or price — those belong to Supplier Stock.
- **Vehicle**: A specific make → model series → year/engine variant combination. Used as the primary filter for article compatibility lookup. Has a VehicleId value object.
- **Supplier Stock**: The stock and price record for one Article at one Supplier. Owned and maintained by the backoffice. The shop reads this read-only to determine availability and best price. Has a per-Article best price derived view.
- **Cart**: A named collection of Article quantities belonging to a Customer. Server-side for logged-in customers. May be anonymous (session) or named (mechanic saved carts).
- **Order**: A confirmed purchase. Has an order reference, belongs to a Customer, contains Order Lines, a delivery address, chosen shipping method, payment record, and a status machine (`PROCESSING → ITEMS_PREPARED → ON_THE_WAY → DELIVERED`). Terminal states: `CANCELLED`, `FULFILLMENT_FAILED`.
- **Order Line**: One Article at one quantity and one confirmed price within an Order.
- **Customer**: A registered user of the shop. Has a role: `CUSTOMER` or `MECHANIC`. Associated with saved addresses, order history, and optionally a Mechanic Profile.
- **Mechanic Profile**: The trade account details associated with a Customer: business name, EIK, VAT number, business address, business phone, approval status (`PENDING`, `APPROVED`, `REJECTED`).
- **Fulfilment Task**: The backoffice unit of work to source one Order Line from a specific Supplier. Has status: `PENDING → ORDERED → CONFIRMED`. Completion of all tasks for an Order advances the Order to `ITEMS_PREPARED`.
- **Delivery Address**: A saved address belonging to a Customer. Has: full name, city, postcode, street, street number, optional apartment/floor, phone number.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A first-time visitor can identify their vehicle and find compatible parts for a given category in under 90 seconds.
- **SC-002**: A returning mechanic can locate a known part by number, add it to cart, and reach the payment step in under 60 seconds.
- **SC-003**: The pre-payment availability and price confirmation completes in under 3 seconds so as not to interrupt the checkout flow.
- **SC-004**: Order status updates reach the customer's live order detail page within 10 seconds of the backoffice operator advancing the status.
- **SC-005**: 95% of part number searches that have a result return at least one match — normalisation handles all common messy-input patterns (brand tokens, case, hyphens, spaces).
- **SC-006**: Zero orders are placed for out-of-stock items or at an unconfirmed (cached) price. This is a hard business rule, not a performance target.
- **SC-007**: The shop is accessible and fully operable on a mobile device with a 4-inch or larger screen; no critical action requires a screen wider than 360px.
- **SC-008**: A backoffice operator can see a newly placed online order in the fulfilment dashboard within 60 seconds of the customer completing payment.
- **SC-009**: A mechanic trade account application can be submitted by a customer and approved by the operator within one business day using only the tools provided in the dashboard — no out-of-band communication required.
- **SC-010**: Cart recovery: if a payment fails, 100% of customers who retry within the same session find their cart, address, and payment details intact.

---

## Assumptions

- **Anonymous browsing and cart building is allowed; checkout requires an account.** Visitors can browse and add items to a browser-local cart without registering. Account creation (or login) is required only at the point of checkout. This is justified by three business reasons: (1) order tracking and fulfilment communication requires a verified email address; (2) the mechanic trade pricing system requires verified identity; (3) the backoffice operator needs a customer reference for fulfilment and support — anonymous orders have no way to notify the customer of delays or issues. The cart-first, auth-at-checkout pattern removes early friction without compromising any of these requirements.
- **COD threshold value is to be confirmed with the business owner before implementation.** Placeholder assumption: €200.00 (20 000 cents). The system MUST make this value configurable without a code change.
- **VAT rate is 20%** (Bulgarian standard rate). This value should be configurable for potential future rate changes.
- **Currency is EUR.** Bulgaria adopted the Euro; all prices, totals, and payment amounts are in EUR. All monetary values are stored and transmitted as integer cents (e.g. `1299` = €12.99).
- **Supplier stock data freshness**: the backoffice provides near-real-time stock data; the 5-minute browse cache is acceptable for part listing and detail pages but MUST NOT be used for the checkout confirmation.
- **TecDoc is the source of the vehicle catalogue and article compatibility data.** The shop does not maintain its own vehicle or article database.
- **Only Bulgarian delivery addresses are supported at launch.** International shipping is out of scope.
- **The shop operates in Bulgarian language only at launch.** Multi-language support is out of scope.
- **The backoffice operator works within the existing Spring Boot backoffice system.** No separate operator portal is built; the fulfilment dashboard is a new section within the existing tool.
- **Mechanic "saved vehicles" are stored as up to 10 vehicles per account** at launch; this limit can be raised without a structural change.
- **Real-time order status updates use a server-push mechanism** (the architecture specifies SSE). The customer's browser must remain on the order detail page; push notifications to the device are out of scope for v1.
