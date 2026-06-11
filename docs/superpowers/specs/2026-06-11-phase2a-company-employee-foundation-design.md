# Phase 2a — Company & Employee Identity Foundation (Design Spec)

**Date:** 2026-06-11
**Scope:** The identity foundation for the corporate-employee gifting experience: a real
`Company` entity, admin-driven employee onboarding (invite → set password → activated), employee
accounts bound to a company, and a separate employee login path. This is the first of four Phase 2
sub-projects and a hard dependency for the rest.

**Explicitly deferred to their own specs:**
- **2b** — per-company catalog visibility (whitelist of public products/categories) and
  company-private products.
- **2c** — employee wallet / credit points (admin assigns, ledger).
- **2d** — employee ordering settled by wallet credits **+ Razorpay**, and company-scoped coupons.

2a establishes *who* companies and employees are and *how they log in*. It introduces **no**
catalog, wallet, coupon, or ordering behavior.

---

## 1. Context & background

The platform is a layered Express + TypeScript + Mongoose backend. Phase 1 delivered the B2B
quotation flow: corporate buyers / guests browse the full public catalog, build a cart, and
generate a quotation PDF delivered to the admin via a `wa.me` link — **no ordering**.

Phase 2 introduces a **second, distinct buyer experience**: company employees. A company is
onboarded by the platform admin; employees are invited; they will (in later sub-projects) see a
curated company catalog, hold wallet credits, and place real orders settled by credits + Razorpay.
The two experiences differ fundamentally:

| | B2B buyers (Phase 1, exists) | Company employees (Phase 2, new) |
|---|---|---|
| Catalog | Full public catalog | Curated company catalog (2b) |
| Flow | Cart → quotation PDF → WhatsApp enquiry. No ordering. | Cart → real order (2d) |
| Settles with | n/a | Wallet credits (2c) + Razorpay (2d) |

**Today's auth (relevant facts):** a single `User` model; email/password login with `bcrypt` +
JWT (`{ _id }`, 24h, encrypted-cached in Redis); email-verification codes; Google SSO;
reset-password via a `verificationCode` stored on the user. Admin auth is **separate**
(`ADMIN_JWT_SECRET`, `isAdmin` middleware). There is **no** `role` field; B2B buyers are plain
`User`s. A free-text `company { name, url }` already exists on `User` as a buyer self-description —
it is unrelated to the new `Company` entity and is left untouched.

This design reuses the `User` model and existing auth machinery rather than introducing a parallel
identity system, so cart / quotation / profile continue to work unchanged.

---

## 2. Architecture

Built on the existing layered architecture and the strict rules in `codingPattenAndRule.md`:
**Route → Validator → Auth Middleware → Controller → Service → Repository → Model → response via
`next()`**. Class-based services with constructor-injected repositories; custom error classes only
(never `new Error()`); validators in `middlewares/validators`; config via `config/index.ts`; Redis
only via `CacheManager`. **No Mongoose `ref`/`populate`/relationships** — cross-entity references
are stored as plain `ObjectId`s and resolved with explicit repository calls; cross-entity data is
snapshotted.

### Reused (as-is or lightly extended)
- `User` model — extended additively (`accountType`, `companyId`, `employeeStatus`).
- `auth.service` — its `hashPassword`, `verifyHashPassword`, `generateJWTToken` helpers are reused
  by the new employee auth service; its buyer-facing `login` / `signup` / reset queries become
  account-type scoped.
- `user.repository` — gains employee-scoped query methods; buyer lookups scoped to `individual`.
- `mail.service` (SES + EJS templates) — sends the invite email.
- `admin.route` + `isAdmin` — extended with company / employee management endpoints.
- JWT verify middleware + `isLoggedIn` — unchanged; a new `isEmployee` guard builds on them.

### New
- `company.model.ts` — the Company entity.
- `company.repository.ts` — company persistence + employee queries it owns.
- `company.service.ts` — company CRUD, employee invite / list / status.
- `employee.auth.service.ts` — invite-token validation, activation (set password), employee login.
- `employee.auth.route.ts` — mounted under `/auth/employee`.
- `isEmployee.middleware.ts` — guards employee-only routes.
- `company.validator.ts` — express-validator chains for the above.
- `templates/employee-invite.ejs` — branded invite email with the activation link.

---

## 3. Data model

### 3.1 New model: `company`
Snapshotted, no refs/populate.
```
name            String, required, trim
slug            String, unique                 // derived from name; clean lookups
status          enum ['active','inactive'], default 'active'   // inactive ⇒ employees blocked at login
primaryContact  { name?, email?, isdCode?, phoneNumber? }      // the person you deal with
notes           String?                        // admin freetext
createdBy       ObjectId                        // admin id; plain ObjectId, no ref
timestamps
```
Indexes: `slug` (unique), `{ status: 1, createdAt: -1 }`.

### 3.2 `user` — additive, backward-compatible (no migration)
```
accountType     enum ['individual','employee'], default 'individual'
companyId       ObjectId?                       // set only for employees; plain ObjectId
employeeStatus  enum ['invited','active','deactivated']?   // employees only
```
- All existing users default to `individual`; a missing `accountType` is treated as `individual`,
  so **no migration is required**.
- The legacy free-text `company { name, url }` stays as-is (buyer self-description).

### 3.3 Email uniqueness becomes per-account-type
An email may exist **once** as `individual` and **once** as `employee`, but not twice within a
type. The schema has no global unique index on `email` today, so this is enforced in the repository
query layer:
- buyer signup / login / reset → scoped to `accountType: 'individual'`,
- employee invite / login / reset → scoped to `accountType: 'employee'`.

This is the deliberate consequence of allowing a B2B buyer and an employee to share an email as
**separate accounts**, disambiguated by the login path.

---

## 4. Onboarding & auth flows

### 4.1 Invite (admin → pending employee)
1. Admin calls `POST /admin/companies/:id/employees/invite` with the employee's name, email, and
   optional phone.
2. Validate: company exists and is `active`; the email is **not** already an `employee` anywhere.
3. Create a `User`: `accountType:'employee'`, `companyId`, `employeeStatus:'invited'`,
   `verified:false`, **no password**, and an invite token stored as `sha1(token)` in the existing
   `verificationCode` field (mirrors the reset-code pattern).
4. `mail.service` sends `employee-invite.ejs` containing the activation link with the **raw** token.

### 4.2 Activation (employee sets password)
1. `GET /auth/employee/activate/:token` validates the token (so the UI can render the
   set-password form) — looks up by `sha1(token)` + `accountType:'employee'`.
2. `POST /auth/employee/activate` with `{ token, password }`:
   - re-validates the token, hashes the password (reuse `authService.hashPassword`),
   - sets `verified:true`, `employeeStatus:'active'`, rotates the `verificationCode` (reuse the
     existing reset machinery),
   - returns an access token (reuse `authService.generateJWTToken`) so the employee is logged in.

### 4.3 Login (separate path)
`POST /auth/employee/login` with `{ email, password }`:
- looks up `{ email, accountType:'employee' }` (never collides with a same-email buyer),
- verifies the password,
- rejects if `employeeStatus !== 'active'` or the company is `inactive` → `403`,
- returns a JWT (same `{ _id }` shape; no schema change to the token).

### 4.4 Authorization
- JWT stays `{ _id }`. The existing verify-token middleware loads the user.
- New `isEmployee` middleware: requires `accountType==='employee'`, `employeeStatus==='active'`,
  and the company `active` — otherwise `403`. Because it re-checks on **every** request,
  deactivating an employee (or a company) takes effect **immediately**, even with a live JWT.
- The existing `isLoggedIn` / profile routes work for employees unchanged (they load by `_id`),
  so employee **profile/me** needs no new endpoint.

---

## 5. API surface

### 5.1 Admin (extend `admin.route.ts`, all behind `isAdmin`)
| Method | Path | Purpose |
|---|---|---|
| POST | `/admin/companies` | Create company |
| GET | `/admin/companies` | List/filter (status, search, pagination) |
| GET | `/admin/companies/:id` | Company detail |
| PATCH | `/admin/companies/:id` | Update name / status / primaryContact / notes |
| POST | `/admin/companies/:id/employees/invite` | Invite an employee (creates pending + emails invite) |
| GET | `/admin/companies/:id/employees` | List that company's employees (status filter) |
| POST | `/admin/employees/:id/resend-invite` | Re-issue token + resend invite email |
| PATCH | `/admin/employees/:id/status` | Deactivate / reactivate employee |

### 5.2 Employee auth (new `employee.auth.route.ts`, mounted at `/auth/employee` in `v1.route.ts`)
| Method | Path | Guard | Purpose |
|---|---|---|---|
| GET | `/auth/employee/activate/:token` | public | Validate an invite token |
| POST | `/auth/employee/activate` | public | `{ token, password }` → activate + log in |
| POST | `/auth/employee/login` | public | Employee-scoped email/password login |
| POST | `/auth/employee/forgot-password` | public | Start employee-scoped password reset |
| POST | `/auth/employee/reset-password` | public | Complete employee-scoped password reset |

### 5.3 New service responsibilities
- `company.service.ts`: `createCompany`, `listCompanies(filter)`, `getCompany(id)`,
  `updateCompany(id, params)`, `inviteEmployee(companyId, params)`, `listEmployees(companyId, filter)`,
  `resendInvite(employeeId)`, `setEmployeeStatus(employeeId, status)`.
- `employee.auth.service.ts`: `verifyInviteToken(token)`, `activate(token, password)`,
  `login(email, password)`, `forgotPassword(email)`, `resetPassword(token, password)` — reusing
  `authService` password/JWT helpers and `user.repository` employee-scoped methods.

---

## 6. Validation, error handling, edge cases

### Validation (express-validator, `middlewares/validators/company.validator.ts`)
- Create company — `name` required; optional `primaryContact.email` valid email, phone shape.
- Update company — `status` in enum when present.
- Invite — valid `email`, `firstName` required.
- Activate — `token` present; `password` ≥ 8 chars (matches `PASSWORD_MIN_LENGTH`).
- Employee login — valid `email`, `password` present.
- Status PATCH — `status` in `['active','deactivated']`.
- `:id` / `:companyId` params — `isMongoId`.

### Error handling (existing `errors/` classes + handler; never `new Error()`)
- Invite email already an employee → `409 EMPLOYEE_EXISTS`.
- Invite into an inactive company → `400`.
- Invite / activate against a missing company or employee → `404`.
- Invalid or already-consumed invite token, or already-active employee → `400 INVALID_INVITE`.
- Employee login with wrong type, deactivated employee, or inactive company → `403`.
- Buyer auth and employee auth never authenticate each other (account-type scoping).

### Edge cases
- **Same email, two account types:** allowed; buyer login and employee login resolve to different
  records via the scoped queries.
- **Deactivation is immediate:** `isEmployee` re-checks status + company per request; live JWTs stop
  working at once. Reactivation restores access without a new invite.
- **Resend invite:** rotates the token (old link dies) and re-sends; only valid while still
  `invited`.
- **Invite token expiry:** none, matching the existing reset-code convention; resend is the
  recovery path. (A TTL is a possible later hardening, out of scope here.)
- **Company slug collision:** derive from name, de-duplicate with a numeric suffix (mirrors the
  product slug approach).

---

## 7. Testing

- **Unit (`*.service`):**
  - `company.service`: create + slug uniqueness; `inviteEmployee` creates a pending employee,
    blocks a duplicate employee email, **allows** the same email as an existing `individual`,
    blocks an inactive company; `setEmployeeStatus`; `resendInvite` rotates the token.
  - `employee.auth.service`: `activate` (valid token → active + verified, invalid token →
    `INVALID_INVITE`, already-active → error); `login` (scoped, rejects wrong account type, rejects
    deactivated employee, rejects inactive company).
- **Integration (supertest):**
  - admin creates company → invite → activate → employee login (happy path);
  - a same-email B2B buyer login still works and is unaffected by the employee record;
  - `isEmployee` guard returns `403` for deactivated employee / inactive company.

Mock `mail.service`, `user.repository`, and `company.repository` in unit tests; mock auth
middleware + services in route tests (matching the existing test conventions).

---

## 8. Out of scope (later sub-projects / specs)
- Per-company catalog visibility + company-private products (**2b**).
- Wallet / credit points (**2c**).
- Employee ordering, company-scoped coupons, wallet + Razorpay settlement (**2d**).
- Company-admin role / employee self-management (Phase 1 decision: flat employees, platform-admin
  managed).
- Bulk / CSV employee import.
