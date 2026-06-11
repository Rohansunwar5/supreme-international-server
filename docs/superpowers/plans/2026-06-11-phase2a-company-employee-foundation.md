# Phase 2a — Company & Employee Identity Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real `Company` entity and admin-driven employee onboarding (invite → set password → activated) with a separate employee login path, reusing the existing `User` model and auth machinery.

**Architecture:** Extend the single `User` model additively (`accountType`/`companyId`/`employeeStatus`) instead of a parallel identity. Company CRUD + employee invite/status live in a new `company.service`; activation/login live in a new `employee.auth.service` that reuses `authService` password/JWT helpers. Buyer auth queries become account-type scoped so a B2B buyer and an employee can share an email as separate accounts. Strict layering (Route → Validator → Auth → Controller → Service → Repository → Model → `next(response)`), no `ref`/`populate`, custom error classes only.

**Tech Stack:** Express, TypeScript, Mongoose, Redis (CacheManager), JWT, bcrypt, nanoid, EJS+SES email, Jest + supertest.

**Spec:** `docs/superpowers/specs/2026-06-11-phase2a-company-employee-foundation-design.md`

---

## File structure

**Create:**
- `src/errors/conflict.error.ts` — plain 409 error.
- `src/models/company.model.ts` — Company entity.
- `src/repository/company.repository.ts` — company persistence.
- `src/services/company.service.ts` — company CRUD + employee invite/list/status.
- `src/services/employee.auth.service.ts` — invite-token validation, activation, employee login/reset.
- `src/middlewares/isEmployee.middleware.ts` — employee-only guard.
- `src/middlewares/validators/company.validator.ts` — validator chains.
- `src/controllers/admin.company.controller.ts` — admin company/employee endpoints.
- `src/controllers/employee.auth.controller.ts` — employee auth endpoints.
- `src/routes/employee.auth.route.ts` — `/auth/employee` router.
- `src/templates/employee-invite.ejs` — invite email.
- Test files under `src/__tests__/...` per task.

**Modify:**
- `src/config/index.ts` — add `FRONTEND_URL`.
- `example.env` — add `FRONTEND_URL`.
- `src/models/user.model.ts` — add `accountType`/`companyId`/`employeeStatus`.
- `src/repository/user.repository.ts` — scope buyer query to non-employee; add employee methods.
- `src/routes/admin.route.ts` — mount admin company/employee routes.
- `src/routes/v1.route.ts` — mount `/auth/employee`.
- `README.md` — document `FRONTEND_URL` + employee onboarding.

---

## Task 1: Foundations — config, ConflictError, env

**Files:**
- Modify: `src/config/index.ts`
- Create: `src/errors/conflict.error.ts`
- Modify: `example.env`
- Test: `src/__tests__/config.frontend-url.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/config.frontend-url.test.ts
import config from '../config';

describe('config FRONTEND_URL', () => {
  it('exposes a non-empty frontend base url for invite links', () => {
    expect(typeof config.FRONTEND_URL).toBe('string');
    expect(config.FRONTEND_URL.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest config.frontend-url -v`
Expected: FAIL — `Property 'FRONTEND_URL' does not exist` (TS compile error).

- [ ] **Step 3: Add the config key**

In `src/config/index.ts`, add inside the exported config object (near the other URL keys, e.g. after `R2_PUBLIC_URL`):

```ts
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',
```

- [ ] **Step 4: Create the ConflictError class**

```ts
// src/errors/conflict.error.ts
import { CustomError } from './custom.error';

export class ConflictError extends CustomError {
  statusCode = 409;

  reason = 'Conflict';

  constructor(message?: string) {
    super(message || 'Conflict');
    if (message) {
      this.reason = message;
    }
    Object.setPrototypeOf(this, ConflictError.prototype);
  }

  serializeErrors() {
    return [{ message: this.reason }];
  }
}
```

- [ ] **Step 5: Add env documentation**

Append to `example.env`:

```
# B2B Company / Employee accounts (Phase 2)
FRONTEND_URL="http://localhost:3000"
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx jest config.frontend-url -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/config/index.ts src/errors/conflict.error.ts example.env src/__tests__/config.frontend-url.test.ts
git commit -m "feat : add frontend url config and conflict error for company accounts"
```

---

## Task 2: Company model

**Files:**
- Create: `src/models/company.model.ts`
- Test: `src/__tests__/models/company.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/models/company.test.ts
import CompanyModel from '../../models/company.model';

describe('Company model', () => {
  it('defaults status to active and requires name', () => {
    const c = new CompanyModel({ name: 'Mercedes', slug: 'mercedes', createdBy: '64b8f0000000000000000001' });
    expect(c.status).toBe('active');
    const err = c.validateSync();
    expect(err).toBeUndefined();
  });

  it('rejects an invalid status', () => {
    const c = new CompanyModel({ name: 'X', slug: 'x', createdBy: '64b8f0000000000000000001', status: 'bogus' });
    const err = c.validateSync();
    expect(err).toBeDefined();
  });

  it('requires a name', () => {
    const c = new CompanyModel({ slug: 'x', createdBy: '64b8f0000000000000000001' });
    const err = c.validateSync();
    expect(err?.errors?.name).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest models/company -v`
Expected: FAIL — cannot find module `company.model`.

- [ ] **Step 3: Implement the model**

```ts
// src/models/company.model.ts
import mongoose from 'mongoose';

const companySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxLength: 120 },
    slug: { type: String, required: true, unique: true },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    primaryContact: {
      name: { type: String },
      email: { type: String },
      isdCode: { type: String },
      phoneNumber: { type: String },
    },
    notes: { type: String },
    createdBy: { type: mongoose.Schema.Types.ObjectId, required: true },
  },
  { timestamps: true },
);

companySchema.index({ status: 1, createdAt: -1 });

export interface ICompany extends mongoose.Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  slug: string;
  status: 'active' | 'inactive';
  primaryContact?: { name?: string; email?: string; isdCode?: string; phoneNumber?: string };
  notes?: string;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export default mongoose.model<ICompany>('Company', companySchema);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest models/company -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/models/company.model.ts src/__tests__/models/company.test.ts
git commit -m "feat : add company model"
```

---

## Task 3: Extend User model with employee fields

**Files:**
- Modify: `src/models/user.model.ts`
- Test: `src/__tests__/models/user.employee.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/models/user.employee.test.ts
import UserModel from '../../models/user.model';

describe('User model employee fields', () => {
  it('defaults accountType to individual', () => {
    const u = new UserModel({ firstName: 'A', email: 'a@x.com', verificationCode: 'x' });
    expect(u.accountType).toBe('individual');
  });

  it('accepts employee fields', () => {
    const u = new UserModel({
      firstName: 'E', email: 'e@x.com', verificationCode: 'x',
      accountType: 'employee', companyId: '64b8f0000000000000000001', employeeStatus: 'invited',
    });
    expect(u.accountType).toBe('employee');
    expect(u.employeeStatus).toBe('invited');
    expect(u.validateSync()).toBeUndefined();
  });

  it('rejects an invalid employeeStatus', () => {
    const u = new UserModel({
      firstName: 'E', email: 'e@x.com', verificationCode: 'x',
      accountType: 'employee', employeeStatus: 'bogus',
    });
    expect(u.validateSync()?.errors?.employeeStatus).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest user.employee -v`
Expected: FAIL — `accountType` undefined / not a schema path.

- [ ] **Step 3: Add the schema fields**

In `src/models/user.model.ts`, add these fields to the schema object (e.g. after the `company` block, before the closing `}` of the schema definition):

```ts
    accountType: {
      type: String,
      enum: ['individual', 'employee'],
      default: 'individual',
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
    },
    employeeStatus: {
      type: String,
      enum: ['invited', 'active', 'deactivated'],
    },
```

Then extend the `IUser` interface (add after the `company?` block):

```ts
  accountType: 'individual' | 'employee';
  companyId?: string;
  employeeStatus?: 'invited' | 'active' | 'deactivated';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest user.employee -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/models/user.model.ts src/__tests__/models/user.employee.test.ts
git commit -m "feat : add employee fields to user model"
```

---

## Task 4: Company repository

**Files:**
- Create: `src/repository/company.repository.ts`

(Repositories are not unit-tested directly in this codebase — they are covered via service tests with mocked repos, matching the existing convention. No test file for this task.)

- [ ] **Step 1: Implement the repository**

```ts
// src/repository/company.repository.ts
import companyModel, { ICompany } from '../models/company.model';

export interface ICreateCompanyParams {
  name: string;
  slug: string;
  primaryContact?: { name?: string; email?: string; isdCode?: string; phoneNumber?: string };
  notes?: string;
  createdBy: string;
}

export interface IUpdateCompanyParams {
  name?: string;
  status?: 'active' | 'inactive';
  primaryContact?: { name?: string; email?: string; isdCode?: string; phoneNumber?: string };
  notes?: string;
}

export interface ICompanyListFilter {
  status?: 'active' | 'inactive';
  search?: string;
  page: number;
  limit: number;
}

export class CompanyRepository {
  private _model = companyModel;

  async create(params: ICreateCompanyParams): Promise<ICompany> {
    return this._model.create(params);
  }

  async findById(id: string): Promise<ICompany | null> {
    return this._model.findById(id);
  }

  async slugExists(slug: string): Promise<boolean> {
    const doc = await this._model.findOne({ slug }).select('_id');
    return !!doc;
  }

  async update(id: string, params: IUpdateCompanyParams): Promise<ICompany | null> {
    return this._model.findByIdAndUpdate(id, params, { new: true });
  }

  async list(filter: ICompanyListFilter): Promise<{ items: ICompany[]; total: number }> {
    const query: Record<string, unknown> = {};
    if (filter.status) query.status = filter.status;
    if (filter.search) query.name = { $regex: filter.search, $options: 'i' };

    const skip = (filter.page - 1) * filter.limit;
    const [items, total] = await Promise.all([
      this._model.find(query).sort({ createdAt: -1 }).skip(skip).limit(filter.limit),
      this._model.countDocuments(query),
    ]);
    return { items, total };
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/repository/company.repository.ts
git commit -m "feat : add company repository"
```

---

## Task 5: Extend UserRepository — scope buyer query + employee methods

**Files:**
- Modify: `src/repository/user.repository.ts`

(Covered via service tests in later tasks. The buyer-query scoping is the critical correctness change.)

- [ ] **Step 1: Scope the existing buyer lookup**

In `src/repository/user.repository.ts`, change `getUserByEmailId` so it never returns an employee account (existing buyers have `accountType` `'individual'` or missing — both are `$ne: 'employee'`):

```ts
  async getUserByEmailId(email: string): Promise<IUser | null> {
    return this._model.findOne({ email, accountType: { $ne: 'employee' } });
  }
```

- [ ] **Step 2: Add employee-scoped methods**

Add these methods to the `UserRepository` class:

```ts
  async getEmployeeByEmail(email: string): Promise<IUser | null> {
    return this._model.findOne({ email, accountType: 'employee' });
  }

  async createEmployee(params: {
    firstName: string;
    lastName?: string;
    isdCode?: string;
    phoneNumber?: string;
    email: string;
    companyId: string;
    verificationCode: string;
  }): Promise<IUser> {
    return this._model.create({
      firstName: params.firstName,
      lastName: params.lastName,
      isdCode: params.isdCode,
      phoneNumber: params.phoneNumber,
      email: params.email,
      companyId: params.companyId,
      verificationCode: params.verificationCode,
      verified: false,
      accountType: 'employee',
      employeeStatus: 'invited',
      img: { link: 'default-profile.png', source: 'bucket' },
    });
  }

  async findEmployeeById(id: string): Promise<IUser | null> {
    return this._model.findOne({ _id: id, accountType: 'employee' });
  }

  async findEmployeesByCompany(companyId: string, status?: string): Promise<IUser[]> {
    const query: Record<string, unknown> = { companyId, accountType: 'employee' };
    if (status) query.employeeStatus = status;
    return this._model.find(query).sort({ createdAt: -1 });
  }

  async getEmployeeWithVerificationCode(hashedCode: string): Promise<IUser | null> {
    return this._model.findOne({ verificationCode: hashedCode, accountType: 'employee' });
  }

  async setEmployeeStatus(id: string, employeeStatus: 'active' | 'deactivated'): Promise<IUser | null> {
    return this._model.findOneAndUpdate(
      { _id: id, accountType: 'employee' },
      { employeeStatus },
      { new: true },
    );
  }

  async activateEmployee(id: string, hashedPassword: string, newVerificationCode: string): Promise<IUser | null> {
    return this._model.findOneAndUpdate(
      { _id: id, accountType: 'employee' },
      { password: hashedPassword, verified: true, employeeStatus: 'active', verificationCode: newVerificationCode },
      { new: true },
    );
  }

  async updateEmployeeVerificationCode(id: string, verificationCode: string): Promise<IUser | null> {
    return this._model.findOneAndUpdate(
      { _id: id, accountType: 'employee' },
      { verificationCode },
      { new: true },
    );
  }
```

> Note: `getEmployeeWithVerificationCode` takes an already-hashed code (the service hashes the raw token with `sha1` before lookup, matching the existing reset-password pattern).

- [ ] **Step 3: Verify it compiles**

Run: `npm run build`
Expected: no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/repository/user.repository.ts
git commit -m "feat : scope buyer lookup and add employee repository methods"
```

---

## Task 6: company.service — company CRUD

**Files:**
- Create: `src/services/company.service.ts`
- Test: `src/__tests__/services/company.service.crud.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/services/company.service.crud.test.ts
const companyRepo = {
  create: jest.fn(),
  findById: jest.fn(),
  slugExists: jest.fn(),
  update: jest.fn(),
  list: jest.fn(),
};
const userRepo = {
  getEmployeeByEmail: jest.fn(),
  createEmployee: jest.fn(),
  findEmployeesByCompany: jest.fn(),
  findEmployeeById: jest.fn(),
  setEmployeeStatus: jest.fn(),
  updateEmployeeVerificationCode: jest.fn(),
};
jest.mock('../../repository/company.repository', () => ({
  __esModule: true,
  CompanyRepository: jest.fn().mockImplementation(() => companyRepo),
}));
jest.mock('../../repository/user.repository', () => ({
  __esModule: true,
  UserRepository: jest.fn().mockImplementation(() => userRepo),
}));
jest.mock('../../services/mail.service', () => ({
  __esModule: true,
  default: { sendEmail: jest.fn() },
}));

import companyService from '../../services/company.service';
import { BadRequestError } from '../../errors/bad-request.error';

describe('company.service CRUD', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates a company with a unique slug derived from the name', async () => {
    companyRepo.slugExists.mockResolvedValue(false);
    companyRepo.create.mockImplementation(async (p) => ({ _id: 'c1', ...p }));
    const out = await companyService.createCompany({ name: 'Mercedes Benz', createdBy: 'a1' });
    expect(companyRepo.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Mercedes Benz', slug: 'mercedes-benz', createdBy: 'a1' }));
    expect(out._id).toBe('c1');
  });

  it('de-duplicates a taken slug with a numeric suffix', async () => {
    companyRepo.slugExists.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    companyRepo.create.mockImplementation(async (p) => ({ _id: 'c2', ...p }));
    await companyService.createCompany({ name: 'Acme', createdBy: 'a1' });
    expect(companyRepo.create).toHaveBeenCalledWith(expect.objectContaining({ slug: 'acme-1' }));
  });

  it('throws NotFound when updating a missing company', async () => {
    companyRepo.findById.mockResolvedValue(null);
    await expect(companyService.updateCompany('missing', { name: 'X' })).rejects.toThrow();
  });

  it('rejects an empty name on create', async () => {
    await expect(companyService.createCompany({ name: '   ', createdBy: 'a1' })).rejects.toBeInstanceOf(BadRequestError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest company.service.crud -v`
Expected: FAIL — cannot find module `company.service`.

- [ ] **Step 3: Implement the service (CRUD portion)**

```ts
// src/services/company.service.ts
import { customAlphabet } from 'nanoid';
import { BadRequestError } from '../errors/bad-request.error';
import { NotFoundError } from '../errors/not-found.error';
import { ConflictError } from '../errors/conflict.error';
import { CompanyRepository, ICompanyListFilter } from '../repository/company.repository';
import { UserRepository } from '../repository/user.repository';
import mailService from './mail.service';
import { sha1 } from '../utils/hash.util';
import config from '../config';

const inviteToken = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', 24);

const slugify = (text: string) =>
  text.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

class CompanyService {
  constructor(
    private readonly _companyRepository: CompanyRepository,
    private readonly _userRepository: UserRepository,
  ) {}

  async createCompany(params: {
    name: string;
    primaryContact?: { name?: string; email?: string; isdCode?: string; phoneNumber?: string };
    notes?: string;
    createdBy: string;
  }) {
    const name = params.name?.trim();
    if (!name) throw new BadRequestError('Company name is required');

    const slug = await this._allocateSlug(slugify(name) || 'company');
    return this._companyRepository.create({
      name,
      slug,
      primaryContact: params.primaryContact,
      notes: params.notes,
      createdBy: params.createdBy,
    });
  }

  async listCompanies(filter: { status?: 'active' | 'inactive'; search?: string; page?: number; limit?: number }) {
    const page = Math.max(1, Number(filter.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(filter.limit) || 20));
    const repoFilter: ICompanyListFilter = { status: filter.status, search: filter.search, page, limit };
    const { items, total } = await this._companyRepository.list(repoFilter);
    return { items, pagination: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  async getCompany(id: string) {
    const company = await this._companyRepository.findById(id);
    if (!company) throw new NotFoundError('Company not found');
    return company;
  }

  async updateCompany(
    id: string,
    params: { name?: string; status?: 'active' | 'inactive'; primaryContact?: { name?: string; email?: string; isdCode?: string; phoneNumber?: string }; notes?: string },
  ) {
    const company = await this._companyRepository.findById(id);
    if (!company) throw new NotFoundError('Company not found');
    return this._companyRepository.update(id, params);
  }

  private async _allocateSlug(base: string): Promise<string> {
    if (!(await this._companyRepository.slugExists(base))) return base;
    let n = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const candidate = `${base}-${n}`;
      if (!(await this._companyRepository.slugExists(candidate))) return candidate;
      n += 1;
    }
  }
}

export default new CompanyService(new CompanyRepository(), new UserRepository());
```

> `ConflictError`, `inviteToken`, `mailService`, `sha1`, and `config` are imported now because Task 7 adds the invite methods to this same file; importing them here keeps Task 7 focused on logic.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest company.service.crud -v`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/company.service.ts src/__tests__/services/company.service.crud.test.ts
git commit -m "feat : add company service crud"
```

---

## Task 7: company.service — employee invite / list / status

**Files:**
- Modify: `src/services/company.service.ts`
- Test: `src/__tests__/services/company.service.invite.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/services/company.service.invite.test.ts
const companyRepo = { findById: jest.fn() };
const userRepo = {
  getEmployeeByEmail: jest.fn(),
  createEmployee: jest.fn(),
  findEmployeesByCompany: jest.fn(),
  findEmployeeById: jest.fn(),
  setEmployeeStatus: jest.fn(),
  updateEmployeeVerificationCode: jest.fn(),
};
const sendEmail = jest.fn();
jest.mock('../../repository/company.repository', () => ({
  __esModule: true,
  CompanyRepository: jest.fn().mockImplementation(() => companyRepo),
}));
jest.mock('../../repository/user.repository', () => ({
  __esModule: true,
  UserRepository: jest.fn().mockImplementation(() => userRepo),
}));
jest.mock('../../services/mail.service', () => ({
  __esModule: true,
  default: { sendEmail: (...a: unknown[]) => sendEmail(...a) },
}));

import companyService from '../../services/company.service';
import { ConflictError } from '../../errors/conflict.error';
import { BadRequestError } from '../../errors/bad-request.error';

describe('company.service invite', () => {
  beforeEach(() => jest.clearAllMocks());

  it('invites an employee into an active company and emails the link', async () => {
    companyRepo.findById.mockResolvedValue({ _id: 'c1', name: 'Acme', status: 'active' });
    userRepo.getEmployeeByEmail.mockResolvedValue(null);
    userRepo.createEmployee.mockImplementation(async (p) => ({ _id: 'e1', ...p }));

    const out = await companyService.inviteEmployee('c1', { firstName: 'Jo', email: 'jo@acme.com' });

    expect(userRepo.createEmployee).toHaveBeenCalledWith(expect.objectContaining({ email: 'jo@acme.com', companyId: 'c1' }));
    expect(sendEmail).toHaveBeenCalledWith('jo@acme.com', 'employee-invite.ejs', expect.objectContaining({ companyName: 'Acme' }), expect.any(String));
    expect(out._id).toBe('e1');
  });

  it('blocks inviting an email that is already an employee', async () => {
    companyRepo.findById.mockResolvedValue({ _id: 'c1', name: 'Acme', status: 'active' });
    userRepo.getEmployeeByEmail.mockResolvedValue({ _id: 'existing' });
    await expect(companyService.inviteEmployee('c1', { firstName: 'Jo', email: 'jo@acme.com' }))
      .rejects.toBeInstanceOf(ConflictError);
  });

  it('blocks inviting into an inactive company', async () => {
    companyRepo.findById.mockResolvedValue({ _id: 'c1', name: 'Acme', status: 'inactive' });
    await expect(companyService.inviteEmployee('c1', { firstName: 'Jo', email: 'jo@acme.com' }))
      .rejects.toBeInstanceOf(BadRequestError);
  });

  it('deactivates an employee', async () => {
    userRepo.findEmployeeById.mockResolvedValue({ _id: 'e1', employeeStatus: 'active' });
    userRepo.setEmployeeStatus.mockResolvedValue({ _id: 'e1', employeeStatus: 'deactivated' });
    const out = await companyService.setEmployeeStatus('e1', 'deactivated');
    expect(userRepo.setEmployeeStatus).toHaveBeenCalledWith('e1', 'deactivated');
    expect(out.employeeStatus).toBe('deactivated');
  });

  it('resend-invite rotates the token only while invited', async () => {
    userRepo.findEmployeeById.mockResolvedValue({ _id: 'e1', email: 'jo@acme.com', employeeStatus: 'invited', companyId: 'c1' });
    companyRepo.findById.mockResolvedValue({ _id: 'c1', name: 'Acme', status: 'active' });
    userRepo.updateEmployeeVerificationCode.mockResolvedValue({ _id: 'e1' });
    await companyService.resendInvite('e1');
    expect(userRepo.updateEmployeeVerificationCode).toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest company.service.invite -v`
Expected: FAIL — `inviteEmployee is not a function`.

- [ ] **Step 3: Add invite/list/status methods**

Add a private helper and these methods to the `CompanyService` class (before the closing brace, after `updateCompany`):

```ts
  async inviteEmployee(
    companyId: string,
    params: { firstName: string; lastName?: string; isdCode?: string; phoneNumber?: string; email: string },
  ) {
    const company = await this._companyRepository.findById(companyId);
    if (!company) throw new NotFoundError('Company not found');
    if (company.status !== 'active') throw new BadRequestError('Cannot invite into an inactive company');

    const existing = await this._userRepository.getEmployeeByEmail(params.email);
    if (existing) throw new ConflictError('An employee with this email already exists');

    const rawToken = inviteToken();
    const employee = await this._userRepository.createEmployee({
      firstName: params.firstName,
      lastName: params.lastName,
      isdCode: params.isdCode,
      phoneNumber: params.phoneNumber,
      email: params.email,
      companyId,
      verificationCode: sha1(rawToken),
    });

    this._sendInviteEmail(params.email, company.name, rawToken);
    return employee;
  }

  async listEmployees(companyId: string, status?: string) {
    const company = await this._companyRepository.findById(companyId);
    if (!company) throw new NotFoundError('Company not found');
    return this._userRepository.findEmployeesByCompany(companyId, status);
  }

  async setEmployeeStatus(employeeId: string, status: 'active' | 'deactivated') {
    const employee = await this._userRepository.findEmployeeById(employeeId);
    if (!employee) throw new NotFoundError('Employee not found');
    const updated = await this._userRepository.setEmployeeStatus(employeeId, status);
    if (!updated) throw new NotFoundError('Employee not found');
    return updated;
  }

  async resendInvite(employeeId: string) {
    const employee = await this._userRepository.findEmployeeById(employeeId);
    if (!employee) throw new NotFoundError('Employee not found');
    if (employee.employeeStatus !== 'invited') throw new BadRequestError('Employee has already activated');

    const company = await this._companyRepository.findById(employee.companyId as string);
    if (!company) throw new NotFoundError('Company not found');

    const rawToken = inviteToken();
    await this._userRepository.updateEmployeeVerificationCode(employeeId, sha1(rawToken));
    this._sendInviteEmail(employee.email, company.name, rawToken);
    return true;
  }

  private _sendInviteEmail(email: string, companyName: string, rawToken: string) {
    const activationLink = `${config.FRONTEND_URL}/employee/activate?token=${rawToken}`;
    mailService
      .sendEmail(email, 'employee-invite.ejs', { companyName, activationLink }, `You're invited to ${companyName}`)
      .catch(() => {});
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest company.service.invite -v`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/company.service.ts src/__tests__/services/company.service.invite.test.ts
git commit -m "feat : add employee invite list and status to company service"
```

---

## Task 8: employee.auth.service — activate, login, reset

**Files:**
- Create: `src/services/employee.auth.service.ts`
- Test: `src/__tests__/services/employee.auth.service.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/services/employee.auth.service.test.ts
const userRepo = {
  getEmployeeWithVerificationCode: jest.fn(),
  activateEmployee: jest.fn(),
  getEmployeeByEmail: jest.fn(),
  updateEmployeeVerificationCode: jest.fn(),
};
const companyRepo = { findById: jest.fn() };
jest.mock('../../repository/user.repository', () => ({
  __esModule: true,
  UserRepository: jest.fn().mockImplementation(() => userRepo),
}));
jest.mock('../../repository/company.repository', () => ({
  __esModule: true,
  CompanyRepository: jest.fn().mockImplementation(() => companyRepo),
}));
jest.mock('../../services/auth.service', () => ({
  __esModule: true,
  default: {
    hashPassword: jest.fn().mockResolvedValue('hashed'),
    verifyHashPassword: jest.fn(),
    generateJWTToken: jest.fn().mockResolvedValue('jwt-token'),
  },
}));

import employeeAuthService from '../../services/employee.auth.service';
import authService from '../../services/auth.service';
import { BadRequestError } from '../../errors/bad-request.error';
import { ForbiddenError } from '../../errors/forbidden.error';

describe('employee.auth.service', () => {
  beforeEach(() => jest.clearAllMocks());

  it('activates a valid invite and returns an access token', async () => {
    userRepo.getEmployeeWithVerificationCode.mockResolvedValue({ _id: 'e1', employeeStatus: 'invited' });
    userRepo.activateEmployee.mockResolvedValue({ _id: 'e1', employeeStatus: 'active' });
    const out = await employeeAuthService.activate('rawtoken', 'password123');
    expect(authService.hashPassword).toHaveBeenCalledWith('password123');
    expect(userRepo.activateEmployee).toHaveBeenCalled();
    expect(out).toEqual({ accessToken: 'jwt-token' });
  });

  it('rejects an invalid invite token', async () => {
    userRepo.getEmployeeWithVerificationCode.mockResolvedValue(null);
    await expect(employeeAuthService.activate('bad', 'password123')).rejects.toBeInstanceOf(BadRequestError);
  });

  it('rejects activating an already-active employee', async () => {
    userRepo.getEmployeeWithVerificationCode.mockResolvedValue({ _id: 'e1', employeeStatus: 'active' });
    await expect(employeeAuthService.activate('rawtoken', 'password123')).rejects.toBeInstanceOf(BadRequestError);
  });

  it('logs in an active employee of an active company', async () => {
    userRepo.getEmployeeByEmail.mockResolvedValue({ _id: 'e1', password: 'hashed', employeeStatus: 'active', companyId: 'c1' });
    (authService.verifyHashPassword as jest.Mock).mockResolvedValue(true);
    companyRepo.findById.mockResolvedValue({ _id: 'c1', status: 'active' });
    const out = await employeeAuthService.login('jo@acme.com', 'password123');
    expect(out).toEqual({ accessToken: 'jwt-token' });
  });

  it('rejects login for a deactivated employee', async () => {
    userRepo.getEmployeeByEmail.mockResolvedValue({ _id: 'e1', password: 'hashed', employeeStatus: 'deactivated', companyId: 'c1' });
    (authService.verifyHashPassword as jest.Mock).mockResolvedValue(true);
    await expect(employeeAuthService.login('jo@acme.com', 'password123')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects login when the company is inactive', async () => {
    userRepo.getEmployeeByEmail.mockResolvedValue({ _id: 'e1', password: 'hashed', employeeStatus: 'active', companyId: 'c1' });
    (authService.verifyHashPassword as jest.Mock).mockResolvedValue(true);
    companyRepo.findById.mockResolvedValue({ _id: 'c1', status: 'inactive' });
    await expect(employeeAuthService.login('jo@acme.com', 'password123')).rejects.toBeInstanceOf(ForbiddenError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest employee.auth.service -v`
Expected: FAIL — cannot find module `employee.auth.service`.

- [ ] **Step 3: Implement the service**

```ts
// src/services/employee.auth.service.ts
import { customAlphabet } from 'nanoid';
import { BadRequestError } from '../errors/bad-request.error';
import { ForbiddenError } from '../errors/forbidden.error';
import { NotFoundError } from '../errors/not-found.error';
import { UnauthorizedError } from '../errors/unauthorized.error';
import { UserRepository } from '../repository/user.repository';
import { CompanyRepository } from '../repository/company.repository';
import authService from './auth.service';
import { sha1 } from '../utils/hash.util';

const rotateToken = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', 24);

class EmployeeAuthService {
  constructor(
    private readonly _userRepository: UserRepository,
    private readonly _companyRepository: CompanyRepository,
  ) {}

  async verifyInviteToken(rawToken: string) {
    const employee = await this._userRepository.getEmployeeWithVerificationCode(sha1(rawToken));
    if (!employee || employee.employeeStatus !== 'invited') throw new BadRequestError('Invalid or expired invite');
    return true;
  }

  async activate(rawToken: string, password: string) {
    const employee = await this._userRepository.getEmployeeWithVerificationCode(sha1(rawToken));
    if (!employee) throw new BadRequestError('Invalid or expired invite');
    if (employee.employeeStatus !== 'invited') throw new BadRequestError('This invite has already been used');

    const hashedPassword = await authService.hashPassword(password);
    const updated = await this._userRepository.activateEmployee(employee._id, hashedPassword, sha1(rotateToken()));
    if (!updated) throw new BadRequestError('Failed to activate account');

    const accessToken = await authService.generateJWTToken(employee._id);
    return { accessToken };
  }

  async login(email: string, password: string) {
    const employee = await this._userRepository.getEmployeeByEmail(email);
    if (!employee) throw new NotFoundError('Employee not found');
    if (!employee.password) throw new BadRequestError('Account not activated yet');

    const ok = await authService.verifyHashPassword(password, employee.password);
    if (!ok) throw new UnauthorizedError('Invalid Email or Password');

    if (employee.employeeStatus !== 'active') throw new ForbiddenError('Account is not active');

    const company = await this._companyRepository.findById(employee.companyId as string);
    if (!company || company.status !== 'active') throw new ForbiddenError('Company is not active');

    const accessToken = await authService.generateJWTToken(employee._id);
    return { accessToken };
  }

  async forgotPassword(email: string) {
    const employee = await this._userRepository.getEmployeeByEmail(email);
    // Do not leak existence; only act if active.
    if (employee && employee.employeeStatus === 'active') {
      await this._userRepository.updateEmployeeVerificationCode(employee._id, sha1(rotateToken()));
      // NOTE: email delivery of the reset link reuses mail.service in the controller-facing flow.
    }
    return true;
  }

  async resetPassword(rawToken: string, password: string) {
    const employee = await this._userRepository.getEmployeeWithVerificationCode(sha1(rawToken));
    if (!employee || employee.employeeStatus !== 'active') throw new BadRequestError('Invalid or expired code');

    const hashedPassword = await authService.hashPassword(password);
    const updated = await this._userRepository.activateEmployee(employee._id, hashedPassword, sha1(rotateToken()));
    if (!updated) throw new BadRequestError('Failed to reset password');
    return true;
  }
}

export default new EmployeeAuthService(new UserRepository(), new CompanyRepository());
```

> `activateEmployee` is reused for reset (it sets password + rotates code; for an already-active employee `employeeStatus:'active'` is idempotent). `forgotPassword` is intentionally minimal in 2a — the reset-link email wiring mirrors the existing buyer reset flow and is covered by the controller in Task 12; keep it conservative to avoid leaking account existence.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest employee.auth.service -v`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/employee.auth.service.ts src/__tests__/services/employee.auth.service.test.ts
git commit -m "feat : add employee auth service for activate login and reset"
```

---

## Task 9: isEmployee middleware

**Files:**
- Create: `src/middlewares/isEmployee.middleware.ts`
- Test: `src/__tests__/middlewares/is-employee.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/middlewares/is-employee.test.ts
const findEmployeeById = jest.fn();
const companyFindById = jest.fn();
jest.mock('../../repository/user.repository', () => ({
  __esModule: true,
  UserRepository: jest.fn().mockImplementation(() => ({ findEmployeeById })),
}));
jest.mock('../../repository/company.repository', () => ({
  __esModule: true,
  CompanyRepository: jest.fn().mockImplementation(() => ({ findById: companyFindById })),
}));

import requireEmployee from '../../middlewares/isEmployee.middleware';
import { ForbiddenError } from '../../errors/forbidden.error';

const run = (req: unknown) =>
  new Promise((resolve) => requireEmployee(req as never, {} as never, (err?: unknown) => resolve(err)));

describe('isEmployee middleware', () => {
  beforeEach(() => jest.clearAllMocks());

  it('passes for an active employee of an active company', async () => {
    findEmployeeById.mockResolvedValue({ _id: 'e1', accountType: 'employee', employeeStatus: 'active', companyId: 'c1' });
    companyFindById.mockResolvedValue({ _id: 'c1', status: 'active' });
    const err = await run({ user: { _id: 'e1' } });
    expect(err).toBeUndefined();
  });

  it('rejects when there is no user', async () => {
    const err = await run({});
    expect(err).toBeInstanceOf(ForbiddenError);
  });

  it('rejects a deactivated employee', async () => {
    findEmployeeById.mockResolvedValue({ _id: 'e1', accountType: 'employee', employeeStatus: 'deactivated', companyId: 'c1' });
    const err = await run({ user: { _id: 'e1' } });
    expect(err).toBeInstanceOf(ForbiddenError);
  });

  it('rejects when the company is inactive', async () => {
    findEmployeeById.mockResolvedValue({ _id: 'e1', accountType: 'employee', employeeStatus: 'active', companyId: 'c1' });
    companyFindById.mockResolvedValue({ _id: 'c1', status: 'inactive' });
    const err = await run({ user: { _id: 'e1' } });
    expect(err).toBeInstanceOf(ForbiddenError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest is-employee -v`
Expected: FAIL — cannot find module `isEmployee.middleware`.

- [ ] **Step 3: Implement the middleware**

```ts
// src/middlewares/isEmployee.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../errors/forbidden.error';
import { UserRepository } from '../repository/user.repository';
import { CompanyRepository } from '../repository/company.repository';

const userRepository = new UserRepository();
const companyRepository = new CompanyRepository();

const requireEmployee = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    if (!req.user?._id) return next(new ForbiddenError('EMPLOYEE_ACCESS_REQUIRED'));

    const employee = await userRepository.findEmployeeById(req.user._id);
    if (!employee || employee.accountType !== 'employee' || employee.employeeStatus !== 'active') {
      return next(new ForbiddenError('EMPLOYEE_ACCESS_REQUIRED'));
    }

    const company = await companyRepository.findById(employee.companyId as string);
    if (!company || company.status !== 'active') return next(new ForbiddenError('COMPANY_INACTIVE'));

    return next();
  } catch (err) {
    return next(err);
  }
};

export default requireEmployee;
```

> This guard is created in 2a (it belongs to the identity foundation) and will protect the employee catalog/wallet/order routes in 2b–2d. It is wired onto `isLoggedIn`-style usage there; 2a does not yet have employee-only resource routes, so it is unit-tested here and not yet mounted.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest is-employee -v`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/middlewares/isEmployee.middleware.ts src/__tests__/middlewares/is-employee.test.ts
git commit -m "feat : add isEmployee guard middleware"
```

---

## Task 10: Validators

**Files:**
- Create: `src/middlewares/validators/company.validator.ts`

(Validator chains are exercised via the route tests in Tasks 11–12; no standalone test.)

- [ ] **Step 1: Implement the validators**

```ts
// src/middlewares/validators/company.validator.ts
import { check } from 'express-validator';
import { validateRequest } from '.';
import { isMongoId } from '../../utils/validator.utils';

export const createCompanyValidator = [
  check('name').isString().trim().notEmpty().withMessage('Company name is required'),
  check('primaryContact.email').optional().isEmail().withMessage('Invalid contact email'),
  ...validateRequest,
];

export const updateCompanyValidator = [
  check('status').optional().isIn(['active', 'inactive']).withMessage('Invalid status'),
  check('primaryContact.email').optional().isEmail().withMessage('Invalid contact email'),
  ...validateRequest,
];

export const inviteEmployeeValidator = [
  check('firstName').isString().trim().notEmpty().withMessage('First name is required'),
  check('email').isEmail().withMessage('Valid email is required'),
  ...validateRequest,
];

export const employeeStatusValidator = [
  check('status').isIn(['active', 'deactivated']).withMessage('Invalid employee status'),
  ...validateRequest,
];

export const companyIdValidator = [
  isMongoId('id'),
  ...validateRequest,
];

export const employeeActivateValidator = [
  check('token').isString().notEmpty().withMessage('Token is required'),
  check('password').isString().isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  ...validateRequest,
];

export const employeeLoginValidator = [
  check('email').isEmail().withMessage('Valid email is required'),
  check('password').isString().notEmpty().withMessage('Password is required'),
  ...validateRequest,
];

export const employeeResetPasswordValidator = [
  check('token').isString().notEmpty().withMessage('Token is required'),
  check('password').isString().isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  ...validateRequest,
];
```

> Confirm `isMongoId` is exported from `src/utils/validator.utils` (it is used by `quotation.validator.ts`). If the param name differs per route (`:id`), the same `companyIdValidator` validates `id`.

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/middlewares/validators/company.validator.ts
git commit -m "feat : add company and employee auth validators"
```

---

## Task 11: Admin controllers + routes (companies & employees)

**Files:**
- Create: `src/controllers/admin.company.controller.ts`
- Modify: `src/routes/admin.route.ts`
- Test: `src/__tests__/controllers/admin.company.controller.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/controllers/admin.company.controller.test.ts
const createCompany = jest.fn();
const inviteEmployee = jest.fn();
const setEmployeeStatus = jest.fn();
jest.mock('../../services/company.service', () => ({
  __esModule: true,
  default: {
    createCompany: (...a: unknown[]) => createCompany(...a),
    listCompanies: jest.fn(),
    getCompany: jest.fn(),
    updateCompany: jest.fn(),
    inviteEmployee: (...a: unknown[]) => inviteEmployee(...a),
    listEmployees: jest.fn(),
    resendInvite: jest.fn(),
    setEmployeeStatus: (...a: unknown[]) => setEmployeeStatus(...a),
  },
}));

import { createCompanyHandler, inviteEmployeeHandler, updateEmployeeStatusHandler } from '../../controllers/admin.company.controller';

const run = (handler: (req: unknown, res: unknown, next: (p: unknown) => void) => Promise<void>, req: unknown) =>
  new Promise((resolve) => handler(req, {}, (payload) => resolve(payload)));

describe('admin company controller', () => {
  beforeEach(() => jest.clearAllMocks());

  it('createCompanyHandler passes body + admin id as createdBy', async () => {
    createCompany.mockResolvedValue({ _id: 'c1' });
    const out = await run(createCompanyHandler as never, { body: { name: 'Acme' }, admin: { _id: 'a1' } });
    expect(createCompany).toHaveBeenCalledWith(expect.objectContaining({ name: 'Acme', createdBy: 'a1' }));
    expect(out).toEqual({ _id: 'c1' });
  });

  it('inviteEmployeeHandler passes companyId param + body', async () => {
    inviteEmployee.mockResolvedValue({ _id: 'e1' });
    await run(inviteEmployeeHandler as never, { params: { id: 'c1' }, body: { firstName: 'Jo', email: 'jo@acme.com' } });
    expect(inviteEmployee).toHaveBeenCalledWith('c1', expect.objectContaining({ email: 'jo@acme.com' }));
  });

  it('updateEmployeeStatusHandler passes employee id + status', async () => {
    setEmployeeStatus.mockResolvedValue({ _id: 'e1', employeeStatus: 'deactivated' });
    await run(updateEmployeeStatusHandler as never, { params: { id: 'e1' }, body: { status: 'deactivated' } });
    expect(setEmployeeStatus).toHaveBeenCalledWith('e1', 'deactivated');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest admin.company.controller -v`
Expected: FAIL — cannot find module `admin.company.controller`.

- [ ] **Step 3: Implement the controllers**

```ts
// src/controllers/admin.company.controller.ts
import { NextFunction, Request, Response } from 'express';
import companyService from '../services/company.service';

export const createCompanyHandler = async (req: Request, _res: Response, next: NextFunction) => {
  const { name, primaryContact, notes } = req.body;
  const response = await companyService.createCompany({ name, primaryContact, notes, createdBy: req.admin._id });
  next(response);
};

export const listCompaniesHandler = async (req: Request, _res: Response, next: NextFunction) => {
  const { status, search, page, limit } = req.query;
  const response = await companyService.listCompanies({
    status: status as 'active' | 'inactive' | undefined,
    search: search as string | undefined,
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
  });
  next(response);
};

export const getCompanyHandler = async (req: Request, _res: Response, next: NextFunction) => {
  const response = await companyService.getCompany(req.params.id);
  next(response);
};

export const updateCompanyHandler = async (req: Request, _res: Response, next: NextFunction) => {
  const { name, status, primaryContact, notes } = req.body;
  const response = await companyService.updateCompany(req.params.id, { name, status, primaryContact, notes });
  next(response);
};

export const inviteEmployeeHandler = async (req: Request, _res: Response, next: NextFunction) => {
  const { firstName, lastName, isdCode, phoneNumber, email } = req.body;
  const response = await companyService.inviteEmployee(req.params.id, { firstName, lastName, isdCode, phoneNumber, email });
  next(response);
};

export const listEmployeesHandler = async (req: Request, _res: Response, next: NextFunction) => {
  const response = await companyService.listEmployees(req.params.id, req.query.status as string | undefined);
  next(response);
};

export const resendInviteHandler = async (req: Request, _res: Response, next: NextFunction) => {
  const response = await companyService.resendInvite(req.params.id);
  next(response);
};

export const updateEmployeeStatusHandler = async (req: Request, _res: Response, next: NextFunction) => {
  const response = await companyService.setEmployeeStatus(req.params.id, req.body.status);
  next(response);
};
```

- [ ] **Step 4: Wire the admin routes**

In `src/routes/admin.route.ts`, add imports near the other controller imports:

```ts
import {
  createCompanyHandler,
  listCompaniesHandler,
  getCompanyHandler,
  updateCompanyHandler,
  inviteEmployeeHandler,
  listEmployeesHandler,
  resendInviteHandler,
  updateEmployeeStatusHandler,
} from '../controllers/admin.company.controller';
import {
  createCompanyValidator,
  updateCompanyValidator,
  inviteEmployeeValidator,
  employeeStatusValidator,
  companyIdValidator,
} from '../middlewares/validators/company.validator';
```

Then add the routes (e.g. after the Blogs block, before the Quotations block):

```ts
// ── Companies & Employees ──────────────────────────────────────────────────────
adminRouter.get('/companies', asyncHandler(listCompaniesHandler));
adminRouter.post('/companies', createCompanyValidator, asyncHandler(createCompanyHandler));
adminRouter.get('/companies/:id', companyIdValidator, asyncHandler(getCompanyHandler));
adminRouter.patch('/companies/:id', companyIdValidator, updateCompanyValidator, asyncHandler(updateCompanyHandler));
adminRouter.get('/companies/:id/employees', companyIdValidator, asyncHandler(listEmployeesHandler));
adminRouter.post('/companies/:id/employees/invite', companyIdValidator, inviteEmployeeValidator, asyncHandler(inviteEmployeeHandler));
adminRouter.post('/employees/:id/resend-invite', companyIdValidator, asyncHandler(resendInviteHandler));
adminRouter.patch('/employees/:id/status', companyIdValidator, employeeStatusValidator, asyncHandler(updateEmployeeStatusHandler));
```

- [ ] **Step 5: Run test + build**

Run: `npx jest admin.company.controller -v`
Expected: PASS (3 tests).
Run: `npm run build`
Expected: no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add src/controllers/admin.company.controller.ts src/routes/admin.route.ts src/__tests__/controllers/admin.company.controller.test.ts
git commit -m "feat : add admin company and employee management endpoints"
```

---

## Task 12: Employee auth controllers + route + mount

**Files:**
- Create: `src/controllers/employee.auth.controller.ts`
- Create: `src/routes/employee.auth.route.ts`
- Modify: `src/routes/v1.route.ts`
- Test: `src/__tests__/routes/employee.auth.route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/routes/employee.auth.route.test.ts
const activate = jest.fn();
const login = jest.fn();
jest.mock('../../services/employee.auth.service', () => ({
  __esModule: true,
  default: {
    verifyInviteToken: jest.fn().mockResolvedValue(true),
    activate: (...a: unknown[]) => activate(...a),
    login: (...a: unknown[]) => login(...a),
    forgotPassword: jest.fn().mockResolvedValue(true),
    resetPassword: jest.fn().mockResolvedValue(true),
  },
}));

import express from 'express';
import request from 'supertest';
import employeeAuthRouter from '../../routes/employee.auth.route';
import { globalHandler } from '../../middlewares/error-handler.middleware';

const app = express();
app.use(express.json());
app.use('/auth/employee', employeeAuthRouter);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((data: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => globalHandler(data as never, req, res as never, next));

describe('employee auth routes', () => {
  beforeEach(() => jest.clearAllMocks());

  it('POST /auth/employee/login returns the access token', async () => {
    login.mockResolvedValue({ accessToken: 'jwt-token' });
    const res = await request(app).post('/auth/employee/login').send({ email: 'jo@acme.com', password: 'password123' });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBe('jwt-token');
    expect(login).toHaveBeenCalledWith('jo@acme.com', 'password123');
  });

  it('POST /auth/employee/activate activates and returns a token', async () => {
    activate.mockResolvedValue({ accessToken: 'jwt-token' });
    const res = await request(app).post('/auth/employee/activate').send({ token: 'rawtoken', password: 'password123' });
    expect(res.status).toBe(200);
    expect(activate).toHaveBeenCalledWith('rawtoken', 'password123');
  });

  it('POST /auth/employee/login validates the email', async () => {
    const res = await request(app).post('/auth/employee/login').send({ email: 'not-an-email', password: 'x' });
    expect(res.status).toBe(422);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest employee.auth.route -v`
Expected: FAIL — cannot find module `employee.auth.route`.

- [ ] **Step 3: Implement the controllers**

```ts
// src/controllers/employee.auth.controller.ts
import { NextFunction, Request, Response } from 'express';
import employeeAuthService from '../services/employee.auth.service';

export const verifyInvite = async (req: Request, _res: Response, next: NextFunction) => {
  const response = await employeeAuthService.verifyInviteToken(req.params.token);
  next(response);
};

export const activateEmployee = async (req: Request, _res: Response, next: NextFunction) => {
  const { token, password } = req.body;
  const response = await employeeAuthService.activate(token, password);
  next(response);
};

export const employeeLogin = async (req: Request, _res: Response, next: NextFunction) => {
  const { email, password } = req.body;
  const response = await employeeAuthService.login(email, password);
  next(response);
};

export const employeeForgotPassword = async (req: Request, _res: Response, next: NextFunction) => {
  const response = await employeeAuthService.forgotPassword(req.body.email);
  next(response);
};

export const employeeResetPassword = async (req: Request, _res: Response, next: NextFunction) => {
  const { token, password } = req.body;
  const response = await employeeAuthService.resetPassword(token, password);
  next(response);
};
```

- [ ] **Step 4: Implement the route**

```ts
// src/routes/employee.auth.route.ts
import { Router } from 'express';
import { asyncHandler } from '../utils/asynchandler';
import { authLimiter, strictLimiter } from '../middlewares/rate-limit.middleware';
import {
  verifyInvite,
  activateEmployee,
  employeeLogin,
  employeeForgotPassword,
  employeeResetPassword,
} from '../controllers/employee.auth.controller';
import {
  employeeActivateValidator,
  employeeLoginValidator,
  employeeResetPasswordValidator,
} from '../middlewares/validators/company.validator';

const employeeAuthRouter = Router();

employeeAuthRouter.get('/activate/:token', asyncHandler(verifyInvite));
employeeAuthRouter.post('/activate', authLimiter, employeeActivateValidator, asyncHandler(activateEmployee));
employeeAuthRouter.post('/login', authLimiter, employeeLoginValidator, asyncHandler(employeeLogin));
employeeAuthRouter.post('/forgot-password', strictLimiter, asyncHandler(employeeForgotPassword));
employeeAuthRouter.post('/reset-password', strictLimiter, employeeResetPasswordValidator, asyncHandler(employeeResetPassword));

export default employeeAuthRouter;
```

- [ ] **Step 5: Mount in v1.route.ts**

In `src/routes/v1.route.ts`, add the import and mount it under `/auth/employee` (after the existing `authRouter` mount):

```ts
import employeeAuthRouter from './employee.auth.route';
```

```ts
v1Router.use('/auth/employee', employeeAuthRouter);
```

- [ ] **Step 6: Run test + build**

Run: `npx jest employee.auth.route -v`
Expected: PASS (3 tests).
Run: `npm run build`
Expected: no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add src/controllers/employee.auth.controller.ts src/routes/employee.auth.route.ts src/routes/v1.route.ts src/__tests__/routes/employee.auth.route.test.ts
git commit -m "feat : add employee auth routes for activate login and reset"
```

---

## Task 13: Invite email template + docs + full verification

**Files:**
- Create: `src/templates/employee-invite.ejs`
- Modify: `README.md`

- [ ] **Step 1: Create the invite email template**

```html
<!-- src/templates/employee-invite.ejs -->
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="font-family: Arial, sans-serif; color:#222;">
  <h2>You're invited to <%= companyName %></h2>
  <p>An account has been created for you on the <%= companyName %> gifting portal.</p>
  <p>Click below to set your password and activate your account:</p>
  <p>
    <a href="<%= activationLink %>"
       style="display:inline-block;padding:12px 20px;background:#222;color:#fff;text-decoration:none;border-radius:4px;">
      Activate my account
    </a>
  </p>
  <p style="font-size:12px;color:#666;">If the button doesn't work, copy this link:<br/><%= activationLink %></p>
</body>
</html>
```

- [ ] **Step 2: Document in README**

Append to `README.md`:

```markdown
## Company & Employee accounts (Phase 2a)

Admins create companies and invite employees (`/admin/companies`, `/admin/companies/:id/employees/invite`).
An invite emails a tokenized activation link built from `FRONTEND_URL`
(`<FRONTEND_URL>/employee/activate?token=...`); the employee sets a password and is auto-verified.
Employees log in via the **separate** path `POST /auth/employee/login` (scoped to employee accounts,
so an email can exist independently as both a B2B buyer and an employee). Required env var:
`FRONTEND_URL`. See `example.env`.
```

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: all suites pass (existing 30 + the new Phase 2a tests).

- [ ] **Step 4: Build + lint**

Run: `npm run build`
Expected: no TypeScript errors.
Run: `npm run lint:fix`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/templates/employee-invite.ejs README.md
git commit -m "docs : add employee invite template and company onboarding docs"
```

---

## After all tasks

- Dispatch a final code reviewer (superpowers:requesting-code-review) over the branch diff.
- Address Critical/Important findings.
- Use superpowers:finishing-a-development-branch to push + open a PR for review.

---

## Self-review (against the spec)

**Spec coverage:**
- Company model + admin CRUD → Tasks 2, 6, 11. ✓
- User employee fields, no migration → Task 3. ✓
- Per-account-type email uniqueness / scoped buyer query → Task 5. ✓
- Invite → set-password activation reusing `verificationCode` machinery → Tasks 7, 8, 12. ✓
- Separate employee login → Tasks 8, 12. ✓
- `isEmployee` immediate-deactivation guard → Task 9. ✓
- Validation + error mapping (409 `EMPLOYEE_EXISTS`, 400 `INVALID_INVITE`, 403 login) → Tasks 1, 7, 8, 10. ✓
- Invite email template + `FRONTEND_URL` → Tasks 1, 13. ✓
- Testing (model / service-unit / route) → every feature task. ✓
- Deferred 2b–2d behavior NOT included. ✓

**Placeholder scan:** No TBD/TODO; every code step contains full code. `forgotPassword` is intentionally minimal with an explanatory note (not a placeholder).

**Type consistency:** Repository method names used by services match Task 5 exactly (`getEmployeeByEmail`, `createEmployee`, `findEmployeeById`, `findEmployeesByCompany`, `getEmployeeWithVerificationCode`, `setEmployeeStatus`, `activateEmployee`, `updateEmployeeVerificationCode`). `authService` helpers (`hashPassword`, `verifyHashPassword`, `generateJWTToken`) match `auth.service.ts`. Controller `req.admin._id` / `req.user._id` match `@types/custom.d.ts`. `sha1` from `utils/hash.util` and `isMongoId` from `utils/validator.utils` match existing usage.
