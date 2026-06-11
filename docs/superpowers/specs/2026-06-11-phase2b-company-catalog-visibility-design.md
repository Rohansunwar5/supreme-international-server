# Phase 2b — Per-Company Catalog Visibility (Design Spec)

**Date:** 2026-06-11
**Scope:** A curated, per-company private catalog for employees: the public products/categories an
admin whitelists for a company, plus that company's own private products. Public guests/buyers are
unaffected except that company-private products are filtered out of public reads.

**Depends on:** Phase 2a (Company model, employee identity, `isEmployee` guard). This branch is cut
from `feat/phase2a-company-employee-foundation`.

**Explicitly deferred to their own specs:**
- **2c** — employee wallet / credit points.
- **2d** — employee ordering (wallet credits + Razorpay), company-scoped coupons.
- Featured / bestsellers rows for the employee catalog (global-curation concepts that are fuzzy
  per-company).

---

## 1. Context & background

The platform is a layered Express + TypeScript + Mongoose backend. Phase 2a established companies
and admin-invited employee accounts with a separate login. Phase 2b gives those employees something
to browse: a **private catalog**.

There are two distinct catalog experiences:

| | Public catalog (exists) | Employee catalog (new in 2b) |
|---|---|---|
| Who | Guests / B2B buyers | Active employees of an active company |
| Routes | `/catalog/*` (public) | `/employee/catalog/*` (`isEmployee`-guarded) |
| Sees | All active public products | Whitelisted public products + the company's private products |
| Caching | Global query-hash cache | None in 2b (computed fresh) |

**Relevant current state:**
- `product` model has no visibility/ownership dimension; all reads filter `{ isActive: true }`.
- `product.service` read paths (`listProducts`, `getProductBySlug`, `getFeaturedProducts`,
  `getBestsellers`, `searchProducts`, `getRelatedProducts`) and the variant aggregation
  `getMinPriceByProductIds` resolve over all active products and cache list results in a global
  `productListCacheManager` / `productDetailCacheManager`.
- `recently-viewed.service` already tracks views per logged-in user (and per guest session).
- 2a's `isEmployee` middleware loads the employee + verifies active employee/active company, but does
  not currently expose the company id to handlers.

This design reuses the existing product/variant/category models and follows the established read
patterns rather than inventing a parallel catalog engine.

---

## 2. Architecture

Built on the existing layered architecture and the strict rules in `codingPattenAndRule.md`:
**Route → Validator → Auth Middleware → Controller → Service → Repository → Model → response via
`next()`**. Class-based services with constructor-injected repositories; custom error classes only;
validators in `middlewares/validators`; config via `config/index.ts`; Redis only via `CacheManager`.
**No Mongoose `ref`/`populate`/relationships** — cross-entity references are plain `ObjectId`s
resolved with explicit repository calls.

### Reused (as-is or lightly extended)
- `product` / `productVariant` / `category` models + repositories — the employee-catalog query is a
  new scoped method on `ProductRepository`, reusing the existing filter/sort/min-price patterns.
- `recently-viewed.service` — employee recently-viewed reuses its per-user storage, then filters the
  returned products through the company scope.
- 2a `isEmployee` middleware — extended to attach `req.companyId`.
- `admin.catalog.controller` — `createProduct` / `updateProduct` extended for `visibility` +
  `ownerCompanyId`; admin product list gains a company filter.

### New
- `visibility` + `ownerCompanyId` on the `product` model (additive, no migration).
- `companyCatalog` model + repository — one whitelist doc per company.
- `companyCatalog.service` — admin whitelist read/mutate.
- `employee.catalog.service` — scoped list/detail/search/related/recently-viewed.
- `employee.catalog.route.ts` (`/employee/catalog/*`, `isEmployee`-guarded) + controller.
- Admin whitelist endpoints on `admin.route` + `admin.company.controller` (or a small
  `admin.companyCatalog.controller`).
- Validators for whitelist mutation + private-product fields.
- `@types/custom.d.ts` — add `companyId` to `Request`.

---

## 3. Data model

### 3.1 `product` — visibility dimension (additive, no migration)
```
visibility       enum ['public','company'], default 'public'
ownerCompanyId   ObjectId?   // required iff visibility === 'company'; plain ObjectId, no ref
```
- Existing products default to `public` (a missing `visibility` is treated as `public`), so **no
  migration is required**.
- A `company` product belongs to exactly **one** company, never appears in public reads, and is
  always visible to its owner company (it is NOT a whitelist entry).
- Index: `{ visibility: 1, ownerCompanyId: 1 }` to serve the owner-company branch of the predicate.

### 3.2 New model: `companyCatalog` — one doc per company
```
companyId     ObjectId, unique, required
productIds    [ObjectId]   default []   // whitelisted PUBLIC products
categoryIds   [ObjectId]   default []   // whitelisted categories (LIVE: current + future products)
timestamps
```
Index: `companyId` (unique). Kept separate from `Company` so the company doc stays lean; fetched
once per employee-catalog request (and upserted on admin mutation).

### 3.3 Reused without schema change
`category`, `productVariant` (price/MOQ/stock), `user` (employee identity + `companyId`),
recently-viewed storage.

---

## 4. Resolution logic

### 4.1 Employee visibility predicate
What an employee of company `C` sees is a single Mongo predicate (one query, efficient):
```
isActive: true AND (
  ( visibility:'public' AND ( _id ∈ catalog.productIds OR category ∈ catalog.categoryIds ) )
  OR
  ( visibility:'company' AND ownerCompanyId = C )
)
```
- `catalog` is `C`'s `companyCatalog` doc (or empty arrays if none exists yet).
- Category grants are **live** — membership is tested against the product's current `category`, so a
  new product added to a granted category appears automatically.
- An employee with no `companyCatalog` doc sees only their company's private products (possibly
  none); an empty catalog is a valid state.

### 4.2 The one public-catalog correctness change
The existing public read paths must add `visibility: 'public'` so company-private products **never
leak** to guests/buyers:
- `product.service`: `listProducts`, `searchProducts`, `getFeaturedProducts`, `getBestsellers`,
  `getRelatedProducts`, `getProductBySlug`.
- `ProductVariantRepository.getMinPriceByProductIds` and the product repository's filter/search
  methods these call — scope to public products.

This is the only place 2b touches existing catalog behavior. Because `visibility` is a new field
(no pre-existing `company` products), the global public cache holds no stale private data; new cache
entries are correctly narrowed.

---

## 5. API surface

### 5.1 Employee catalog — `employee.catalog.route.ts`, mounted at `/employee/catalog`, every route behind `isEmployee`
| Method | Path | Purpose |
|---|---|---|
| GET | `/employee/catalog/products` | List company catalog (category/price/attribute filters + pagination) |
| GET | `/employee/catalog/products/:slug` | Product detail (scoped) |
| GET | `/employee/catalog/search` | Text search within the company catalog |
| GET | `/employee/catalog/products/:slug/related` | Related (same category, scoped) |
| POST | `/employee/catalog/products/:slug/view` | Track recently-viewed |
| GET | `/employee/catalog/recently-viewed` | Recently-viewed, filtered to current scope |

`isEmployee` is extended to set `req.companyId = employee.companyId` so handlers/services avoid a
duplicate lookup. Controllers stay thin (`next(response)`); the company id comes from `req.companyId`,
the user id from `req.user._id`.

`employee.catalog.service` (DI: `CompanyCatalogRepository`, `ProductRepository`,
`ProductVariantRepository`): `listProducts(companyId, query)`, `getProductBySlug(companyId, slug)`,
`searchProducts(companyId, q, page, limit)`, `getRelated(companyId, slug, limit)`,
`getRecentlyViewed(companyId, userId)`. Each resolves the company's catalog doc, builds the §4.1
predicate, and delegates the Mongo work to scoped `ProductRepository` methods. Min-price/variant
enrichment reuses the existing pattern.

### 5.2 Admin management — extend `admin.route.ts` (behind `isAdmin`)
| Method | Path | Purpose |
|---|---|---|
| GET | `/admin/companies/:id/catalog` | Get the whitelist (`productIds`, `categoryIds`) |
| PATCH | `/admin/companies/:id/catalog` | Apply deltas `{ addProductIds?, removeProductIds?, addCategoryIds?, removeCategoryIds? }` (upserts the `companyCatalog` doc) |
| GET | `/admin/companies/:id/products` | List that company's private products |

Company-private products **reuse** `admin.catalog` `createProduct` / `updateProduct`, extended to
accept `visibility` + `ownerCompanyId` (required and company-existence-checked when
`visibility:'company'`). The existing admin product list gains an optional
`ownerCompanyId` / `visibility` filter to back `/admin/companies/:id/products`.

---

## 6. Validation, error handling, edge cases

### Validation (express-validator)
- Private product: when `visibility === 'company'`, `ownerCompanyId` is a required valid mongoId for
  an existing company; when `visibility === 'public'` (or absent), `ownerCompanyId` must be absent.
- Whitelist PATCH: `addProductIds` / `removeProductIds` / `addCategoryIds` / `removeCategoryIds` are
  arrays of mongoIds (all optional; at least one present).
- `:id` / `:slug` params validated (`isMongoId` / non-empty string).

### Error handling (existing `errors/` classes; never `new Error()`)
- `visibility:'company'` with missing/invalid `ownerCompanyId` → `400`.
- Whitelisting a non-existent or **non-public** product → `400` (private products are auto-scoped).
- Employee detail/related/view for an out-of-scope slug (not whitelisted, or a private product of
  another company) → **`404`** (do not leak existence; never `403`).
- Whitelist mutation / private-product create against a missing company → `404`.

### Edge cases
- Whitelisted product later deactivated/deleted, or a granted category deleted → drops out of the
  employee view automatically (`isActive` + live membership).
- A public product flipped to `visibility:'company'` via admin update leaves every whitelist's
  effective view (the predicate requires `visibility:'public'` for whitelist matches) — consistent.
- Owner company set inactive → its employees can't log in (2a `isEmployee`), so private products are
  unreachable regardless.
- Duplicate ids in a whitelist PATCH are de-duplicated on upsert; removing an id not present is a
  no-op.

### Caching
- Employee catalog reads compute **fresh** (no cache) in 2b — company catalogs are small and
  low-traffic, and this avoids cross-company invalidation bugs. (A per-company cache is a possible
  later optimization.)
- The public catalog cache is unchanged aside from the narrowing `visibility:'public'` filter.

---

## 7. Testing

- **Unit (`employee.catalog.service`):** predicate returns whitelisted public + own private products;
  excludes non-whitelisted public and other companies' private; empty-catalog returns only private /
  empty; detail/search/related are scoped; out-of-scope slug → `NotFoundError`.
- **Unit (`companyCatalog.service` / admin):** PATCH add/remove deltas upsert correctly and
  de-duplicate; reject whitelisting a non-public or non-existent product; private-product create
  requires a valid existing `ownerCompanyId`.
- **Public-catalog regression:** a `visibility:'company'` product does NOT appear in public
  list / search / detail.
- **Routes:** `/employee/catalog/*` → `403` without an active employee (guard); admin
  catalog-management endpoints forward correctly.

Mock repositories, `mail.service` (n/a here), and the cache managers in unit tests; mock auth
middleware + services in route tests, matching existing conventions.

---

## 8. Out of scope (later sub-projects)
- Wallet / credit points (**2c**).
- Employee ordering, company-scoped coupons, wallet + Razorpay settlement (**2d**).
- Featured / bestsellers for the employee catalog.
- Per-company employee-catalog caching.
- Bulk CSV import of whitelist entries or private products.
