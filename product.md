# Supreme International — Product Brief

A backend platform for a **corporate gifting & B2B commerce** business. It serves three distinct
buyer experiences over one product catalog, plus an admin back office and (in progress) a third-party
seller marketplace.

---

## What we're building

A single Express + TypeScript + MongoDB backend powering:

1. **B2B quotations** — corporate buyers and guests browse a catalog and request a priced quotation
   (no online payment); the admin follows up.
2. **Corporate employee gifting** — companies are onboarded, their employees get a private catalog
   and a wallet of admin-funded credits, and they place real orders.
3. **A seller marketplace** *(in progress)* — third-party sellers are vetted by the admin, upload
   products for approval, and earn a margin-adjusted payout on sales.
4. **Admin back office** — catalog, companies/employees, wallets, quotations, orders, and seller
   onboarding management.

---

## Who it's for

| Audience | What they do |
|---|---|
| **Guests** | Browse the public catalog, build a cart, request a quotation (must verify via OTP to generate one). |
| **B2B buyers** (verified users) | Everything guests do, plus quotation history and PDF downloads. |
| **Companies** (corporate clients, e.g. an enterprise gifting program) | Onboarded by the admin; get a private curated catalog, company-scoped coupons, and employees funded with wallet credits. |
| **Employees** (of a company) | Log in, shop their company's private catalog, and place orders paid with wallet credits + card (Razorpay). |
| **Sellers** *(in progress)* | Apply to the marketplace, get approved, upload products for review, and sell at an admin-set margin. |
| **Admin** (the operator / super-admin) | Manages the catalog, companies & employees, wallets, quotations, orders, coupons, and vets/manages sellers. |

---

## Functionality by area

### Catalog (shared foundation)
- Products with variants (SKU, price, MOQ, stock, attributes, flash-sale pricing), categories, and
  attribute-based filtering, search, featured/bestsellers, related products, and recently-viewed.
- Product **visibility**: `public` (everyone) or `company` (private to one company).

### B2B quotations (Phase 1)
- Guest/buyer cart that is **MOQ-aware** (surfaces per-item minimum-order-quantity).
- Quotation generation gated behind **OTP verification**; produces an itemized **PDF** (EJS →
  Puppeteer → Cloudflare R2) and a pre-filled **WhatsApp deep link** to send the quote to the admin.
- Admin enquiry management: list/filter quotations, update status, see download/enquiry analytics.

### Corporate companies & employees (Phase 2)
- **Companies & employee accounts (2a):** admin creates a company and invites employees (invite link
  → set password → active); employees log in via a **separate** path; admin can deactivate employees.
- **Per-company catalog (2b):** each company has a private catalog = admin-whitelisted public
  products/categories (live — future products in a granted category appear automatically) **plus**
  company-private products. Private products never leak into the public catalog.
- **Employee wallet (2c):** each employee has a credit balance (INR) with an immutable ledger; the
  admin tops up or adjusts it; debits are guarded so the balance can never go negative.
- **Employee ordering (2d):** employees check out their cart as a real order, paying with
  **auto-applied wallet credits + Razorpay** for any remainder, optionally with a **company-scoped
  coupon**. Wallet credits are reserved at checkout and refunded on cancel / payment failure
  (idempotently). Wallet-only orders confirm immediately; split orders confirm on the Razorpay webhook.

### Seller marketplace (Phase 3 — in progress)
- **3a — Seller onboarding** *(designed):* sellers self-apply (business details + credentials),
  creating a gated account; the admin reviews a queue and approves / rejects / suspends. The admin
  sets a per-seller **commission margin** (`marginPercent` — the % the platform keeps; seller payout
  = price × (1 − margin)).
- **3b — Product submission & approval** *(planned):* sellers upload products via a dashboard;
  submissions go through an admin moderation queue; approved products become live catalog products
  owned by the seller.
- **3c — Seller catalog management & public surfacing** *(planned).*
- **3d — Margin application, payouts & seller performance analytics** *(planned):* applying the margin
  per sale (buyer-facing breakdown, seller payout vs. admin cut), payout accounting, and an admin view
  of seller performance.

### Payments & orders
- Razorpay checkout for standard buyers and for employees' order remainders; orders move through
  pending → confirmed → processing → shipped → delivered (with cancel/refund). Stock is committed on
  payment capture; the webhook verifies the captured amount before confirming.

---

## Key design principles (how it's built)

- **Strict layered architecture:** Route → Validator → Auth middleware → Controller → Service →
  Repository → Model. Controllers are thin; only repositories touch the database.
- **Account-type-scoped identity:** one `User` model distinguishes `individual` (buyers), `employee`,
  and `seller`, each with its own scoped login path — an email can exist once per type.
- **No `populate`/relationships:** cross-entity data is snapshotted; references are plain ids resolved
  explicitly — keeping reads predictable.
- **Money safety:** wallet balances are ledger-derived with atomic, guarded updates; refunds are
  at-most-once; payment captures are amount-verified.
- **Test-driven:** every feature ships with unit + route tests (100+ tests across the suite).

---

## Status snapshot

| Phase | Area | Status |
|---|---|---|
| 1 | B2B quotation core | ✅ Shipped |
| 2a | Companies & employee accounts | ✅ Shipped |
| 2b | Per-company catalog visibility | ✅ Shipped |
| 2c | Employee wallet / credits | ✅ Shipped |
| 2d | Employee ordering (wallet + Razorpay) & company coupons | ✅ Shipped |
| 3a | Seller identity & onboarding | 📋 Designed |
| 3b | Seller product submission & approval | ⏳ Planned |
| 3c | Seller catalog management & public surfacing | ⏳ Planned |
| 3d | Margin application, payouts & seller analytics | ⏳ Planned |

Detailed designs and implementation plans for each phase live in
[`docs/superpowers/specs/`](docs/superpowers/specs/) and [`docs/superpowers/plans/`](docs/superpowers/plans/).
