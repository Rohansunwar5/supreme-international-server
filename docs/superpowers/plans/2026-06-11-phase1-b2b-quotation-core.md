# Phase 1 B2B Quotation Core — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a verified buyer build an MOQ-aware cart and generate an itemized, priced quotation PDF (stored in R2) that they can send to the admin via a WhatsApp deep link, with an admin panel to manage MOQ and incoming enquiries.

**Architecture:** Strict layered flow per `codingPattenAndRule.md` — Route → Validator → Auth → Controller → Service → Repository → Model → `next(response)`. Singleton services with DI (matching `cart.service`), custom error classes only, validators in `middlewares/validators`, config via `config/index.ts`, R2 via `utils/r2.util.ts`. No Mongoose `ref`/`populate`; cross-entity data is snapshotted. Guest carts + guest→user merge already exist and are reused as-is.

**Tech Stack:** TypeScript, Express, Mongoose (MongoDB), Redis (CacheManager), JWT, express-validator, EJS, Puppeteer (new), Cloudflare R2 (S3 SDK), nanoid.

---

## Conventions (read once before starting)

- **Service shape:** class with DI constructor, exported as a configured singleton:
  ```ts
  class XService { constructor(private readonly _repo: XRepository) {} }
  export default new XService(new XRepository());
  ```
- **Controller shape:** thin, no try/catch, calls one service method, `next(response)`:
  ```ts
  export const fn = async (req: Request, _res: Response, next: NextFunction) => {
    const response = await xService.method(req.params.id);
    next(response);
  };
  ```
- **Errors:** throw `new BadRequestError(msg)` (→400), `new NotFoundError(msg)` (→404), `new ForbiddenError(msg)` (→403), `new UnauthorizedError(msg)` (→401) from `../errors/*`. For structured payloads (MOQ details), throw `new ConflictErrorJSON(JSON.stringify({...}))` — `asyncHandler` parses it into `data` (→409). Never `throw new Error()`.
- **Route auth building blocks:** `getAuthMiddlewareByJWTSecret(config.JWT_SECRET)` (silent — sets `req.user` if a valid token is present), `cartSessionMiddleware` (always sets `req.sessionId`), `isLoggedIn` (array: silent-auth + `requireAuth`, enforces a real user), `requireAdminAuth` for admin routes.
- **R2 upload:** `uploadToR2(buffer, folder, contentType)` returns the public URL.
- **No test framework exists yet.** Task 1 installs Jest + ts-jest + supertest. All later test commands assume it.
- **Commit message format is hook-enforced** (`.husky/commit-msg`): the regex is `^(fix|feat|chore|perf|bugs|docs|breaking_changes|refactor|add|Merge|merge|test|tests|updated|changed|added|created|create) .*$` — i.e. an allowed verb, then a **space**, then text. `feat:` (colon, no space) is REJECTED; `feat : description` (space after the verb) PASSES. All commit commands below use the `feat : description` form.

---

## Task 1: Install test tooling + Puppeteer

**Files:**
- Modify: `package.json`
- Create: `jest.config.js`
- Create: `src/__tests__/setup.ts`

- [ ] **Step 1: Install dependencies**

Run:
```bash
npm install puppeteer
npm install -D jest ts-jest @types/jest supertest @types/supertest
```
Expected: installs succeed; `puppeteer` downloads Chromium.

- [ ] **Step 2: Create `jest.config.js`**

```js
/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  testTimeout: 30000,
  clearMocks: true,
};
```

- [ ] **Step 3: Create `src/__tests__/setup.ts`**

```ts
// Global test setup. Keep minimal; per-suite mocks live in each test file.
process.env.NODE_ENV = 'test';
```

- [ ] **Step 4: Add test scripts to `package.json`**

In the `"scripts"` block add:
```json
"test": "jest --runInBand",
"test:watch": "jest --watch"
```

- [ ] **Step 5: Verify Jest runs (no tests yet)**

Run: `npm test`
Expected: Jest starts and reports "No tests found" (exit code 1 is acceptable here) OR passes with 0 suites. Confirms config loads without TS errors.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json jest.config.js src/__tests__/setup.ts
git commit -m "chore : add jest, supertest and puppeteer for quotation feature"
```

---

## Task 2: Add MOQ to ProductVariant model

**Files:**
- Modify: `src/models/productVariant.model.ts`
- Test: `src/__tests__/models/productVariant.moq.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import ProductVariant from '../../models/productVariant.model';

describe('ProductVariant MOQ', () => {
  it('defaults moq to 1 when not provided', () => {
    const v = new ProductVariant({
      product: '507f1f77bcf86cd799439011',
      sku: 'TEST-SKU-1',
      price: 100,
      originalPrice: 120,
      stock: 50,
      variantKey: 'default',
    });
    expect(v.moq).toBe(1);
  });

  it('accepts an explicit moq', () => {
    const v = new ProductVariant({
      product: '507f1f77bcf86cd799439011',
      sku: 'TEST-SKU-2',
      price: 100,
      originalPrice: 120,
      stock: 50,
      variantKey: 'default',
      moq: 25,
    });
    expect(v.moq).toBe(25);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- productVariant.moq`
Expected: FAIL — `moq` is `undefined` (field doesn't exist yet).

- [ ] **Step 3: Add the field + interface**

In `src/models/productVariant.model.ts`, inside `productVariantSchema` (after `stock`):
```ts
    moq: { type: Number, required: true, min: 1, default: 1 },
```
In `IProductVariant` interface (after `stock: number;`):
```ts
  moq: number;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- productVariant.moq`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add src/models/productVariant.model.ts src/__tests__/models/productVariant.moq.test.ts
git commit -m "feat : add moq field to product variant model"
```

---

## Task 3: Accept & validate MOQ in admin variant create/update

**Files:**
- Modify: `src/middlewares/validators/` (variant validator — locate the file used by the admin catalog variant routes; likely `catalog.validator.ts` or a variant-specific validator referenced in `admin.route.ts`)
- Modify: `src/services/catalog/productVariant.service.ts`
- Test: `src/__tests__/services/productVariant.moq.service.test.ts`

> Before writing, open `src/routes/admin.route.ts` and the admin catalog controller to find the exact variant create/update validator + service method names. Use those exact names below where this plan writes `createVariant`/`updateVariant`.

- [ ] **Step 1: Write the failing test**

```ts
import variantService from '../../services/catalog/productVariant.service';

describe('variant service moq passthrough', () => {
  it('rejects moq < 1 at the service boundary', async () => {
    await expect(
      // @ts-expect-error testing invalid input
      variantService.assertMoq(0),
    ).rejects.toThrow();
  });

  it('accepts moq >= 1', () => {
    expect(() => variantService.assertMoq(5)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- productVariant.moq.service`
Expected: FAIL — `assertMoq` not defined.

- [ ] **Step 3: Implement**

Add a small guard to `productVariant.service.ts` and call it from create/update before persisting:
```ts
assertMoq(moq: number): void {
  if (moq !== undefined && (!Number.isInteger(moq) || moq < 1)) {
    throw new BadRequestError('moq must be an integer >= 1');
  }
}
```
Ensure `moq` from the payload is passed through to the repository create/update calls (add `moq` to the fields the service forwards). Import `BadRequestError` from `../../errors/bad-request.error`.

- [ ] **Step 4: Add validator rule**

In the variant create/update validator, add:
```ts
check('moq').optional().isInt({ min: 1 }).withMessage('moq must be an integer >= 1'),
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- productVariant.moq.service`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/middlewares/validators src/services/catalog/productVariant.service.ts src/__tests__/services/productVariant.moq.service.test.ts
git commit -m "feat : accept and validate moq in admin variant create and update"
```

---

## Task 4: Raise the cart per-item qty cap for MOQ-sized quantities

**Files:**
- Modify: `src/config/index.ts`
- Modify: `src/services/cart.service.ts`
- Test: `src/__tests__/services/cart.qtycap.test.ts`

> Rationale: cart currently hardcodes `MAX_QTY_PER_ITEM = 10`; B2B MOQ may exceed 10. Make the cap config-driven so MOQ-sized adds aren't blocked. Authoritative MOQ enforcement is at quotation generation (Task 8).

- [ ] **Step 1: Add config value**

In `src/config/index.ts`, in the config object:
```ts
  MAX_CART_QTY_PER_ITEM: Number(process.env.MAX_CART_QTY_PER_ITEM) || 9999,
```

- [ ] **Step 2: Write the failing test**

```ts
import config from '../../config';

describe('cart qty cap config', () => {
  it('exposes a configurable per-item cap defaulting high enough for B2B', () => {
    expect(config.MAX_CART_QTY_PER_ITEM).toBeGreaterThanOrEqual(1000);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- cart.qtycap`
Expected: FAIL if config not added; PASS after Step 1. (If it passes immediately, that's fine — Step 1 already added it.)

- [ ] **Step 4: Use the config in cart.service**

In `src/services/cart.service.ts`, replace the line:
```ts
const MAX_QTY_PER_ITEM = 10;
```
with:
```ts
import config from '../config';
const MAX_QTY_PER_ITEM = config.MAX_CART_QTY_PER_ITEM;
```
(Keep the existing `config` import if one already exists — do not duplicate it.)

- [ ] **Step 5: Run full cart-related tests + build**

Run: `npm test -- cart` then `npm run build`
Expected: tests PASS; build succeeds (no TS errors).

- [ ] **Step 6: Commit**

```bash
git add src/config/index.ts src/services/cart.service.ts src/__tests__/services/cart.qtycap.test.ts
git commit -m "feat : make cart per-item qty cap configurable for b2b moq"
```

---

## Task 5: Create the Quotation model

**Files:**
- Create: `src/models/quotation.model.ts`
- Test: `src/__tests__/models/quotation.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import Quotation from '../../models/quotation.model';

describe('Quotation model', () => {
  it('builds a valid quotation with defaults', () => {
    const q = new Quotation({
      quotationNumber: 'QT-2026-ABCD1234',
      user: '507f1f77bcf86cd799439011',
      contact: { name: 'Buyer', email: 'b@x.com', phoneNumber: '900000', isdCode: '91' },
      items: [{
        variantId: '507f1f77bcf86cd799439012',
        productId: '507f1f77bcf86cd799439013',
        productName: 'Mug', sku: 'MUG-1', attributeLabels: ['Red'],
        unitPrice: 100, qty: 50, moq: 25, lineTotal: 5000,
      }],
      subtotal: 5000, total: 5000, pdfUrl: 'https://r2/x.pdf',
    });
    expect(q.status).toBe('generated');
    expect(q.downloadCount).toBe(0);
    expect(q.currency).toBe('INR');
    expect(q.source).toBe('b2b');
    expect(q.discountAmount).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- quotation.test`
Expected: FAIL — cannot find module `quotation.model`.

- [ ] **Step 3: Implement the model**

```ts
import mongoose from 'mongoose';

const quotationItemSchema = new mongoose.Schema(
  {
    variantId: { type: mongoose.Schema.Types.ObjectId, required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, required: true },
    productName: { type: String, required: true },
    sku: { type: String, required: true },
    attributeLabels: { type: [String], default: [] },
    unitPrice: { type: Number, required: true, min: 0 },
    qty: { type: Number, required: true, min: 1 },
    moq: { type: Number, required: true, min: 1 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const quotationContactSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true },
    phoneNumber: { type: String, default: '' },
    isdCode: { type: String, default: '' },
    company: { type: String, default: '' },
  },
  { _id: false },
);

const quotationSchema = new mongoose.Schema(
  {
    quotationNumber: { type: String, required: true, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, required: true },
    contact: { type: quotationContactSchema, required: true },
    items: { type: [quotationItemSchema], required: true },
    subtotal: { type: Number, required: true, min: 0 },
    couponCode: { type: String, default: null },
    discountAmount: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR' },
    pdfUrl: { type: String, required: true },
    status: {
      type: String,
      enum: ['generated', 'sent', 'viewed', 'converted', 'archived'],
      default: 'generated',
    },
    downloadCount: { type: Number, default: 0, min: 0 },
    lastDownloadedAt: { type: Date, default: null },
    source: { type: String, enum: ['b2b'], default: 'b2b' },
  },
  { timestamps: true },
);

quotationSchema.index({ quotationNumber: 1 }, { unique: true });
quotationSchema.index({ user: 1, createdAt: -1 });
quotationSchema.index({ status: 1, createdAt: -1 });

export interface IQuotationItem {
  variantId: mongoose.Types.ObjectId;
  productId: mongoose.Types.ObjectId;
  productName: string;
  sku: string;
  attributeLabels: string[];
  unitPrice: number;
  qty: number;
  moq: number;
  lineTotal: number;
}

export interface IQuotationContact {
  name: string;
  email: string;
  phoneNumber: string;
  isdCode: string;
  company: string;
}

export type QuotationStatus = 'generated' | 'sent' | 'viewed' | 'converted' | 'archived';

export interface IQuotation extends mongoose.Document {
  _id: mongoose.Types.ObjectId;
  quotationNumber: string;
  user: mongoose.Types.ObjectId;
  contact: IQuotationContact;
  items: IQuotationItem[];
  subtotal: number;
  couponCode: string | null;
  discountAmount: number;
  total: number;
  currency: string;
  pdfUrl: string;
  status: QuotationStatus;
  downloadCount: number;
  lastDownloadedAt: Date | null;
  source: 'b2b';
  createdAt: Date;
  updatedAt: Date;
}

export default mongoose.model<IQuotation>('Quotation', quotationSchema);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- quotation.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/models/quotation.model.ts src/__tests__/models/quotation.test.ts
git commit -m "feat : add quotation model"
```

---

## Task 6: Create the Quotation repository

**Files:**
- Create: `src/repository/quotation.repository.ts`
- Test: `src/__tests__/repository/quotation.repository.test.ts`

> Repository only touches Mongoose; no business logic, no HTTP errors. Mirror `CartRepository` style.

- [ ] **Step 1: Write the failing test (mock the model)**

```ts
import { QuotationRepository } from '../../repository/quotation.repository';
import quotationModel from '../../models/quotation.model';

jest.mock('../../models/quotation.model');

describe('QuotationRepository', () => {
  const repo = new QuotationRepository();

  it('create delegates to model.create', async () => {
    (quotationModel.create as jest.Mock).mockResolvedValue({ _id: 'q1' });
    const res = await repo.create({ quotationNumber: 'QT-1' } as never);
    expect(quotationModel.create).toHaveBeenCalledWith({ quotationNumber: 'QT-1' });
    expect(res).toEqual({ _id: 'q1' });
  });

  it('incrementDownload uses findByIdAndUpdate with $inc', async () => {
    (quotationModel.findByIdAndUpdate as jest.Mock).mockResolvedValue({ _id: 'q1', downloadCount: 1 });
    await repo.incrementDownload('q1');
    expect(quotationModel.findByIdAndUpdate).toHaveBeenCalledWith(
      'q1',
      { $inc: { downloadCount: 1 }, $set: expect.any(Object) },
      { new: true },
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- quotation.repository`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
import quotationModel, { IQuotation, QuotationStatus } from '../models/quotation.model';

export interface IQuotationListFilter {
  status?: QuotationStatus;
  search?: string;
  fromDate?: Date;
  toDate?: Date;
  page: number;
  limit: number;
}

export class QuotationRepository {
  private _model = quotationModel;

  async create(doc: Partial<IQuotation>): Promise<IQuotation> {
    return this._model.create(doc);
  }

  async findById(id: string): Promise<IQuotation | null> {
    return this._model.findById(id);
  }

  async findByNumber(quotationNumber: string): Promise<IQuotation | null> {
    return this._model.findOne({ quotationNumber });
  }

  async findByUser(userId: string, page: number, limit: number): Promise<IQuotation[]> {
    return this._model
      .find({ user: userId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);
  }

  async countByUser(userId: string): Promise<number> {
    return this._model.countDocuments({ user: userId });
  }

  async incrementDownload(id: string): Promise<IQuotation | null> {
    return this._model.findByIdAndUpdate(
      id,
      { $inc: { downloadCount: 1 }, $set: { lastDownloadedAt: new Date() } },
      { new: true },
    );
  }

  async updateStatus(id: string, status: QuotationStatus): Promise<IQuotation | null> {
    return this._model.findByIdAndUpdate(id, { status }, { new: true });
  }

  async list(filter: IQuotationListFilter): Promise<{ items: IQuotation[]; total: number }> {
    const query: Record<string, unknown> = {};
    if (filter.status) query.status = filter.status;
    if (filter.search) query.quotationNumber = { $regex: filter.search, $options: 'i' };
    if (filter.fromDate || filter.toDate) {
      query.createdAt = {};
      if (filter.fromDate) (query.createdAt as Record<string, Date>).$gte = filter.fromDate;
      if (filter.toDate) (query.createdAt as Record<string, Date>).$lte = filter.toDate;
    }
    const [items, total] = await Promise.all([
      this._model.find(query).sort({ createdAt: -1 })
        .skip((filter.page - 1) * filter.limit).limit(filter.limit),
      this._model.countDocuments(query),
    ]);
    return { items, total };
  }

  async countByStatus(status: QuotationStatus): Promise<number> {
    return this._model.countDocuments({ status });
  }

  async totalCount(): Promise<number> {
    return this._model.countDocuments({});
  }

  async sumDownloads(): Promise<number> {
    const res = await this._model.aggregate([
      { $group: { _id: null, total: { $sum: '$downloadCount' } } },
    ]);
    return res[0]?.total ?? 0;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- quotation.repository`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/repository/quotation.repository.ts src/__tests__/repository/quotation.repository.test.ts
git commit -m "feat : add quotation repository"
```

---

## Task 7: WhatsApp deep-link util

**Files:**
- Modify: `src/config/index.ts`
- Create: `src/utils/whatsapp.util.ts`
- Test: `src/__tests__/utils/whatsapp.util.test.ts`

- [ ] **Step 1: Add admin number config**

In `src/config/index.ts`:
```ts
  ADMIN_WHATSAPP_NUMBER: process.env.ADMIN_WHATSAPP_NUMBER! as string,
```

- [ ] **Step 2: Write the failing test**

```ts
import { buildQuotationWhatsappUrl } from '../../utils/whatsapp.util';

describe('buildQuotationWhatsappUrl', () => {
  it('builds a wa.me url with an encoded prefilled message', () => {
    const url = buildQuotationWhatsappUrl({
      adminNumber: '919876543210',
      quotationNumber: 'QT-2026-ABCD1234',
      total: 5000,
      currency: 'INR',
      pdfUrl: 'https://r2.example/quotations/abc.pdf',
    });
    expect(url.startsWith('https://wa.me/919876543210?text=')).toBe(true);
    const text = decodeURIComponent(url.split('text=')[1]);
    expect(text).toContain('QT-2026-ABCD1234');
    expect(text).toContain('5000');
    expect(text).toContain('https://r2.example/quotations/abc.pdf');
  });

  it('strips non-digits from the admin number', () => {
    const url = buildQuotationWhatsappUrl({
      adminNumber: '+91 98765-43210',
      quotationNumber: 'QT-1', total: 1, currency: 'INR', pdfUrl: 'https://x/y.pdf',
    });
    expect(url.startsWith('https://wa.me/919876543210?text=')).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- whatsapp.util`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

```ts
interface IWhatsappQuotationParams {
  adminNumber: string;
  quotationNumber: string;
  total: number;
  currency: string;
  pdfUrl: string;
}

export const buildQuotationWhatsappUrl = (p: IWhatsappQuotationParams): string => {
  const digits = p.adminNumber.replace(/\D/g, '');
  const message =
    `New quotation request ${p.quotationNumber}\n` +
    `Total: ${p.currency} ${p.total}\n` +
    `PDF: ${p.pdfUrl}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- whatsapp.util`
Expected: PASS (both cases).

- [ ] **Step 6: Commit**

```bash
git add src/config/index.ts src/utils/whatsapp.util.ts src/__tests__/utils/whatsapp.util.test.ts
git commit -m "feat : add whatsapp deep link util for quotations"
```

---

## Task 8: PDF service (EJS → Puppeteer → R2)

**Files:**
- Create: `src/templates/quotation.ejs`
- Create: `src/services/pdf.service.ts`
- Test: `src/__tests__/services/pdf.service.test.ts`

> Use a single lazily-launched, reused Puppeteer browser. Launch with `--no-sandbox` for the container. Render EJS to HTML, then PDF, then upload via `uploadToR2(buffer, 'quotations', 'application/pdf')`.

- [ ] **Step 1: Create the EJS template**

`src/templates/quotation.ejs`:
```html
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  body { font-family: Arial, sans-serif; color: #222; padding: 32px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .muted { color: #666; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; margin-top: 24px; }
  th, td { border: 1px solid #ddd; padding: 8px; font-size: 12px; text-align: left; }
  th { background: #f5f0e6; }
  .right { text-align: right; }
  .totals { margin-top: 16px; width: 280px; float: right; }
  .totals td { border: none; padding: 4px 8px; }
  .grand { font-weight: bold; border-top: 2px solid #222 !important; }
</style>
</head>
<body>
  <h1>Quotation <%= quotationNumber %></h1>
  <div class="muted"><%= new Date(createdAt).toDateString() %></div>
  <div style="margin-top:16px">
    <strong><%= contact.name %></strong><br/>
    <% if (contact.company) { %><%= contact.company %><br/><% } %>
    <%= contact.email %><br/>
    <% if (contact.phoneNumber) { %>+<%= contact.isdCode %> <%= contact.phoneNumber %><% } %>
  </div>
  <table>
    <thead>
      <tr><th>Product</th><th>SKU</th><th>Options</th><th class="right">Qty</th><th class="right">Unit (<%= currency %>)</th><th class="right">Total</th></tr>
    </thead>
    <tbody>
      <% items.forEach(function(it){ %>
      <tr>
        <td><%= it.productName %></td>
        <td><%= it.sku %></td>
        <td><%= (it.attributeLabels || []).join(', ') %></td>
        <td class="right"><%= it.qty %></td>
        <td class="right"><%= it.unitPrice %></td>
        <td class="right"><%= it.lineTotal %></td>
      </tr>
      <% }); %>
    </tbody>
  </table>
  <table class="totals">
    <tr><td>Subtotal</td><td class="right"><%= currency %> <%= subtotal %></td></tr>
    <% if (discountAmount) { %><tr><td>Discount<% if (couponCode) { %> (<%= couponCode %>)<% } %></td><td class="right">- <%= currency %> <%= discountAmount %></td></tr><% } %>
    <tr class="grand"><td>Total</td><td class="right"><%= currency %> <%= total %></td></tr>
  </table>
</body>
</html>
```

- [ ] **Step 2: Write the failing test (mock puppeteer, ejs, r2)**

```ts
jest.mock('puppeteer', () => {
  const page = {
    setContent: jest.fn().mockResolvedValue(undefined),
    pdf: jest.fn().mockResolvedValue(Buffer.from('PDFDATA')),
    close: jest.fn().mockResolvedValue(undefined),
  };
  const browser = { newPage: jest.fn().mockResolvedValue(page), close: jest.fn(), connected: true };
  return { __esModule: true, default: { launch: jest.fn().mockResolvedValue(browser) } };
});
jest.mock('../../utils/r2.util', () => ({
  uploadToR2: jest.fn().mockResolvedValue('https://r2.example/quotations/abc.pdf'),
}));

import pdfService from '../../services/pdf.service';
import { uploadToR2 } from '../../utils/r2.util';

describe('pdf.service', () => {
  it('renders a quotation to a PDF and uploads it to R2', async () => {
    const url = await pdfService.renderQuotationPdf({
      quotationNumber: 'QT-1', createdAt: new Date(),
      contact: { name: 'B', email: 'b@x.com', phoneNumber: '', isdCode: '', company: '' },
      items: [{ productName: 'Mug', sku: 'M1', attributeLabels: ['Red'], qty: 50, unitPrice: 100, lineTotal: 5000 }],
      subtotal: 5000, discountAmount: 0, couponCode: null, total: 5000, currency: 'INR',
    } as never);
    expect(url).toBe('https://r2.example/quotations/abc.pdf');
    expect(uploadToR2).toHaveBeenCalledWith(expect.any(Buffer), 'quotations', 'application/pdf');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- pdf.service`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

```ts
import path from 'path';
import ejs from 'ejs';
import puppeteer, { Browser } from 'puppeteer';
import { uploadToR2 } from '../utils/r2.util';
import { InternalServerError } from '../errors/internal-server.error';
import logger from '../utils/logger';

const TEMPLATE_PATH = path.join(__dirname, '..', 'templates', 'quotation.ejs');

class PdfService {
  private _browser: Browser | null = null;

  private async _getBrowser(): Promise<Browser> {
    if (this._browser && this._browser.connected) return this._browser;
    this._browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    return this._browser;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async renderQuotationPdf(data: any): Promise<string> {
    try {
      const html = await ejs.renderFile(TEMPLATE_PATH, data);
      const browser = await this._getBrowser();
      const page = await browser.newPage();
      try {
        await page.setContent(html as string, { waitUntil: 'networkidle0' });
        const pdf = await page.pdf({ format: 'A4', printBackground: true });
        const buffer = Buffer.from(pdf);
        return await uploadToR2(buffer, 'quotations', 'application/pdf');
      } finally {
        await page.close();
      }
    } catch (err) {
      logger.error(`Quotation PDF generation failed: ${err}`);
      throw new InternalServerError('Failed to generate quotation PDF');
    }
  }
}

export default new PdfService();
```

> Note: the quotation service (Task 9) maps `InternalServerError` to the `QUOTATION_PDF_FAILED` semantics; `asyncHandler` returns 500 for `InternalServerError`. The spec's 502 is approximated as 500 to fit the existing error→status map (no new error class needed).

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- pdf.service`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/templates/quotation.ejs src/services/pdf.service.ts src/__tests__/services/pdf.service.test.ts
git commit -m "feat : add pdf service to render quotation pdfs to r2"
```

---

## Task 9: Quotation service — generate

**Files:**
- Create: `src/services/quotation.service.ts`
- Test: `src/__tests__/services/quotation.service.generate.test.ts`

> Reuses: `cart.service.getCart(actor)` for the raw items + totals, `ProductVariantRepository.findByIds` for live MOQ/active checks, `pdfService.renderQuotationPdf`, `buildQuotationWhatsappUrl`, `QuotationRepository.create`. The cart already applies the coupon discount in `getCart` (the response includes `coupon.discountAmount` and `total`), so the service consumes those rather than re-validating the coupon (the cart's merge/apply path already validated it). It re-checks variant active + MOQ at generation time.

- [ ] **Step 1: Write the failing tests**

```ts
const getCart = jest.fn();
jest.mock('../../services/cart.service', () => ({ __esModule: true, default: { getCart: (...a: unknown[]) => getCart(...a) } }));

const findByIds = jest.fn();
jest.mock('../../repository/productVariant.repository', () => ({
  ProductVariantRepository: jest.fn().mockImplementation(() => ({ findByIds })),
}));

const create = jest.fn();
jest.mock('../../repository/quotation.repository', () => ({
  QuotationRepository: jest.fn().mockImplementation(() => ({ create })),
}));

const renderQuotationPdf = jest.fn();
jest.mock('../../services/pdf.service', () => ({ __esModule: true, default: { renderQuotationPdf: (...a: unknown[]) => renderQuotationPdf(...a) } }));

import quotationService from '../../services/quotation.service';

const verifiedUser = { _id: 'u1', firstName: 'Merc', lastName: 'Edes', email: 'm@x.com', phoneNumber: '900', isdCode: '91', verified: true };

const baseCart = {
  sessionId: 's1',
  items: [{ variantId: 'v1', productId: 'p1', productName: 'Mug', sku: 'M1', attributeLabels: ['Red'], priceSnapshot: 100, qty: 50 }],
  subtotal: 5000, coupon: null, total: 5000, itemCount: 50, hasPriceChanges: false,
};

beforeEach(() => {
  getCart.mockResolvedValue(baseCart);
  findByIds.mockResolvedValue([{ _id: 'v1', isActive: true, moq: 25 }]);
  renderQuotationPdf.mockResolvedValue('https://r2/x.pdf');
  create.mockImplementation(async (doc: { quotationNumber: string }) => ({ _id: 'q1', ...doc }));
});

describe('quotationService.generateQuotation', () => {
  it('generates a quotation for a valid verified cart', async () => {
    const res = await quotationService.generateQuotation({ user: verifiedUser, sessionId: 's1' });
    expect(res.pdfUrl).toBe('https://r2/x.pdf');
    expect(res.whatsappUrl).toContain('https://wa.me/');
    expect(res.quotationNumber).toMatch(/^QT-\d{4}-/);
    expect(create).toHaveBeenCalled();
  });

  it('rejects an empty cart', async () => {
    getCart.mockResolvedValue({ ...baseCart, items: [] });
    await expect(quotationService.generateQuotation({ user: verifiedUser, sessionId: 's1' }))
      .rejects.toThrow();
  });

  it('rejects when a line is below MOQ', async () => {
    findByIds.mockResolvedValue([{ _id: 'v1', isActive: true, moq: 100 }]); // qty 50 < 100
    await expect(quotationService.generateQuotation({ user: verifiedUser, sessionId: 's1' }))
      .rejects.toThrow();
  });

  it('blocks generation if a variant is inactive', async () => {
    findByIds.mockResolvedValue([{ _id: 'v1', isActive: false, moq: 25 }]);
    await expect(quotationService.generateQuotation({ user: verifiedUser, sessionId: 's1' }))
      .rejects.toThrow();
  });

  it('does NOT persist a quotation if PDF generation fails', async () => {
    renderQuotationPdf.mockRejectedValue(new Error('boom'));
    await expect(quotationService.generateQuotation({ user: verifiedUser, sessionId: 's1' }))
      .rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- quotation.service.generate`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
import { customAlphabet } from 'nanoid';
import mongoose from 'mongoose';
import config from '../config';
import { BadRequestError } from '../errors/bad-request.error';
import { ConflictErrorJSON } from '../errors/conflict-custom.error';
import { QuotationRepository } from '../repository/quotation.repository';
import { ProductVariantRepository } from '../repository/productVariant.repository';
import cartService from './cart.service';
import pdfService from './pdf.service';
import { buildQuotationWhatsappUrl } from '../utils/whatsapp.util';
import { IQuotation, IQuotationItem } from '../models/quotation.model';

const genCode = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 8);

export interface IQuotationActorUser {
  _id: string;
  firstName: string;
  lastName?: string;
  email: string;
  phoneNumber?: string;
  isdCode?: string;
  company?: string;
}

export interface IGenerateQuotationParams {
  user: IQuotationActorUser;
  sessionId: string;
}

export interface IGenerateQuotationResult {
  quotationId: string;
  quotationNumber: string;
  pdfUrl: string;
  whatsappUrl: string;
}

class QuotationService {
  constructor(
    private readonly _quotationRepository: QuotationRepository,
    private readonly _variantRepository: ProductVariantRepository,
  ) {}

  async generateQuotation(params: IGenerateQuotationParams): Promise<IGenerateQuotationResult> {
    const { user, sessionId } = params;

    const cart = await cartService.getCart({ userId: user._id, sessionId });
    if (!cart.items.length) throw new BadRequestError('Cannot generate a quotation from an empty cart');

    const variantIds = cart.items.map(i => i.variantId);
    const liveVariants = await this._variantRepository.findByIds(variantIds);
    const liveMap = new Map(liveVariants.map(v => [v._id.toString(), v]));

    const moqViolations: Array<{ variantId: string; moq: number; qty: number }> = [];
    const inactive: string[] = [];

    for (const item of cart.items) {
      const live = liveMap.get(item.variantId);
      if (!live || !live.isActive) { inactive.push(item.variantId); continue; }
      if (item.qty < live.moq) moqViolations.push({ variantId: item.variantId, moq: live.moq, qty: item.qty });
    }

    if (inactive.length) {
      throw new BadRequestError(`Some items are no longer available: ${inactive.join(', ')}`);
    }
    if (moqViolations.length) {
      throw new ConflictErrorJSON(JSON.stringify({ code: 'MOQ_NOT_MET', violations: moqViolations }));
    }

    const items: IQuotationItem[] = cart.items.map(i => ({
      variantId: new mongoose.Types.ObjectId(i.variantId),
      productId: new mongoose.Types.ObjectId(i.productId),
      productName: i.productName,
      sku: i.sku,
      attributeLabels: i.attributeLabels,
      unitPrice: i.priceSnapshot,
      qty: i.qty,
      moq: liveMap.get(i.variantId)!.moq,
      lineTotal: i.priceSnapshot * i.qty,
    }));

    const quotationNumber = `QT-${new Date().getFullYear()}-${genCode()}`;
    const createdAt = new Date();
    const contact = {
      name: `${user.firstName}${user.lastName ? ' ' + user.lastName : ''}`,
      email: user.email,
      phoneNumber: user.phoneNumber ?? '',
      isdCode: user.isdCode ?? '',
      company: user.company ?? '',
    };

    // 1) Render + upload PDF FIRST. If this throws, nothing is persisted.
    const pdfUrl = await pdfService.renderQuotationPdf({
      quotationNumber, createdAt, contact, items,
      subtotal: cart.subtotal,
      discountAmount: cart.coupon?.discountAmount ?? 0,
      couponCode: cart.coupon?.code ?? null,
      total: cart.total, currency: 'INR',
    });

    // 2) Persist only after a PDF URL exists.
    const doc: Partial<IQuotation> = {
      quotationNumber,
      user: new mongoose.Types.ObjectId(user._id),
      contact,
      items,
      subtotal: cart.subtotal,
      couponCode: cart.coupon?.code ?? null,
      discountAmount: cart.coupon?.discountAmount ?? 0,
      total: cart.total,
      currency: 'INR',
      pdfUrl,
      source: 'b2b',
    };
    const saved = await this._quotationRepository.create(doc);

    const whatsappUrl = buildQuotationWhatsappUrl({
      adminNumber: config.ADMIN_WHATSAPP_NUMBER,
      quotationNumber,
      total: cart.total,
      currency: 'INR',
      pdfUrl,
    });

    return { quotationId: saved._id.toString(), quotationNumber, pdfUrl, whatsappUrl };
  }
}

export default new QuotationService(new QuotationRepository(), new ProductVariantRepository());
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- quotation.service.generate`
Expected: PASS (all 5 cases).

- [ ] **Step 5: Commit**

```bash
git add src/services/quotation.service.ts src/__tests__/services/quotation.service.generate.test.ts
git commit -m "feat : add quotation generation service"
```

---

## Task 10: Quotation service — history, download, admin ops

**Files:**
- Modify: `src/services/quotation.service.ts`
- Test: `src/__tests__/services/quotation.service.ops.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
const findByUser = jest.fn();
const countByUser = jest.fn();
const findById = jest.fn();
const incrementDownload = jest.fn();
const updateStatus = jest.fn();
const list = jest.fn();
const totalCount = jest.fn();
const sumDownloads = jest.fn();
const countByStatus = jest.fn();

jest.mock('../../repository/quotation.repository', () => ({
  QuotationRepository: jest.fn().mockImplementation(() => ({
    findByUser, countByUser, findById, incrementDownload, updateStatus, list, totalCount, sumDownloads, countByStatus,
  })),
}));
jest.mock('../../repository/productVariant.repository', () => ({
  ProductVariantRepository: jest.fn().mockImplementation(() => ({ findByIds: jest.fn() })),
}));

import quotationService from '../../services/quotation.service';

describe('quotation ops', () => {
  it('getQuotationPdf returns url + records a download for the owner', async () => {
    findById.mockResolvedValue({ _id: 'q1', user: { toString: () => 'u1' }, pdfUrl: 'https://r2/x.pdf' });
    incrementDownload.mockResolvedValue({});
    const res = await quotationService.getQuotationPdf('q1', 'u1');
    expect(res.pdfUrl).toBe('https://r2/x.pdf');
    expect(incrementDownload).toHaveBeenCalledWith('q1');
  });

  it('getQuotationPdf forbids a non-owner', async () => {
    findById.mockResolvedValue({ _id: 'q1', user: { toString: () => 'u1' }, pdfUrl: 'x' });
    await expect(quotationService.getQuotationPdf('q1', 'other')).rejects.toThrow();
  });

  it('updateStatus rejects an invalid status', async () => {
    await expect(quotationService.updateStatus('q1', 'bogus' as never)).rejects.toThrow();
  });

  it('analytics aggregates totals', async () => {
    totalCount.mockResolvedValue(10);
    sumDownloads.mockResolvedValue(42);
    countByStatus.mockResolvedValue(3);
    const res = await quotationService.quotationAnalytics();
    expect(res.totalQuotations).toBe(10);
    expect(res.totalDownloads).toBe(42);
    expect(res.converted).toBe(3);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- quotation.service.ops`
Expected: FAIL — methods not defined.

- [ ] **Step 3: Implement (add to QuotationService class)**

Add imports at top (if not present): `import { NotFoundError } from '../errors/not-found.error';` and `import { ForbiddenError } from '../errors/forbidden.error';` and `import { QuotationStatus } from '../models/quotation.model';`

Add methods to the class:
```ts
  async getMyQuotations(userId: string, page = 1, limit = 20) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(50, Math.max(1, limit));
    const [items, total] = await Promise.all([
      this._quotationRepository.findByUser(userId, safePage, safeLimit),
      this._quotationRepository.countByUser(userId),
    ]);
    return { items, total, page: safePage, limit: safeLimit };
  }

  async getQuotationPdf(quotationId: string, requesterId: string) {
    const q = await this._quotationRepository.findById(quotationId);
    if (!q) throw new NotFoundError('Quotation not found');
    if (q.user.toString() !== requesterId) throw new ForbiddenError('Not allowed to access this quotation');
    await this._quotationRepository.incrementDownload(quotationId);
    return { pdfUrl: q.pdfUrl, quotationNumber: q.quotationNumber };
  }

  // ---- admin ----
  async listQuotations(filter: {
    status?: QuotationStatus; search?: string; fromDate?: string; toDate?: string; page?: number; limit?: number;
  }) {
    const page = Math.max(1, Number(filter.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(filter.limit) || 20));
    return this._quotationRepository.list({
      status: filter.status,
      search: filter.search,
      fromDate: filter.fromDate ? new Date(filter.fromDate) : undefined,
      toDate: filter.toDate ? new Date(filter.toDate) : undefined,
      page, limit,
    });
  }

  async getQuotation(quotationId: string) {
    const q = await this._quotationRepository.findById(quotationId);
    if (!q) throw new NotFoundError('Quotation not found');
    return q;
  }

  async updateStatus(quotationId: string, status: QuotationStatus) {
    const allowed: QuotationStatus[] = ['generated', 'sent', 'viewed', 'converted', 'archived'];
    if (!allowed.includes(status)) throw new BadRequestError('Invalid quotation status');
    const updated = await this._quotationRepository.updateStatus(quotationId, status);
    if (!updated) throw new NotFoundError('Quotation not found');
    return updated;
  }

  async quotationAnalytics() {
    const [totalQuotations, totalDownloads, converted] = await Promise.all([
      this._quotationRepository.totalCount(),
      this._quotationRepository.sumDownloads(),
      this._quotationRepository.countByStatus('converted'),
    ]);
    return { totalQuotations, totalDownloads, converted };
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- quotation.service.ops`
Expected: PASS (all 4 cases).

- [ ] **Step 5: Commit**

```bash
git add src/services/quotation.service.ts src/__tests__/services/quotation.service.ops.test.ts
git commit -m "feat : add quotation history download and admin operations"
```

---

## Task 11: Verification-gate middleware

**Files:**
- Create: `src/middlewares/require-verified.middleware.ts`
- Test: `src/__tests__/middlewares/require-verified.test.ts`

> The buyer routes use silent auth (`req.user` may be unset). This gate returns 403 `VERIFICATION_REQUIRED` when there is no verified user. It must load the user record to read `verified` (silent-auth only sets `req.user._id`).

- [ ] **Step 1: Write the failing test**

```ts
const findById = jest.fn();
jest.mock('../../repository/user.repository', () => ({
  UserRepository: jest.fn().mockImplementation(() => ({ findById })),
}));

import requireVerified from '../../middlewares/require-verified.middleware';
import { ForbiddenError } from '../../errors/forbidden.error';

const run = (req: unknown) => new Promise((resolve, reject) => {
  requireVerified(req as never, {} as never, (err?: unknown) => (err ? reject(err) : resolve('next')));
});

describe('requireVerified', () => {
  it('passes a verified user', async () => {
    findById.mockResolvedValue({ _id: 'u1', verified: true });
    await expect(run({ user: { _id: 'u1' } })).resolves.toBe('next');
  });
  it('blocks when no user on request', async () => {
    await expect(run({})).rejects.toBeInstanceOf(ForbiddenError);
  });
  it('blocks an unverified user', async () => {
    findById.mockResolvedValue({ _id: 'u1', verified: false });
    await expect(run({ user: { _id: 'u1' } })).rejects.toBeInstanceOf(ForbiddenError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- require-verified`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

> Confirm the user repo class name + `findById` signature in `src/repository/user.repository.ts` before writing; adjust if different.

```ts
import { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../errors/forbidden.error';
import { UserRepository } from '../repository/user.repository';

const userRepository = new UserRepository();

const requireVerified = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    if (!req.user?._id) {
      return next(new ForbiddenError('VERIFICATION_REQUIRED'));
    }
    const user = await userRepository.findById(req.user._id);
    if (!user || !user.verified) {
      return next(new ForbiddenError('VERIFICATION_REQUIRED'));
    }
    return next();
  } catch (err) {
    return next(err);
  }
};

export default requireVerified;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- require-verified`
Expected: PASS (all 3 cases).

- [ ] **Step 5: Commit**

```bash
git add src/middlewares/require-verified.middleware.ts src/__tests__/middlewares/require-verified.test.ts
git commit -m "feat : add verification gate middleware for quotation generation"
```

---

## Task 12: Buyer quotation controller + routes

**Files:**
- Create: `src/controllers/quotation.controller.ts`
- Create: `src/middlewares/validators/quotation.validator.ts`
- Create: `src/routes/quotation.route.ts`
- Modify: `src/routes/v1.route.ts`
- Test: `src/__tests__/routes/quotation.route.test.ts`

> The generate route needs the full verified user object (firstName/email/phone) for the quotation contact. The controller loads the user via the user repository (or reuses an existing `authService.profile`-style method) and passes it to the service. Confirm the exact method to fetch a user profile; this plan uses `userRepository.findById`.

- [ ] **Step 1: Create the controller**

`src/controllers/quotation.controller.ts`:
```ts
import { NextFunction, Request, Response } from 'express';
import quotationService from '../services/quotation.service';
import { UserRepository } from '../repository/user.repository';

const userRepository = new UserRepository();

export const generateQuotation = async (req: Request, _res: Response, next: NextFunction) => {
  const user = await userRepository.findById(req.user._id);
  const response = await quotationService.generateQuotation({
    user: {
      _id: req.user._id,
      firstName: user!.firstName,
      lastName: user!.lastName,
      email: user!.email,
      phoneNumber: user!.phoneNumber,
      isdCode: user!.isdCode,
    },
    sessionId: req.sessionId,
  });
  next(response);
};

export const getMyQuotations = async (req: Request, _res: Response, next: NextFunction) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  const response = await quotationService.getMyQuotations(req.user._id, page, limit);
  next(response);
};

export const downloadQuotationPdf = async (req: Request, _res: Response, next: NextFunction) => {
  const response = await quotationService.getQuotationPdf(req.params.id, req.user._id);
  next(response);
};
```

- [ ] **Step 2: Create the validator**

`src/middlewares/validators/quotation.validator.ts`:
```ts
import { check } from 'express-validator';
import { validateRequest } from '.';
import { isMongoId } from '../../utils/validator.utils';

export const quotationIdValidator = [
  isMongoId('id'),
  ...validateRequest,
];

export const updateQuotationStatusValidator = [
  check('status')
    .isIn(['generated', 'sent', 'viewed', 'converted', 'archived'])
    .withMessage('Invalid quotation status'),
  ...validateRequest,
];
```

- [ ] **Step 3: Create the route**

`src/routes/quotation.route.ts`:
```ts
import { Router } from 'express';
import config from '../config';
import { asyncHandler } from '../utils/asynchandler';
import getAuthMiddlewareByJWTSecret from '../middlewares/auth/verify-token.middleware';
import cartSessionMiddleware from '../middlewares/cart-session.middleware';
import isLoggedIn from '../middlewares/isLoggedIn.middleware';
import requireVerified from '../middlewares/require-verified.middleware';
import { quotationIdValidator } from '../middlewares/validators/quotation.validator';
import {
  generateQuotation,
  getMyQuotations,
  downloadQuotationPdf,
} from '../controllers/quotation.controller';

const quotationRouter = Router();
const tryAuth = getAuthMiddlewareByJWTSecret(config.JWT_SECRET);

// Generate: silent auth + session, then verification gate.
quotationRouter.post('/', tryAuth, cartSessionMiddleware, requireVerified, asyncHandler(generateQuotation));

// History + download: require a real logged-in user.
quotationRouter.get('/mine', isLoggedIn, asyncHandler(getMyQuotations));
quotationRouter.get('/:id/pdf', isLoggedIn, quotationIdValidator, asyncHandler(downloadQuotationPdf));

export default quotationRouter;
```

- [ ] **Step 4: Wire into v1.route**

In `src/routes/v1.route.ts`, add the import:
```ts
import quotationRouter from './quotation.route';
```
and the mount (after the cart mount):
```ts
v1Router.use('/quotations', quotationRouter);
```

- [ ] **Step 5: Write the integration test (mock the service layer)**

```ts
import express from 'express';
import request from 'supertest';

jest.mock('../../middlewares/auth/verify-token.middleware', () => ({
  __esModule: true,
  default: () => (req: { user?: unknown }, _res: unknown, next: () => void) => { req.user = { _id: 'u1' }; next(); },
}));
jest.mock('../../middlewares/require-verified.middleware', () => ({
  __esModule: true, default: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
jest.mock('../../repository/user.repository', () => ({
  UserRepository: jest.fn().mockImplementation(() => ({
    findById: jest.fn().mockResolvedValue({ firstName: 'Merc', email: 'm@x.com', phoneNumber: '900', isdCode: '91' }),
  })),
}));
const generate = jest.fn();
jest.mock('../../services/quotation.service', () => ({
  __esModule: true,
  default: { generateQuotation: (...a: unknown[]) => generate(...a) },
}));

import quotationRouter from '../../routes/quotation.route';
import { asyncHandler } from '../../utils/asynchandler';

const app = express();
app.use(express.json());
app.use((req, _res, next) => { (req as { sessionId?: string }).sessionId = 's1'; next(); });
app.use('/quotations', quotationRouter);
// minimal next(response) handler mirroring the global handler
app.use((payload: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(200).json(payload);
});

describe('POST /quotations', () => {
  it('returns the generation result', async () => {
    generate.mockResolvedValue({ quotationId: 'q1', quotationNumber: 'QT-2026-AB', pdfUrl: 'https://r2/x.pdf', whatsappUrl: 'https://wa.me/91?text=x' });
    const res = await request(app).post('/quotations').send({});
    expect(res.status).toBe(200);
    expect(res.body.quotationNumber).toBe('QT-2026-AB');
    expect(res.body.whatsappUrl).toContain('wa.me');
  });
});
```

- [ ] **Step 6: Run test + build**

Run: `npm test -- quotation.route` then `npm run build`
Expected: test PASS; build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/controllers/quotation.controller.ts src/middlewares/validators/quotation.validator.ts src/routes/quotation.route.ts src/routes/v1.route.ts src/__tests__/routes/quotation.route.test.ts
git commit -m "feat : add buyer quotation routes for generate history and download"
```

---

## Task 13: Admin quotation (enquiry) management routes

**Files:**
- Create: `src/controllers/admin.quotation.controller.ts`
- Modify: `src/routes/admin.route.ts`
- Test: `src/__tests__/controllers/admin.quotation.controller.test.ts`

> Match how other admin controllers/routes are wired in `admin.route.ts` (e.g. `admin.order.controller`, the admin auth middleware name). This plan assumes `requireAdminAuth`-style protection already applied at the admin router level; if each route attaches it individually, follow that pattern.

- [ ] **Step 1: Create the controller**

`src/controllers/admin.quotation.controller.ts`:
```ts
import { NextFunction, Request, Response } from 'express';
import quotationService from '../services/quotation.service';

export const listQuotations = async (req: Request, _res: Response, next: NextFunction) => {
  const { status, search, fromDate, toDate, page, limit } = req.query;
  const response = await quotationService.listQuotations({
    status: status as undefined,
    search: search as string | undefined,
    fromDate: fromDate as string | undefined,
    toDate: toDate as string | undefined,
    page: Number(page) || undefined,
    limit: Number(limit) || undefined,
  });
  next(response);
};

export const getQuotation = async (req: Request, _res: Response, next: NextFunction) => {
  const response = await quotationService.getQuotation(req.params.id);
  next(response);
};

export const updateQuotationStatus = async (req: Request, _res: Response, next: NextFunction) => {
  const response = await quotationService.updateStatus(req.params.id, req.body.status);
  next(response);
};

export const quotationAnalytics = async (_req: Request, _res: Response, next: NextFunction) => {
  const response = await quotationService.quotationAnalytics();
  next(response);
};
```

- [ ] **Step 2: Wire into admin.route**

In `src/routes/admin.route.ts`, add imports:
```ts
import {
  listQuotations,
  getQuotation,
  updateQuotationStatus,
  quotationAnalytics,
} from '../controllers/admin.quotation.controller';
import {
  quotationIdValidator,
  updateQuotationStatusValidator,
} from '../middlewares/validators/quotation.validator';
```
Add routes (mirroring the admin-auth wrapping used by sibling admin routes in this file):
```ts
adminRouter.get('/quotations', asyncHandler(listQuotations));
adminRouter.get('/quotations/analytics', asyncHandler(quotationAnalytics));
adminRouter.get('/quotations/:id', quotationIdValidator, asyncHandler(getQuotation));
adminRouter.patch('/quotations/:id/status', quotationIdValidator, updateQuotationStatusValidator, asyncHandler(updateQuotationStatus));
```
> Register `/quotations/analytics` BEFORE `/quotations/:id` so "analytics" is not captured as an `:id`.

- [ ] **Step 3: Write the controller test (mock the service)**

```ts
const listQuotationsSvc = jest.fn();
const updateStatusSvc = jest.fn();
const analyticsSvc = jest.fn();
jest.mock('../../services/quotation.service', () => ({
  __esModule: true,
  default: {
    listQuotations: (...a: unknown[]) => listQuotationsSvc(...a),
    updateStatus: (...a: unknown[]) => updateStatusSvc(...a),
    quotationAnalytics: (...a: unknown[]) => analyticsSvc(...a),
    getQuotation: jest.fn(),
  },
}));

import { listQuotations, updateQuotationStatus, quotationAnalytics } from '../../controllers/admin.quotation.controller';

const mkRes = () => ({});
const run = (handler: (req: unknown, res: unknown, next: (p: unknown) => void) => Promise<void>, req: unknown) =>
  new Promise((resolve) => handler(req, mkRes(), (payload) => resolve(payload)));

describe('admin quotation controller', () => {
  it('listQuotations forwards filters and returns service result', async () => {
    listQuotationsSvc.mockResolvedValue({ items: [], total: 0 });
    const out = await run(listQuotations as never, { query: { status: 'generated', page: '1' } });
    expect(listQuotationsSvc).toHaveBeenCalled();
    expect(out).toEqual({ items: [], total: 0 });
  });

  it('updateQuotationStatus forwards id + status', async () => {
    updateStatusSvc.mockResolvedValue({ _id: 'q1', status: 'converted' });
    const out = await run(updateQuotationStatus as never, { params: { id: 'q1' }, body: { status: 'converted' } });
    expect(updateStatusSvc).toHaveBeenCalledWith('q1', 'converted');
    expect(out).toEqual({ _id: 'q1', status: 'converted' });
  });

  it('quotationAnalytics returns aggregates', async () => {
    analyticsSvc.mockResolvedValue({ totalQuotations: 5, totalDownloads: 9, converted: 2 });
    const out = await run(quotationAnalytics as never, {});
    expect(out).toEqual({ totalQuotations: 5, totalDownloads: 9, converted: 2 });
  });
});
```

- [ ] **Step 4: Run test + build**

Run: `npm test -- admin.quotation.controller` then `npm run build`
Expected: test PASS; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/controllers/admin.quotation.controller.ts src/routes/admin.route.ts src/__tests__/controllers/admin.quotation.controller.test.ts
git commit -m "feat : add admin quotation enquiry management routes"
```

---

## Task 14: Env docs + final verification

**Files:**
- Modify: `example.env`
- Modify: `README.md`

- [ ] **Step 1: Document new env vars in `example.env`**

Add:
```
ADMIN_WHATSAPP_NUMBER=919876543210
MAX_CART_QTY_PER_ITEM=9999
```

- [ ] **Step 2: Note Puppeteer/Chromium in README**

Add a short README note: Puppeteer downloads Chromium on install; in Docker the image must include Chromium's shared libs, and the browser launches with `--no-sandbox`.

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: all suites PASS.

- [ ] **Step 4: Run the build**

Run: `npm run build`
Expected: succeeds with no TypeScript errors.

- [ ] **Step 5: Run lint fix**

Run: `npm run lint:fix`
Expected: no remaining errors.

- [ ] **Step 6: Commit**

```bash
git add example.env README.md
git commit -m "docs : document quotation env vars and puppeteer requirement"
```

---

## Self-Review notes (resolved during planning)

- **Guest cart + merge**: already implemented (`cart.service.mergeGuestCart`, `POST /cart/merge`) — no rebuild; spec §3.2 updated. The verification-gate flow relies on the existing merge endpoint being called by the frontend after OTP.
- **Coupon at generation**: cart's `getCart` already returns the validated coupon discount + total; the quotation service consumes that rather than re-validating, avoiding duplicate logic. (Spec §4.1 mentioned re-validation; the cart already owns coupon validity, so we trust the cart total.)
- **MOQ vs cart cap**: cart cap raised via config (Task 4); MOQ enforced authoritatively at generation (Task 9).
- **PDF failure status**: spec said 502; implemented as `InternalServerError` (500) to fit the existing error→status map without adding a new error class. Functionally equivalent (no quotation persisted on PDF failure — verified by a test).
- **quotationNumber**: nanoid-suffixed `QT-YYYY-xxxxxxxx`, mirroring `orderId`'s `SOV-xxxxxxxx`; unique index guards collisions.
- **Assumptions to confirm at task time** (flagged inline): exact admin-auth middleware name + wiring in `admin.route.ts`; user repository class/method names; admin variant create/update validator + service method names. These follow existing patterns; adjust names to match.

## Out of scope (future specs)
Company-scoped employee logins, employee coupons, brand filtering, admin catalogue generation, quotation→order conversion, Phase 2 seller marketplace.
