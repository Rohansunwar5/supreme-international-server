# Phase 2c — Employee Wallet / Credit Points (Design Spec)

**Date:** 2026-06-11
**Scope:** A per-employee wallet with a credit balance the admin manages: an immutable ledger,
admin top-up (credit) and adjustment (debit), and employee + admin views of balance and history.

**Depends on:** Phase 2a (employee identity, `isEmployee` guard attaching `req.companyId`). This
branch is cut from `main` (which now contains 2a + 2b).

**Explicitly deferred to their own specs:**
- **2d** — spending credits at checkout (order-redemption debits) + Razorpay settlement, and
  company-scoped coupons. The ledger primitive here is built so 2d only adds new entry `source`
  values (`order_redemption`, `refund`); no rework.
- Credit expiry (decided out of scope — credits never expire).
- Bulk top-up across many employees at once.

---

## 1. Context & background

The platform is a layered Express + TypeScript + Mongoose backend. Phase 2a established employee
accounts; Phase 2b gave them a private catalog. Phase 2c gives each employee a **wallet** the
company (via the platform admin) funds with credits — the closed-loop gifting balance employees will
spend in 2d.

**Relevant current state:**
- Money is stored as `Number` (rupees) everywhere (`order.total`, `priceAtPurchase`, variant
  `price`). The wallet matches this convention so it composes cleanly with order totals in 2d.
- Employees are `User` docs with `accountType:'employee'`, `companyId`, `employeeStatus`. The admin
  resolves an employee via `UserRepository.findEmployeeById(id)`.
- `isEmployee` (2a) verifies an active employee of an active company and sets `req.companyId`.
- The codebase does **not** use Mongo multi-document transactions; atomicity is achieved with
  conditional single-document updates.

This design adds a new wallet subsystem; it does not modify existing models.

---

## 2. Architecture

Built on the existing layered architecture and `codingPattenAndRule.md`: **Route → Validator → Auth
Middleware → Controller → Service → Repository → Model → response via `next()`**. Class-based
services with constructor-injected repositories; custom error classes only; validators in
`middlewares/validators`; config via `config/index.ts`; **no `ref`/`populate`** — cross-entity ids
are plain `ObjectId`s; balances/amounts are snapshotted onto ledger entries.

### Reused
- `UserRepository.findEmployeeById` — resolve the target employee (and its `companyId`) for admin
  ops; reject non-employees.
- `isEmployee` middleware — guards the employee wallet routes and supplies `req.companyId`.
- `admin.route` + `isAdmin` — extended with admin wallet endpoints.

### New
- `wallet` model + repository — one wallet per employee, holding the cached balance; atomic
  credit/debit conditional updates.
- `walletLedger` model + repository — immutable entries + paginated history.
- `wallet.service` — the ledgered credit/debit primitive + reads.
- `admin.wallet.controller` (admin) + `employee.wallet.controller` (employee) + their routes.
- `wallet.validator` — amount/reason/id validation.

---

## 3. Data model

### 3.1 New model: `wallet` — one per employee
```
employeeId   ObjectId, required, unique     // the User (accountType:'employee')
companyId    ObjectId, required             // snapshot for scoping / reporting
balance      Number, default 0, min 0       // cached running balance (INR)
currency     String, default 'INR'
timestamps
```
Index: `employeeId` (unique).

### 3.2 New model: `walletLedger` — immutable entries (never updated or deleted)
```
walletId     ObjectId, required
employeeId   ObjectId, required
companyId    ObjectId, required
type         enum ['credit','debit'], required
amount       Number, required, min > 0
balanceAfter Number, required               // wallet balance immediately after this entry
reason       String, required               // the admin's note
source       enum ['admin_topup','admin_adjustment']   // 2d extends: 'order_redemption','refund'
createdBy    ObjectId?                       // admin id for admin-initiated entries
referenceId  ObjectId?                       // e.g. orderId (used in 2d)
createdAt    (timestamps; createdAt only — entries are immutable)
```
Indexes: `{ walletId: 1, createdAt: -1 }` (history), `{ employeeId: 1 }`.

### 3.3 Reused without change
`user` (employee identity + `companyId`), `company`.

---

## 4. Consistency & atomicity

Balance is **ledger-derived but cached** on the wallet doc for fast reads. Every mutation is one
atomic conditional update on the wallet, followed by an immutable ledger entry stamped with the
resulting `balanceAfter`:

- **Credit:** `findOneAndUpdate({ _id }, { $inc: { balance: +amount } }, { new: true })`; the
  returned `balance` is the entry's `balanceAfter`.
- **Debit:** `findOneAndUpdate({ _id, balance: { $gte: amount } }, { $inc: { balance: -amount } },
  { new: true })`. If it returns `null`, the balance was insufficient → reject with
  `400 INSUFFICIENT_BALANCE`. This `$gte` guard makes overspend / negative balance **impossible
  under concurrency** without Mongo transactions (consistent with the codebase).

The wallet is **auto-created** (balance 0) on the first credit. A read for an employee with no wallet
returns `{ balance: 0, currency: 'INR' }` and an empty ledger **without** creating a doc. The same
atomic `debit` primitive is what 2d's order redemption calls (with `source:'order_redemption'` +
`referenceId`).

Note on ordering: the wallet `$inc` is the authoritative, atomic step; the ledger insert follows. If
the ledger insert failed after a successful balance change (rare), the cached balance is still
correct and the missing entry can be reconciled — the balance can never be wrong in a way that
allows overspend.

---

## 5. API surface

### 5.1 Admin — extend `admin.route.ts` (behind `isAdmin`)
`:id` is the employee's user id; the handler loads the employee via `findEmployeeById` to get
`companyId` and reject non-employees.

| Method | Path | Purpose |
|---|---|---|
| POST | `/admin/employees/:id/wallet/credit` | Top-up `{ amount, reason }` → ledgered credit (`admin_topup`) |
| POST | `/admin/employees/:id/wallet/debit` | Adjustment `{ amount, reason }` → ledgered debit (`admin_adjustment`, guarded) |
| GET | `/admin/employees/:id/wallet` | Balance + currency |
| GET | `/admin/employees/:id/wallet/ledger` | Paginated history |

### 5.2 Employee — `employee.wallet.route.ts`, mounted at `/employee/wallet`, behind `isEmployee`
Uses `req.user._id` + `req.companyId`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/employee/wallet` | Own balance |
| GET | `/employee/wallet/ledger` | Own history (paginated) |

### 5.3 Service / repositories
`wallet.service` (DI: `WalletRepository`, `WalletLedgerRepository`, `UserRepository`):
- `credit(employeeId, companyId, amount, reason, adminId)` → `getOrCreate` wallet, atomic `+`,
  append `credit`/`admin_topup` entry, return `{ balance, entry }`.
- `debit(employeeId, companyId, amount, reason, adminId, opts?)` → atomic guarded `-`; null →
  `INSUFFICIENT_BALANCE`; append `debit` entry. `opts` carries `source`/`referenceId` so 2d reuses
  it (default `admin_adjustment`).
- `getWallet(employeeId)` → wallet or synthesized `{ balance: 0, currency: 'INR' }`.
- `getLedger(employeeId, page, limit)` → paginated entries.
- private `getOrCreate(employeeId, companyId)`.

`WalletRepository`: `findByEmployeeId`, `getOrCreate`, `atomicCredit(walletId, amount)`,
`atomicDebit(walletId, amount)` (returns updated doc or null). `WalletLedgerRepository`:
`create(entry)`, `findByWallet(walletId, page, limit) → { items, total }`.

---

## 6. Validation, error handling, edge cases

### Validation (express-validator, `middlewares/validators/wallet.validator.ts`)
- `amount`: required, `isFloat({ gt: 0 })` (reject `0`, negative, NaN).
- `reason`: required non-empty string.
- `:id`: `isMongoId`.

### Error handling (existing `errors/`; never `new Error()`)
- Admin op on a `:id` that is not an existing employee → `404`.
- Debit (admin adjustment) exceeding balance → `400 INSUFFICIENT_BALANCE`.
- Employee wallet routes without an active employee → `403` (via `isEmployee`).

### Edge cases
- Employee with no wallet yet → read returns `{ balance: 0, currency: 'INR' }`, empty ledger, no doc
  written; first credit creates the wallet.
- Ledger is append-only — no update/delete surface.
- Concurrency (e.g. two simultaneous debits) → the `$gte` conditional update serializes correctly;
  at most one succeeds when funds cover only one.
- `amount` is treated as INR (Number), matching order totals — round to 2 decimals at the edge if a
  fractional value sneaks in (validation already enforces `> 0`).

---

## 7. Testing

- **Unit (`wallet.service`):**
  - `credit` auto-creates the wallet, increments balance, and writes a `credit` entry with the
    correct `balanceAfter` and `source:'admin_topup'` + `createdBy`.
  - `debit` writes a `debit` entry (`admin_adjustment`) and decrements balance.
  - `debit` beyond balance (repo `atomicDebit` returns `null`) → `BadRequestError`
    (`INSUFFICIENT_BALANCE`).
  - `getWallet` for a missing wallet → `{ balance: 0, currency: 'INR' }` (no write).
  - `getLedger` paginates.
  - admin op resolving a non-employee id → `NotFoundError`.
- **Routes:** `/employee/wallet*` → `403` without an active employee; admin
  credit/debit/get/ledger forward correctly and stamp `createdBy`.

Mock repositories + `UserRepository` in unit tests; mock auth middleware + service in route tests,
matching existing conventions.

---

## 8. Out of scope (later sub-projects)
- Order-redemption debits + Razorpay settlement at checkout (**2d**).
- Refund credits back to the wallet (**2d**).
- Credit expiry.
- Bulk top-up across a company's employees.
- Employee-to-employee transfers.
