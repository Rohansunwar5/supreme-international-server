# Phase 2d — Employee Ordering (Wallet + Razorpay) & Company Coupons (Design Spec)

**Date:** 2026-06-11
**Scope:** An employee turns their cart into a real order, settled by auto-applied wallet credits
plus Razorpay for any remainder, optionally with a company-scoped coupon. This is the capstone that
ties together the company (2a), catalog (2b), and wallet (2c) foundations with the existing
order/checkout/payment layer.

**Depends on:** 2a (employee identity, `isEmployee`/`req.companyId`), 2b (catalog scope predicate via
`ProductRepository.findEmployeeByIds`), 2c (`walletService` ledgered `credit`/`debit` with
`order_redemption`/`refund` sources). Branch cut from `main`.

**Explicitly deferred:**
- Abandoned-order TTL auto-expiry sweep (reserved credits release on cancel + `payment.failed` only).
- Refunds beyond reservation reversal (e.g. post-delivery returns).
- Featured/bestsellers for employees; bulk operations.

---

## 1. Context & background

The platform already has a full order/checkout/payment layer that Phase 1 used for standard buyers
but the employee flow has not touched:
- `checkout.service.initiateCheckout` re-prices the cart, validates the cart coupon, computes
  shipping+tax+total, creates a **Razorpay order for the full total**, persists an `Order`
  (`payment.status:'pending'`), and returns the Razorpay handle.
- `order.service.processWebhook` handles the Razorpay **`payment.captured`** webhook: marks the order
  confirmed and atomically decrements stock (idempotent across retries).
- `order.service.cancelOrder(orderId, userId)` cancels a pending/confirmed order and restores stock
  if it was confirmed.
- Money is `Number` (rupees); order id is `SOV-<8char>`.

The employee flow differs: the wallet covers part/all of the total (credits auto-applied), Razorpay
covers any remainder, coupons are company-scoped, and the catalog is curated. Employees are `User`
docs (`accountType:'employee'`), so they reuse the existing cart (`/cart/*`) and order views
(`/orders/*`) as logged-in users; only the **checkout** needs employee-specific logic.

---

## 2. Architecture

Strict layering per `codingPattenAndRule.md`: **Route → Validator → Auth → Controller → Service →
Repository → Model → `next()`**. Class-based DI services, custom errors only, validators in
`middlewares/validators`, no `ref`/`populate`, Redis only via CacheManager. Reuses the existing
Razorpay util, order repository, and cart repository; the wallet reservation is the new settlement
primitive layered on 2c.

### Reused
- `CartRepository` (read items, `clearItems`), `ProductRepository.findEmployeeByIds` (2b scope check),
  `ProductVariantRepository` (live price/stock, `adjustStock`), `OrderRepository` (create/read/cancel),
  `createRazorpayOrder` util, `walletService` (reserve/refund), `couponService` (discount).
- `order.service.processWebhook` success path — unchanged; confirms split orders too.
- `/cart/*` and `/orders/*` routes — employees use them as logged-in users (no change).

### New
- `employee.checkout.service` — the employee checkout flow (scope-validate → price → company coupon →
  wallet reserve → Razorpay remainder / immediate confirm).
- `employee.checkout.controller` + `employee.checkout.route.ts` (`POST /employee/checkout`, `isEmployee`).
- `checkout.validator` additions for the employee checkout body.

### Modified
- `coupon` model: optional `companyId`.
- `coupon.service.validateAndComputeDiscount`: company-scope enforcement; `createCoupon` + validator
  accept `companyId`.
- `order` model: employee/settlement fields.
- `order.service.cancelOrder`: refund reserved wallet for employee orders.
- `order.service.processWebhook`: `payment.failed` → cancel + refund for employee orders.

---

## 3. Data model

### 3.1 `coupon` — add optional company scope (additive, no migration)
```
companyId   ObjectId?   // when set, usable ONLY by employees of that company
```
A coupon with `companyId` is rejected for non-employees and for other companies; existing public
coupons (no `companyId`) are unchanged and are **not** valid in employee checkout.

### 3.2 `order` — add employee/settlement fields (additive, all optional/defaulted)
```
employeeId      ObjectId?
companyId       ObjectId?
orderType       enum ['standard','employee'], default 'standard'
walletApplied   Number, default 0     // credits reserved against this order
walletLedgerId  ObjectId?             // the reservation ledger entry id (refund reference)
```
`payment.gateway` widens to `'razorpay' | 'wallet'` — `'wallet'` when credits cover the full total
(no Razorpay order). The existing `billing` block (subtotal/couponDiscount/shippingCharge/shippingTax
/total) is reused unchanged; `walletApplied + razorpayAmount === billing.total`.

### 3.3 Reused without change
`wallet` + `walletLedger` (2c), `product`/`productVariant` (2b), `companyCatalog`, `user`, `company`.

---

## 4. Settlement flow

`POST /employee/checkout` (guard: `isEmployee`; `req.user._id` = employeeId, `req.companyId`):

1. Read the employee's cart (Mongo cart by userId). Empty → `400`.
2. **Scope re-validation:** collect the cart's productIds; resolve the company scope from
   `CompanyCatalogRepository` and call `ProductRepository.findEmployeeByIds(scope, productIds)`. Every
   cart productId must be in scope — otherwise `400` (the shared cart does not enforce scope on add,
   so checkout is the enforcement point).
3. **Re-price + stock:** for each item, load the live variant; reject if inactive or `stock < qty`;
   price at the live effective price.
4. **Company coupon (optional):** if `couponCode` supplied, `couponService.validateAndComputeDiscount`
   with `companyId = req.companyId`; the coupon must have `companyId === req.companyId` (public /
   other-company coupons → `400`).
5. Compute `total = subtotal − couponDiscount + shippingCharge + shippingTax`.
6. `walletApplied = min(walletBalance, total)`; `remainder = total − walletApplied`.
7. Allocate `orderId = SOV-<8char>`.
8. **Reserve wallet:** `walletService.debit(employeeId, companyId, walletApplied, 'Order <orderId>',
   undefined, { source:'order_redemption', referenceId: orderId })` — only when `walletApplied > 0`.
   The `$gte` atomic guard means a concurrent spend that drained the balance → `400
   INSUFFICIENT_BALANCE` and **nothing is persisted**. Capture the returned ledger entry id as
   `walletLedgerId`.
9. **Branch:**
   - `remainder === 0` → persist the order **confirmed**, `payment.gateway:'wallet'`,
     `orderType:'employee'`, decrement stock, clear the cart. No Razorpay. Return
     `{ orderId, walletApplied, remainder: 0, fullyPaidByWallet: true }`.
   - `remainder > 0` → `createRazorpayOrder({ amountInPaise: round(remainder*100), receipt: orderId })`;
     persist the order **pending** with `walletApplied`, `walletLedgerId`, `payment.gateway:'razorpay'`,
     `payment.razorpayOrderId`; return `{ orderId, walletApplied, remainder, fullyPaidByWallet: false,
     razorpayOrderId, razorpayKeyId, amountInPaise }`. The existing **`payment.captured` webhook**
     confirms it + decrements stock (unchanged).

**Refund triggers (release reserved credits):**
- `order.service.cancelOrder` on an employee order with `walletApplied > 0` →
  `walletService.credit(employeeId, companyId, walletApplied, 'Refund for order <orderId>', undefined,
  { source:'refund', referenceId: orderId })`, in addition to the existing stock-restore.
- `order.service.processWebhook` **`payment.failed`** event → cancel the order + refund.
- Abandoned-but-never-cancelled orders keep credits reserved (mirrors how pending orders already
  linger); a TTL sweep is deferred.

---

## 5. API surface

### 5.1 Employee
| Method | Path | Guard | Purpose |
|---|---|---|---|
| POST | `/employee/checkout` | `isEmployee` | Employee checkout (§4) |
| GET | `/orders/mine`, `/orders/:orderId` | existing `isLoggedIn` | Employee's own orders (employee is a User) |
| POST | `/orders/:orderId/cancel` | existing | Cancel + refund reserved wallet |

`employee.checkout.route.ts` mounts at `/employee/checkout` in `v1.route.ts` alongside the other
`/employee/*` mounts.

### 5.2 Admin — company coupons (reuse existing coupon endpoints)
`POST /admin/coupons` and `PATCH /admin/coupons/:id` accept an optional `companyId`; setting it makes
the coupon a company coupon. No new routes.

### 5.3 Services
- `employee.checkout.service.checkout(employeeId, companyId, body)` → the §4 flow.
- `order.service.cancelOrder` / `processWebhook` — extended as in §2.
- `coupon.service.validateAndComputeDiscount({ ..., companyId? })` — company-scope rules;
  `createCoupon`/`updateCoupon` accept `companyId`.

---

## 6. Validation, error handling, edge cases

### Validation (express-validator)
- `/employee/checkout`: `shippingAddress` present + valid (reuse the existing shipping-address shape);
  `couponCode` optional string.
- Admin coupon create/update: `companyId` optional `isMongoId`.

### Error handling (existing `errors/`; never `new Error()`)
- Empty cart, out-of-scope item, inactive product, insufficient stock → `400` (specific message).
- Company coupon invalid / public / other company → `400`.
- Wallet reservation racing a concurrent spend → `400 INSUFFICIENT_BALANCE` (nothing persisted).
- Standard (non-employee) checkout applying a `companyId` coupon → `400`.

### Edge cases
- `balance === 0` → `walletApplied 0`, full Razorpay; still an `employee` order.
- `remainder === 0` → wallet-only confirmed order; stock decremented + cart cleared at checkout (this
  order never receives a webhook).
- Coupon discount is applied **before** wallet (`total` already net of discount).
- Cancel of a confirmed wallet/split order → refund credits + restore stock; webhook stays idempotent.
- Reservation occurs only after all validation passes, so a validation failure never debits the wallet.
- Stock for split orders is decremented by the existing webhook (not at checkout), matching standard
  orders — only the wallet-only branch decrements at checkout.

---

## 7. Testing

- **`employee.checkout.service`:** out-of-scope cart item → `400`; reprices at live price; rejects
  insufficient stock; company coupon enforced (public/other-company → `400`); `walletApplied =
  min(balance,total)`; `remainder 0` → confirmed `wallet` order (wallet debited `order_redemption`,
  stock decremented, cart cleared, no Razorpay); `remainder > 0` → Razorpay order for the remainder +
  pending order + reserved wallet + `walletLedgerId` set; reservation insufficient → `400`, nothing
  persisted.
- **`order.service`:** `cancelOrder` on an employee order with `walletApplied > 0` → refund `credit`
  (`source:'refund'`) + stock restore; `processWebhook` `payment.failed` → cancel + refund.
- **`coupon.service`:** company coupon valid only for the matching `companyId`; public coupon rejected
  in employee checkout; standard checkout rejects a company coupon.
- **Routes:** `/employee/checkout` → `403` without an active employee; admin create-company-coupon
  forwards `companyId`.

Mock repositories + `walletService`/`couponService` + the Razorpay util in unit tests; mock auth +
service in route tests, matching existing conventions.

---

## 8. Out of scope (future)
- Abandoned-order TTL sweep / auto-expiry of reservations.
- Post-delivery returns / partial refunds.
- Mixed standard+employee carts (an employee checks out their own cart only).
- Company-admin self-service; bulk coupon issuance.
