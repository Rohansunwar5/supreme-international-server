# Phase 1 — B2B Quotation Core (Design Spec)

**Date:** 2026-06-11
**Scope:** Phase 1 B2B core only — product listing with filters & MOQ, guest browsing,
cart, automated quotation PDF, WhatsApp delivery to admin, and admin product/enquiry
management. Employee/company-scoped catalogs, coupons-for-employees, brand filtering,
admin catalogue generation, and the Phase 2 seller marketplace are **out of scope** for
this spec and will each get their own spec.

---

## 1. Goals

A corporate buyer (e.g. Mercedes) — or an unauthenticated guest — can browse a filtered,
MOQ-aware catalog, build a cart, and generate an itemized, priced quotation PDF. Generating
a quotation requires identity verification (OTP). The PDF is stored with a hosted URL, and a
pre-filled WhatsApp deep link lets the buyer send the quote to the admin. Admins manage
products (incl. MOQ) and incoming enquiries, and can see PDF-download / enquiry tracking.

### Success criteria
- Guest can browse + build a cart without logging in.
- Quotation generation is blocked until the requester is a verified user.
- Quotation PDF is itemized (product, SKU, attributes, qty, MOQ, unit price, line total),
  with subtotal / discount / total, stored in R2, and reachable via a hosted URL.
- Buyer receives a `wa.me` deep link pre-filled with the quote reference + PDF link to the
  admin number.
- MOQ is enforced (soft) at cart-add and at quotation generation.
- Admin can list/filter enquiries, update status, and see download/enquiry counts.

---

## 2. Architecture

Built entirely on the existing layered architecture and the strict project rules in
`codingPattenAndRule.md`: **Route → Validator → Auth Middleware → Controller → Service →
Repository → Model → response via `next()`**. Class-based services with DI for repositories,
custom error classes only, validators in `middlewares/validators`, config via
`config/index.ts`, Redis only via `CacheManager`. **No Mongoose `ref`/`populate`/relationships**
— all cross-entity reads are explicit repository calls; cross-entity data is snapshotted.

### Reused (as-is or lightly extended)
- `product` / `productVariant` / `category` / `attribute` — catalog & filters.
- `cart` + `cart.service` + `cart-session.middleware` — cart, price snapshots, coupon slot.
- `auth` (`auth.service`, OTP via WhatsApp/SMS/Email) — verification.
- `impressions` + `analytics.service` / `store-analytics.service` — admin tracking.
- `r2.util` (object storage), `multer.util`, EJS templating, `ses.util`.
- `admin.*` controllers/services — extended for product (MOQ) & enquiry management.
- `coupon.service` — re-validate/apply coupon discount at generation time.

### New
- `moq` field on `productVariant` (soft-enforced).
- `quotation` model + repository + service + controller + routes (core deliverable).
- `pdf.service` (EJS → Puppeteer → R2). One new dependency: `puppeteer`.
- `whatsapp.util` — builds a `wa.me` URL + pre-filled message (no paid API).
- `templates/quotation.ejs` — branded quote template.

### Quotation data flow
1. Guest/buyer browses filtered catalog → adds variants to cart (MOQ enforced).
2. Buyer requests quotation (`POST /quotations`).
3. **Verification gate:** verified user → proceed; guest/unverified → `403 VERIFICATION_REQUIRED`,
   frontend launches OTP; on verify, guest cart merges into user cart; buyer retries.
4. Service validates cart (non-empty, every line `qty >= moq`), snapshots line items with
   current variant prices, re-validates + applies coupon, computes totals, allocates a
   `quotationNumber`.
5. `pdf.service` renders EJS → HTML → Puppeteer → PDF buffer → uploads to R2.
6. Only after a PDF URL exists, persist the `Quotation` record (transactional: no dangling
   quotes without a PDF).
7. Build `wa.me` URL. Return `{ quotationId, quotationNumber, pdfUrl, whatsappUrl }`.

---

## 3. Data model changes

### 3.1 `productVariant` — add MOQ
```
moq: { type: Number, required: true, min: 1, default: 1 }
```
`default: 1` keeps existing variants valid (no migration). Soft-enforced at cart-add and
quotation generation; below-MOQ qty is rejected with a clear error.

### 3.2 `cart` — support guest carts
- Add `sessionId: { type: String }`; make `userId` optional.
- Replace the single unique index with partial-unique indexes: `userId` unique when present;
  `sessionId` unique when present.
- `cart.service` gains a **merge** step invoked on OTP verification: guest cart (by `sessionId`)
  merges into the user cart (dedupe by `variantId`, sum qty, re-validate MOQ), then guest cart
  is deleted.

### 3.3 New model: `quotation`
Immutable, fully-snapshotted record (no refs/populate):
```
quotationNumber   String, unique, human-readable (e.g. QT-2026-000123)
user              ObjectId (verified buyer; stored as plain ObjectId, no ref)
contact           { name, email, phoneNumber, isdCode, company? }   // snapshot
items             [{ variantId, productId, productName, sku,
                     attributeLabels[], unitPrice, qty, moq, lineTotal }]
subtotal          Number
couponCode?       String
discountAmount    Number, default 0
total             Number
currency          String, default 'INR'
pdfUrl            String        // R2 hosted URL
status            enum ['generated','sent','viewed','converted','archived'], default 'generated'
downloadCount     Number, default 0
lastDownloadedAt  Date
source            enum ['b2b'], default 'b2b'   // forward-compatible for later phases
createdAt/updatedAt (timestamps)
```
Indexes: `quotationNumber` (unique), `{ user: 1, createdAt: -1 }`, `{ status: 1, createdAt: -1 }`.

### 3.4 Reused without schema change
`product`, `category`, `attribute`, `coupon`, `user`, `impressions`, `order`. (`order`
conversion from a quotation is out of scope here.)

---

## 4. API surface

### 4.1 New service: `quotation.service.ts` (class-based, DI repositories)
- `generateQuotation({ user, cart })` — validate (non-empty, MOQ); snapshot line items at
  current prices; re-validate + apply cart coupon via `coupon.service`; compute
  subtotal/discount/total; allocate `quotationNumber` (atomic counter or nanoid-suffixed);
  call `pdf.service`; persist `Quotation`; build `wa.me` URL; return
  `{ quotationId, quotationNumber, pdfUrl, whatsappUrl }`.
- `recordDownload(quotationId)` — increment `downloadCount`, set `lastDownloadedAt`, emit
  impression event.
- `getQuotationPdf(quotationId, requesterId)` — authorize owner; return/stream from R2.
- Admin: `listQuotations(filter)`, `getQuotation(id)`, `updateStatus(id, status)`,
  `quotationAnalytics()`.

### 4.2 New service: `pdf.service.ts`
- `renderQuotationPdf(quotation)` — render `templates/quotation.ejs` → HTML → Puppeteer
  (single shared, lazily-launched browser instance reused across requests, `--no-sandbox`
  for container compatibility) → PDF buffer → `r2.util` upload → return URL. Browser health
  checked; relaunched if crashed. Failures logged via existing `winston` logger.

### 4.3 New util: `whatsapp.util.ts`
- `buildQuotationWhatsappUrl({ adminNumber, quotationNumber, total, pdfUrl })` →
  `https://wa.me/<number>?text=<encoded message>`. `adminNumber` read via `config/index.ts`.

### 4.4 New template: `templates/quotation.ejs`
Branded quote: header, buyer/company block, line-item table (product, SKU, attrs, qty, unit
price, line total), subtotal/discount/total, footer.

### 4.5 Buyer routes — `quotation.route.ts` (mounted in `v1.route.ts`)
| Method | Path | Guard | Purpose |
|---|---|---|---|
| POST | `/quotations` | verification gate + cart-session | Generate quotation from current cart |
| GET | `/quotations/mine` | require-auth | Buyer's own quotation history |
| GET | `/quotations/:id/pdf` | require-auth (owner) | Download PDF (records download) |

**Verification gate** on `POST /quotations`: verified user → proceed; guest/unverified →
`403 { code: 'VERIFICATION_REQUIRED' }` → frontend launches OTP → guest cart merges → retry.

### 4.6 Cart route changes
Add/update endpoints enforce MOQ (reject `qty < moq`). Cart service reads/writes guest carts
by `sessionId` (from existing `cart-session.middleware`) when no user is present.

### 4.7 Admin routes (extend `admin.route.ts`)
| Method | Path | Purpose |
|---|---|---|
| GET | `/admin/quotations` | List/filter enquiries (status, date, search) |
| GET | `/admin/quotations/:id` | Enquiry detail + PDF link |
| PATCH | `/admin/quotations/:id/status` | Update status |
| GET | `/admin/quotations/analytics` | Counts: generated, downloads, conversion |

Product/MOQ management reuses `admin.catalog.controller` — `moq` added to variant
create/update payload + validators.

### 4.8 Analytics
Quotation-generated and PDF-download events flow through existing `impressions` /
`analytics.service`; no new tracking infrastructure.

---

## 5. Validation, error handling, edge cases

### Validation (express-validator, in `middlewares/validators`)
- `POST /quotations` — confirm a resolvable cart owner (no body required).
- Variant create/update — `moq` integer `>= 1`.
- Admin status PATCH — `status` in enum.

### Error handling (existing `errors/` classes + `error-handler.middleware`; never `new Error()`)
- Empty cart → `400 CART_EMPTY`.
- Below MOQ → `400 MOQ_NOT_MET`, `details: [{ variantId, moq, qty }]` (lists every offending line).
- Guest/unverified at quotation → `403 VERIFICATION_REQUIRED`.
- PDF render/upload failure → `502 QUOTATION_PDF_FAILED`; **no Quotation persisted** (record
  only after PDF URL exists).
- Download/detail on a quote you don't own → `403`.

### Edge cases
- Variant deactivated/deleted between cart-add and generation → **block** generation (don't
  quote unavailable items), surface which lines.
- Coupon expired/invalid at generation → re-validate via `coupon.service`; if invalid, drop it
  and generate at full price (don't hard-fail).
- Concurrent `quotationNumber` allocation → atomic counter (or nanoid suffix) to avoid collisions.
- Guest-cart merge collision (same variant in both carts) → sum qty, re-check MOQ.

---

## 6. Testing

No test framework is currently installed; this spec introduces a minimal one (runner TBD at
plan time — likely Jest + supertest — matching TS/Express conventions).

- **Unit:** `quotation.service` total math (subtotal/discount/total), MOQ enforcement, coupon
  re-validation, merge dedupe. `whatsapp.util` URL/message encoding.
- **Integration:** `POST /quotations` happy path (verified user, valid cart → 200 with
  `pdfUrl` + `whatsappUrl`); guest gate → 403; MOQ violation → 400; empty cart → 400; download
  increments counter.
- **PDF:** assert a non-empty PDF buffer is produced from a known quotation fixture and uploaded
  (R2 mocked).

---

## 7. New dependency

- `puppeteer` (headless Chrome for PDF). Launched with `--no-sandbox` for the container
  environment in the existing Dockerfile; single shared browser instance.

---

## 8. Out of scope (future specs)

- Company-scoped employee logins & per-company product visibility.
- Employee coupon-based cart discounts.
- Brand-based filtering / rendering.
- Admin filter-based catalogue generation.
- Quotation → order conversion.
- Phase 2 seller marketplace (super-admin onboarding, seller product upload/approval).
