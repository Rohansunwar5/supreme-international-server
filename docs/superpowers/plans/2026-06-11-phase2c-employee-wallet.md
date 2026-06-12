# Phase 2c — Employee Wallet / Credit Points Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-employee wallet with a cached balance, an immutable ledger, and admin top-up / adjustment, plus employee + admin views.

**Architecture:** A `wallet` doc per employee holds the cached balance; every credit/debit is one atomic conditional update on the wallet (debit guarded by `balance >= amount`) followed by an immutable `walletLedger` entry stamped with `balanceAfter`. A `wallet.service` exposes the ledgered `credit`/`debit` primitive (reused by 2d). Strict layering, custom errors only, no `ref`/`populate`, money as `Number` INR.

**Tech Stack:** Express, TypeScript, Mongoose, Jest + supertest.

**Spec:** `docs/superpowers/specs/2026-06-11-phase2c-employee-wallet-design.md`

---

## File structure

**Create:**
- `src/models/wallet.model.ts`
- `src/models/walletLedger.model.ts`
- `src/repository/wallet.repository.ts`
- `src/repository/walletLedger.repository.ts`
- `src/services/wallet.service.ts`
- `src/controllers/admin.wallet.controller.ts`
- `src/controllers/employee.wallet.controller.ts`
- `src/routes/employee.wallet.route.ts`
- `src/middlewares/validators/wallet.validator.ts`
- Test files per task.

**Modify:**
- `src/routes/admin.route.ts` — admin wallet endpoints.
- `src/routes/v1.route.ts` — mount `/employee/wallet`.
- `README.md` — document the wallet.

---

## Task 1: wallet model

**Files:**
- Create: `src/models/wallet.model.ts`
- Test: `src/__tests__/models/wallet.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/models/wallet.test.ts
import WalletModel from '../../models/wallet.model';

describe('Wallet model', () => {
  it('defaults balance to 0 and currency to INR', () => {
    const w = new WalletModel({ employeeId: '64b8f0000000000000000001', companyId: '64b8f0000000000000000002' });
    expect(w.balance).toBe(0);
    expect(w.currency).toBe('INR');
    expect(w.validateSync()).toBeUndefined();
  });

  it('requires employeeId and companyId', () => {
    const w = new WalletModel({});
    const err = w.validateSync();
    expect(err?.errors?.employeeId).toBeDefined();
    expect(err?.errors?.companyId).toBeDefined();
  });

  it('rejects a negative balance', () => {
    const w = new WalletModel({ employeeId: '64b8f0000000000000000001', companyId: '64b8f0000000000000000002', balance: -5 });
    expect(w.validateSync()?.errors?.balance).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest models/wallet -v`
Expected: FAIL — cannot find module `wallet.model`.

- [ ] **Step 3: Implement the model**

```ts
// src/models/wallet.model.ts
import mongoose from 'mongoose';

const walletSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
    companyId: { type: mongoose.Schema.Types.ObjectId, required: true },
    balance: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: 'INR' },
  },
  { timestamps: true },
);

export interface IWallet extends mongoose.Document {
  _id: mongoose.Types.ObjectId;
  employeeId: mongoose.Types.ObjectId;
  companyId: mongoose.Types.ObjectId;
  balance: number;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
}

export default mongoose.model<IWallet>('Wallet', walletSchema);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest models/wallet -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/models/wallet.model.ts src/__tests__/models/wallet.test.ts
git commit -m "feat : add wallet model"
```

---

## Task 2: walletLedger model

**Files:**
- Create: `src/models/walletLedger.model.ts`
- Test: `src/__tests__/models/walletLedger.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/models/walletLedger.test.ts
import WalletLedgerModel from '../../models/walletLedger.model';

const base = {
  walletId: '64b8f0000000000000000001',
  employeeId: '64b8f0000000000000000002',
  companyId: '64b8f0000000000000000003',
  amount: 100,
  balanceAfter: 100,
  reason: 'Q1 gifting',
};

describe('WalletLedger model', () => {
  it('accepts a valid credit entry', () => {
    const e = new WalletLedgerModel({ ...base, type: 'credit', source: 'admin_topup' });
    expect(e.validateSync()).toBeUndefined();
  });

  it('rejects an invalid type', () => {
    const e = new WalletLedgerModel({ ...base, type: 'bogus', source: 'admin_topup' });
    expect(e.validateSync()?.errors?.type).toBeDefined();
  });

  it('rejects an invalid source', () => {
    const e = new WalletLedgerModel({ ...base, type: 'credit', source: 'bogus' });
    expect(e.validateSync()?.errors?.source).toBeDefined();
  });

  it('requires a reason', () => {
    const e = new WalletLedgerModel({ walletId: base.walletId, employeeId: base.employeeId, companyId: base.companyId, amount: 1, balanceAfter: 1, type: 'credit', source: 'admin_topup' });
    expect(e.validateSync()?.errors?.reason).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest models/walletLedger -v`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement the model**

```ts
// src/models/walletLedger.model.ts
import mongoose from 'mongoose';

const walletLedgerSchema = new mongoose.Schema(
  {
    walletId: { type: mongoose.Schema.Types.ObjectId, required: true },
    employeeId: { type: mongoose.Schema.Types.ObjectId, required: true },
    companyId: { type: mongoose.Schema.Types.ObjectId, required: true },
    type: { type: String, enum: ['credit', 'debit'], required: true },
    amount: { type: Number, required: true, min: 0.01 },
    balanceAfter: { type: Number, required: true },
    reason: { type: String, required: true },
    source: { type: String, enum: ['admin_topup', 'admin_adjustment', 'order_redemption', 'refund'], required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId },
    referenceId: { type: mongoose.Schema.Types.ObjectId },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

walletLedgerSchema.index({ walletId: 1, createdAt: -1 });
walletLedgerSchema.index({ employeeId: 1 });

export interface IWalletLedger extends mongoose.Document {
  _id: mongoose.Types.ObjectId;
  walletId: mongoose.Types.ObjectId;
  employeeId: mongoose.Types.ObjectId;
  companyId: mongoose.Types.ObjectId;
  type: 'credit' | 'debit';
  amount: number;
  balanceAfter: number;
  reason: string;
  source: 'admin_topup' | 'admin_adjustment' | 'order_redemption' | 'refund';
  createdBy?: mongoose.Types.ObjectId;
  referenceId?: mongoose.Types.ObjectId;
  createdAt: Date;
}

export default mongoose.model<IWalletLedger>('WalletLedger', walletLedgerSchema);
```

> The `source` enum already includes `order_redemption` and `refund` so 2d adds no schema change.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest models/walletLedger -v`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/models/walletLedger.model.ts src/__tests__/models/walletLedger.test.ts
git commit -m "feat : add wallet ledger model"
```

---

## Task 3: wallet repository

**Files:**
- Create: `src/repository/wallet.repository.ts`

(No direct test — covered via service tests. Verify via `npm run build`.)

- [ ] **Step 1: Implement the repository**

```ts
// src/repository/wallet.repository.ts
import walletModel, { IWallet } from '../models/wallet.model';

export class WalletRepository {
  private _model = walletModel;

  async findByEmployeeId(employeeId: string): Promise<IWallet | null> {
    return this._model.findOne({ employeeId });
  }

  async getOrCreate(employeeId: string, companyId: string): Promise<IWallet> {
    const existing = await this._model.findOne({ employeeId });
    if (existing) return existing;
    return this._model.create({ employeeId, companyId, balance: 0 });
  }

  async atomicCredit(walletId: string, amount: number): Promise<IWallet | null> {
    return this._model.findOneAndUpdate(
      { _id: walletId },
      { $inc: { balance: amount } },
      { new: true },
    );
  }

  async atomicDebit(walletId: string, amount: number): Promise<IWallet | null> {
    return this._model.findOneAndUpdate(
      { _id: walletId, balance: { $gte: amount } },
      { $inc: { balance: -amount } },
      { new: true },
    );
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/repository/wallet.repository.ts
git commit -m "feat : add wallet repository with atomic credit and debit"
```

---

## Task 4: walletLedger repository

**Files:**
- Create: `src/repository/walletLedger.repository.ts`

(No direct test — covered via service tests. Verify via `npm run build`.)

- [ ] **Step 1: Implement the repository**

```ts
// src/repository/walletLedger.repository.ts
import walletLedgerModel, { IWalletLedger } from '../models/walletLedger.model';

export interface ICreateLedgerEntry {
  walletId: string;
  employeeId: string;
  companyId: string;
  type: 'credit' | 'debit';
  amount: number;
  balanceAfter: number;
  reason: string;
  source: 'admin_topup' | 'admin_adjustment' | 'order_redemption' | 'refund';
  createdBy?: string;
  referenceId?: string;
}

export class WalletLedgerRepository {
  private _model = walletLedgerModel;

  async create(entry: ICreateLedgerEntry): Promise<IWalletLedger> {
    return this._model.create(entry);
  }

  async findByWallet(walletId: string, page: number, limit: number): Promise<{ items: IWalletLedger[]; total: number }> {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this._model.find({ walletId }).sort({ createdAt: -1 }).skip(skip).limit(limit),
      this._model.countDocuments({ walletId }),
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
git add src/repository/walletLedger.repository.ts
git commit -m "feat : add wallet ledger repository"
```

---

## Task 5: wallet.service

**Files:**
- Create: `src/services/wallet.service.ts`
- Test: `src/__tests__/services/wallet.service.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/services/wallet.service.test.ts
const walletRepo = { findByEmployeeId: jest.fn(), getOrCreate: jest.fn(), atomicCredit: jest.fn(), atomicDebit: jest.fn() };
const ledgerRepo = { create: jest.fn(), findByWallet: jest.fn() };
const userRepo = { findEmployeeById: jest.fn() };
jest.mock('../../repository/wallet.repository', () => ({ __esModule: true, WalletRepository: jest.fn().mockImplementation(() => walletRepo) }));
jest.mock('../../repository/walletLedger.repository', () => ({ __esModule: true, WalletLedgerRepository: jest.fn().mockImplementation(() => ledgerRepo) }));
jest.mock('../../repository/user.repository', () => ({ __esModule: true, UserRepository: jest.fn().mockImplementation(() => userRepo) }));

import walletService from '../../services/wallet.service';
import { BadRequestError } from '../../errors/bad-request.error';

describe('wallet.service', () => {
  beforeEach(() => jest.clearAllMocks());

  it('credit auto-creates the wallet, increments balance, writes a ledger entry', async () => {
    walletRepo.getOrCreate.mockResolvedValue({ _id: 'w1', balance: 0 });
    walletRepo.atomicCredit.mockResolvedValue({ _id: 'w1', balance: 100 });
    ledgerRepo.create.mockImplementation(async (e) => ({ _id: 'l1', ...e }));

    const out = await walletService.credit('e1', 'co1', 100, 'Q1', 'admin1');

    expect(walletRepo.atomicCredit).toHaveBeenCalledWith('w1', 100);
    expect(ledgerRepo.create).toHaveBeenCalledWith(expect.objectContaining({ type: 'credit', source: 'admin_topup', amount: 100, balanceAfter: 100, reason: 'Q1', createdBy: 'admin1' }));
    expect(out.balance).toBe(100);
  });

  it('debit decrements balance and writes a debit entry', async () => {
    walletRepo.getOrCreate.mockResolvedValue({ _id: 'w1', balance: 100 });
    walletRepo.atomicDebit.mockResolvedValue({ _id: 'w1', balance: 40 });
    ledgerRepo.create.mockImplementation(async (e) => ({ _id: 'l2', ...e }));

    const out = await walletService.debit('e1', 'co1', 60, 'correction', 'admin1');

    expect(walletRepo.atomicDebit).toHaveBeenCalledWith('w1', 60);
    expect(ledgerRepo.create).toHaveBeenCalledWith(expect.objectContaining({ type: 'debit', source: 'admin_adjustment', balanceAfter: 40 }));
    expect(out.balance).toBe(40);
  });

  it('debit beyond balance throws INSUFFICIENT_BALANCE', async () => {
    walletRepo.getOrCreate.mockResolvedValue({ _id: 'w1', balance: 10 });
    walletRepo.atomicDebit.mockResolvedValue(null);
    await expect(walletService.debit('e1', 'co1', 60, 'x', 'admin1')).rejects.toBeInstanceOf(BadRequestError);
    expect(ledgerRepo.create).not.toHaveBeenCalled();
  });

  it('getWallet returns a synthesized zero wallet when none exists', async () => {
    walletRepo.findByEmployeeId.mockResolvedValue(null);
    const out = await walletService.getWallet('e1');
    expect(out).toEqual({ balance: 0, currency: 'INR' });
  });

  it('adminCredit rejects a non-employee id', async () => {
    userRepo.findEmployeeById.mockResolvedValue(null);
    await expect(walletService.adminCredit('nope', 50, 'x', 'admin1')).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest wallet.service -v`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement the service**

```ts
// src/services/wallet.service.ts
import { BadRequestError } from '../errors/bad-request.error';
import { NotFoundError } from '../errors/not-found.error';
import { WalletRepository } from '../repository/wallet.repository';
import { WalletLedgerRepository } from '../repository/walletLedger.repository';
import { UserRepository } from '../repository/user.repository';

type LedgerSource = 'admin_topup' | 'admin_adjustment' | 'order_redemption' | 'refund';

class WalletService {
  constructor(
    private readonly _walletRepository: WalletRepository,
    private readonly _ledgerRepository: WalletLedgerRepository,
    private readonly _userRepository: UserRepository,
  ) {}

  async credit(
    employeeId: string,
    companyId: string,
    amount: number,
    reason: string,
    adminId?: string,
    opts?: { source?: LedgerSource; referenceId?: string },
  ) {
    const wallet = await this._walletRepository.getOrCreate(employeeId, companyId);
    const updated = await this._walletRepository.atomicCredit(wallet._id.toString(), amount);
    if (!updated) throw new BadRequestError('Failed to credit wallet');

    await this._ledgerRepository.create({
      walletId: wallet._id.toString(),
      employeeId,
      companyId,
      type: 'credit',
      amount,
      balanceAfter: updated.balance,
      reason,
      source: opts?.source ?? 'admin_topup',
      createdBy: adminId,
      referenceId: opts?.referenceId,
    });

    return { balance: updated.balance, currency: updated.currency };
  }

  async debit(
    employeeId: string,
    companyId: string,
    amount: number,
    reason: string,
    adminId?: string,
    opts?: { source?: LedgerSource; referenceId?: string },
  ) {
    const wallet = await this._walletRepository.getOrCreate(employeeId, companyId);
    const updated = await this._walletRepository.atomicDebit(wallet._id.toString(), amount);
    if (!updated) throw new BadRequestError('INSUFFICIENT_BALANCE');

    await this._ledgerRepository.create({
      walletId: wallet._id.toString(),
      employeeId,
      companyId,
      type: 'debit',
      amount,
      balanceAfter: updated.balance,
      reason,
      source: opts?.source ?? 'admin_adjustment',
      createdBy: adminId,
      referenceId: opts?.referenceId,
    });

    return { balance: updated.balance, currency: updated.currency };
  }

  async getWallet(employeeId: string) {
    const wallet = await this._walletRepository.findByEmployeeId(employeeId);
    if (!wallet) return { balance: 0, currency: 'INR' };
    return { balance: wallet.balance, currency: wallet.currency };
  }

  async getLedger(employeeId: string, page = 1, limit = 20) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(50, Math.max(1, limit));
    const wallet = await this._walletRepository.findByEmployeeId(employeeId);
    if (!wallet) return { items: [], pagination: { total: 0, page: safePage, limit: safeLimit, pages: 0 } };

    const { items, total } = await this._ledgerRepository.findByWallet(wallet._id.toString(), safePage, safeLimit);
    return { items, pagination: { total, page: safePage, limit: safeLimit, pages: Math.ceil(total / safeLimit) } };
  }

  // Admin helpers that resolve the employee (and its companyId) and reject non-employees.
  async adminCredit(employeeId: string, amount: number, reason: string, adminId: string) {
    const employee = await this._resolveEmployee(employeeId);
    return this.credit(employeeId, employee.companyId as string, amount, reason, adminId);
  }

  async adminDebit(employeeId: string, amount: number, reason: string, adminId: string) {
    const employee = await this._resolveEmployee(employeeId);
    return this.debit(employeeId, employee.companyId as string, amount, reason, adminId);
  }

  async adminGetWallet(employeeId: string) {
    await this._resolveEmployee(employeeId);
    return this.getWallet(employeeId);
  }

  async adminGetLedger(employeeId: string, page?: number, limit?: number) {
    await this._resolveEmployee(employeeId);
    return this.getLedger(employeeId, page, limit);
  }

  private async _resolveEmployee(employeeId: string) {
    const employee = await this._userRepository.findEmployeeById(employeeId);
    if (!employee) throw new NotFoundError('Employee not found');
    return employee;
  }
}

export default new WalletService(new WalletRepository(), new WalletLedgerRepository(), new UserRepository());
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest wallet.service -v`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/wallet.service.ts src/__tests__/services/wallet.service.test.ts
git commit -m "feat : add wallet service with ledgered credit and debit"
```

---

## Task 6: Validators

**Files:**
- Create: `src/middlewares/validators/wallet.validator.ts`

(Exercised via route tests in Task 8; no standalone test.)

- [ ] **Step 1: Implement the validators**

```ts
// src/middlewares/validators/wallet.validator.ts
import { check } from 'express-validator';
import { validateRequest } from '.';
import { isMongoId } from '../../utils/validator.utils';

export const walletAmountValidator = [
  isMongoId('id'),
  check('amount').isFloat({ gt: 0 }).withMessage('amount must be greater than 0'),
  check('reason').isString().trim().notEmpty().withMessage('reason is required'),
  ...validateRequest,
];

export const employeeIdParamValidator = [
  isMongoId('id'),
  ...validateRequest,
];
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/middlewares/validators/wallet.validator.ts
git commit -m "feat : add wallet validators"
```

---

## Task 7: Admin wallet controller + routes

**Files:**
- Create: `src/controllers/admin.wallet.controller.ts`
- Modify: `src/routes/admin.route.ts`
- Test: `src/__tests__/controllers/admin.wallet.controller.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/controllers/admin.wallet.controller.test.ts
const adminCredit = jest.fn();
const adminDebit = jest.fn();
jest.mock('../../services/wallet.service', () => ({
  __esModule: true,
  default: {
    adminCredit: (...a: unknown[]) => adminCredit(...a),
    adminDebit: (...a: unknown[]) => adminDebit(...a),
    adminGetWallet: jest.fn(),
    adminGetLedger: jest.fn(),
  },
}));

import { creditHandler, debitHandler } from '../../controllers/admin.wallet.controller';

const run = (handler: (req: unknown, res: unknown, next: (p: unknown) => void) => Promise<void>, req: unknown) =>
  new Promise((resolve) => handler(req, {}, (p) => resolve(p)));

describe('admin wallet controller', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creditHandler passes employeeId, amount, reason, admin id', async () => {
    adminCredit.mockResolvedValue({ balance: 100, currency: 'INR' });
    const out = await run(creditHandler as never, { params: { id: 'e1' }, body: { amount: 100, reason: 'Q1' }, admin: { _id: 'a1' } });
    expect(adminCredit).toHaveBeenCalledWith('e1', 100, 'Q1', 'a1');
    expect(out).toEqual({ balance: 100, currency: 'INR' });
  });

  it('debitHandler passes employeeId, amount, reason, admin id', async () => {
    adminDebit.mockResolvedValue({ balance: 40, currency: 'INR' });
    await run(debitHandler as never, { params: { id: 'e1' }, body: { amount: 60, reason: 'fix' }, admin: { _id: 'a1' } });
    expect(adminDebit).toHaveBeenCalledWith('e1', 60, 'fix', 'a1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest admin.wallet.controller -v`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement the controller**

```ts
// src/controllers/admin.wallet.controller.ts
import { NextFunction, Request, Response } from 'express';
import walletService from '../services/wallet.service';

export const creditHandler = async (req: Request, _res: Response, next: NextFunction) => {
  const { amount, reason } = req.body;
  const response = await walletService.adminCredit(req.params.id, Number(amount), reason, req.admin._id);
  next(response);
};

export const debitHandler = async (req: Request, _res: Response, next: NextFunction) => {
  const { amount, reason } = req.body;
  const response = await walletService.adminDebit(req.params.id, Number(amount), reason, req.admin._id);
  next(response);
};

export const getWalletHandler = async (req: Request, _res: Response, next: NextFunction) => {
  const response = await walletService.adminGetWallet(req.params.id);
  next(response);
};

export const getLedgerHandler = async (req: Request, _res: Response, next: NextFunction) => {
  const { page, limit } = req.query;
  const response = await walletService.adminGetLedger(req.params.id, page ? Number(page) : undefined, limit ? Number(limit) : undefined);
  next(response);
};
```

- [ ] **Step 4: Wire the admin routes**

In `src/routes/admin.route.ts`, add imports near the other controller imports:

```ts
import {
  creditHandler,
  debitHandler,
  getWalletHandler,
  getLedgerHandler,
} from '../controllers/admin.wallet.controller';
import { walletAmountValidator, employeeIdParamValidator } from '../middlewares/validators/wallet.validator';
```

Add these routes in the Companies & Employees section (after the `adminRouter.patch('/employees/:id/status', ...)` line):

```ts
adminRouter.post('/employees/:id/wallet/credit', walletAmountValidator, asyncHandler(creditHandler));
adminRouter.post('/employees/:id/wallet/debit', walletAmountValidator, asyncHandler(debitHandler));
adminRouter.get('/employees/:id/wallet', employeeIdParamValidator, asyncHandler(getWalletHandler));
adminRouter.get('/employees/:id/wallet/ledger', employeeIdParamValidator, asyncHandler(getLedgerHandler));
```

- [ ] **Step 5: Run test + build**

Run: `npx jest admin.wallet.controller -v`
Expected: PASS (2 tests).
Run: `npm run build`
Expected: no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add src/controllers/admin.wallet.controller.ts src/routes/admin.route.ts src/__tests__/controllers/admin.wallet.controller.test.ts
git commit -m "feat : add admin wallet credit debit and views"
```

---

## Task 8: Employee wallet controller + route + mount

**Files:**
- Create: `src/controllers/employee.wallet.controller.ts`
- Create: `src/routes/employee.wallet.route.ts`
- Modify: `src/routes/v1.route.ts`
- Test: `src/__tests__/routes/employee.wallet.route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/routes/employee.wallet.route.test.ts
const getWallet = jest.fn();
const getLedger = jest.fn();
jest.mock('../../services/wallet.service', () => ({
  __esModule: true,
  default: { getWallet: (...a: unknown[]) => getWallet(...a), getLedger: (...a: unknown[]) => getLedger(...a) },
}));
jest.mock('../../middlewares/isEmployee.middleware', () => ({
  __esModule: true,
  default: (req: { user?: { _id: string }; companyId?: string }, _res: unknown, next: () => void) => {
    req.user = { _id: 'u1' };
    req.companyId = 'c1';
    next();
  },
}));

import express from 'express';
import request from 'supertest';
import employeeWalletRouter from '../../routes/employee.wallet.route';
import { globalHandler } from '../../middlewares/error-handler.middleware';

const app = express();
app.use(express.json());
app.use('/employee/wallet', employeeWalletRouter);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((data: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => globalHandler(data as never, req, res as never, next));

describe('employee wallet routes', () => {
  beforeEach(() => jest.clearAllMocks());

  it('GET /employee/wallet returns the own balance', async () => {
    getWallet.mockResolvedValue({ balance: 250, currency: 'INR' });
    const res = await request(app).get('/employee/wallet');
    expect(res.status).toBe(200);
    expect(res.body.data.balance).toBe(250);
    expect(getWallet).toHaveBeenCalledWith('u1');
  });

  it('GET /employee/wallet/ledger returns own history', async () => {
    getLedger.mockResolvedValue({ items: [], pagination: { total: 0, page: 1, limit: 20, pages: 0 } });
    const res = await request(app).get('/employee/wallet/ledger');
    expect(res.status).toBe(200);
    expect(getLedger).toHaveBeenCalledWith('u1', undefined, undefined);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest employee.wallet.route -v`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement the controller**

```ts
// src/controllers/employee.wallet.controller.ts
import { NextFunction, Request, Response } from 'express';
import walletService from '../services/wallet.service';

export const getMyWallet = async (req: Request, _res: Response, next: NextFunction) => {
  const response = await walletService.getWallet(req.user._id);
  next(response);
};

export const getMyLedger = async (req: Request, _res: Response, next: NextFunction) => {
  const { page, limit } = req.query;
  const response = await walletService.getLedger(req.user._id, page ? Number(page) : undefined, limit ? Number(limit) : undefined);
  next(response);
};
```

- [ ] **Step 4: Implement the route**

```ts
// src/routes/employee.wallet.route.ts
import { Router } from 'express';
import { asyncHandler } from '../utils/asynchandler';
import requireEmployee from '../middlewares/isEmployee.middleware';
import { getMyWallet, getMyLedger } from '../controllers/employee.wallet.controller';

const employeeWalletRouter = Router();

employeeWalletRouter.use(requireEmployee);

employeeWalletRouter.get('/ledger', asyncHandler(getMyLedger));
employeeWalletRouter.get('/', asyncHandler(getMyWallet));

export default employeeWalletRouter;
```

- [ ] **Step 5: Mount in v1.route.ts**

In `src/routes/v1.route.ts`, add the import (near the other route imports):

```ts
import employeeWalletRouter from './employee.wallet.route';
```

And add the mount right after the existing `v1Router.use('/employee/catalog', employeeCatalogRouter);` line:

```ts
v1Router.use('/employee/wallet', employeeWalletRouter);
```

- [ ] **Step 6: Run test + build**

Run: `npx jest employee.wallet.route -v`
Expected: PASS (2 tests).
Run: `npm run build`
Expected: no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add src/controllers/employee.wallet.controller.ts src/routes/employee.wallet.route.ts src/routes/v1.route.ts src/__tests__/routes/employee.wallet.route.test.ts
git commit -m "feat : add employee wallet routes"
```

---

## Task 9: Docs + full verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Document in README**

Append to `README.md`:

```markdown
## Employee wallet (Phase 2c)

Each employee has a wallet with a credit balance (INR). Admins top-up or adjust it
(`POST /admin/employees/:id/wallet/credit` and `.../debit`, each requiring `{ amount, reason }`);
every change is an immutable ledger entry stamped with the resulting balance. Debits are guarded so
a balance can never go negative. Employees view their own balance/history at `/employee/wallet` and
`/employee/wallet/ledger` (behind `isEmployee`). Credits never expire. Spending credits at checkout
arrives in Phase 2d.
```

- [ ] **Step 2: Run the full suite**

Run: `npm test`
Expected: all suites pass (existing 88 + the new Phase 2c tests).

- [ ] **Step 3: Build + lint**

Run: `npm run build`
Expected: no TypeScript errors.
Run: `npm run lint:fix`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs : document employee wallet"
```

---

## After all tasks
- Dispatch a final code reviewer (superpowers:requesting-code-review) over the branch diff.
- Address Critical/Important findings.
- Use superpowers:finishing-a-development-branch to integrate.

---

## Self-review (against the spec)

**Spec coverage:**
- `wallet` model + cached balance → Task 1. ✓
- Immutable `walletLedger` with `source` enum incl. 2d values → Task 2. ✓
- Atomic credit / `$gte`-guarded debit → Task 3 (repo) + Task 5 (service). ✓
- Ledger append + pagination → Task 4 + Task 5 `getLedger`. ✓
- Ledgered `credit`/`debit` primitive with `source`/`referenceId` for 2d reuse → Task 5. ✓
- Lazy wallet create; read-missing → `{ balance: 0 }` → Task 5. ✓
- Admin top-up/adjust/view/ledger; resolve+reject non-employee → Tasks 5 (`admin*`) + 7. ✓
- Employee own balance/history behind `isEmployee` → Task 8. ✓
- Validation (amount > 0, reason required, mongoId) → Task 6. ✓
- `INSUFFICIENT_BALANCE` on overspend → Task 5. ✓
- Tests (unit + route) → Tasks 5, 7, 8. ✓
- Deferred 2d (order redemption/refund/Razorpay) NOT implemented. ✓

**Placeholder scan:** None — every code step is complete.

**Type consistency:** `WalletRepository` methods (`findByEmployeeId`, `getOrCreate`, `atomicCredit`, `atomicDebit`) and `WalletLedgerRepository` (`create`, `findByWallet`) match between Tasks 3/4 and their use in Task 5. Service method names (`credit`, `debit`, `getWallet`, `getLedger`, `adminCredit`, `adminDebit`, `adminGetWallet`, `adminGetLedger`) are consistent across Tasks 5/7/8. `req.admin._id` (admin id) and `req.user._id` + `req.companyId` (employee) match `@types/custom.d.ts`. `isMongoId` from `utils/validator.utils` and `findEmployeeById` from `UserRepository` match existing code.
