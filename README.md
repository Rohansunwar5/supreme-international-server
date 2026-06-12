sudo docker run -d -p 6379:6379 --add-host=host.docker.internal:host-gateway --restart=unless-stopped --name redis redis

use host.docker.internal as in place of localhost - redis.

## B2B Quotations (PDF generation)

Quotation PDFs are rendered with Puppeteer (headless Chromium) and uploaded to R2.

- Puppeteer downloads a matching Chromium build on `npm install`.
- In Docker, the base image must include Chromium's shared libraries (e.g. `libnss3`,
  `libatk-bridge2.0-0`, `libgbm1`, `libasound2`, fonts). The browser is launched with
  `--no-sandbox --disable-setuid-sandbox` for container compatibility.
- Required env vars: `ADMIN_WHATSAPP_NUMBER` (admin number for the `wa.me` deep link) and
  optionally `MAX_CART_QTY_PER_ITEM` (per-item cart cap, defaults to 9999 to allow MOQ-sized
  quantities). See `example.env`.

## Company & Employee accounts (Phase 2a)

Admins create companies and invite employees (`/admin/companies`, `/admin/companies/:id/employees/invite`).
An invite emails a tokenized activation link built from `FRONTEND_URL`
(`<FRONTEND_URL>/employee/activate?token=...`); the employee sets a password and is auto-verified.
Employees log in via the **separate** path `POST /auth/employee/login` (scoped to employee accounts,
so an email can exist independently as both a B2B buyer and an employee). Required env var:
`FRONTEND_URL`. See `example.env`.

## Company catalog (Phase 2b)

Each company has a private catalog = admin-whitelisted public products/categories
(`PATCH /admin/companies/:id/catalog` with add/remove id deltas) plus the company's own private
products (created via the admin catalog with `visibility: "company"` + `ownerCompanyId`). Category
grants are live (future products in a granted category appear automatically). Employees browse it at
the `isEmployee`-guarded `/employee/catalog/*` routes (list, detail, search, related, recently-viewed).
Company-private products never appear in the public `/catalog/*` reads.

## Employee wallet (Phase 2c)

Each employee has a wallet with a credit balance (INR). Admins top-up or adjust it
(`POST /admin/employees/:id/wallet/credit` and `.../debit`, each requiring `{ amount, reason }`);
every change is an immutable ledger entry stamped with the resulting balance. Debits are guarded so
a balance can never go negative. Employees view their own balance/history at `/employee/wallet` and
`/employee/wallet/ledger` (behind `isEmployee`). Credits never expire. Spending credits at checkout
arrives in Phase 2d.

## Employee ordering (Phase 2d)

Employees check out their cart at `POST /employee/checkout` (`isEmployee`). The service re-validates
every item is in the company catalog scope, re-prices, applies an optional **company-scoped** coupon
(`coupon.companyId`), then auto-applies wallet credits (`min(balance, total)`) and reserves them
(`order_redemption` debit). Employee gifting orders ship free. If credits cover the full total the
order is confirmed immediately (`payment.gateway:'wallet'`, stock decremented, cart cleared);
otherwise a Razorpay order is created for the remainder and confirmed by the existing
`payment.captured` webhook. Cancelling the order or a `payment.failed` webhook refunds the reserved
credits. Employees view/cancel orders via the existing `/orders/*` routes.