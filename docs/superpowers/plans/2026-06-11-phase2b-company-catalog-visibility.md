# Phase 2b — Per-Company Catalog Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give company employees a private catalog — admin-whitelisted public products/categories plus the company's own private products — via dedicated `isEmployee`-guarded routes, while keeping private products out of the public catalog.

**Architecture:** Add a `visibility`/`ownerCompanyId` dimension to `product`; store each company's whitelist in a `companyCatalog` doc. A single scoped Mongo predicate resolves the employee view. Public reads gain a `visibility:'public'` filter (threaded so admin still sees everything). Strict layering, no `ref`/`populate`, custom errors, repositories-only-touch-Mongoose.

**Tech Stack:** Express, TypeScript, Mongoose, Redis (CacheManager), Jest + supertest.

**Spec:** `docs/superpowers/specs/2026-06-11-phase2b-company-catalog-visibility-design.md`
**Depends on:** Phase 2a (Company model, `isEmployee`, employee identity). Branch cut from `feat/phase2a-company-employee-foundation`.

---

## File structure

**Create:**
- `src/models/companyCatalog.model.ts`
- `src/repository/companyCatalog.repository.ts`
- `src/services/companyCatalog.service.ts` — admin whitelist read/mutate.
- `src/services/employee.catalog.service.ts` — scoped list/detail/search/related/recently-viewed.
- `src/controllers/admin.companyCatalog.controller.ts`
- `src/controllers/employee.catalog.controller.ts`
- `src/routes/employee.catalog.route.ts`
- Test files per task.

**Modify:**
- `src/models/product.model.ts` — `visibility` + `ownerCompanyId`.
- `src/repository/product.repository.ts` — public-narrowing + employee-scoped methods.
- `src/services/catalog/product.service.ts` — public reads pass `visibility:'public'`; create/update accept visibility.
- `src/controllers/catalog.controller.ts` — public list injects `visibility:'public'`.
- `src/controllers/admin.catalog.controller.ts` — create/update accept `visibility`/`ownerCompanyId`.
- `src/middlewares/validators/catalog.validator.ts` — product visibility validation.
- `src/middlewares/validators/company.validator.ts` — whitelist PATCH validators.
- `src/middlewares/isEmployee.middleware.ts` — attach `req.companyId`.
- `src/@types/custom.d.ts` — add `companyId` to `Request`.
- `src/routes/admin.route.ts` — whitelist + company-products routes.
- `src/routes/v1.route.ts` — mount `/employee/catalog`.
- `README.md`.

---

## Task 1: Product visibility fields

**Files:**
- Modify: `src/models/product.model.ts`
- Test: `src/__tests__/models/product.visibility.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/models/product.visibility.test.ts
import ProductModel from '../../models/product.model';

describe('Product visibility', () => {
  it('defaults visibility to public', () => {
    const p = new ProductModel({ name: 'Mug', slug: 'mug', category: '64b8f0000000000000000001' });
    expect(p.visibility).toBe('public');
  });

  it('accepts a company-private product with an owner', () => {
    const p = new ProductModel({ name: 'X', slug: 'x', category: '64b8f0000000000000000001', visibility: 'company', ownerCompanyId: '64b8f0000000000000000002' });
    expect(p.visibility).toBe('company');
    expect(p.validateSync()).toBeUndefined();
  });

  it('rejects an invalid visibility', () => {
    const p = new ProductModel({ name: 'X', slug: 'x', category: '64b8f0000000000000000001', visibility: 'bogus' });
    expect(p.validateSync()?.errors?.visibility).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest product.visibility -v`
Expected: FAIL — `visibility` not a schema path.

- [ ] **Step 3: Add the fields**

In `src/models/product.model.ts`, add to the schema object (after `isFeatured`):

```ts
    visibility: { type: String, enum: ['public', 'company'], default: 'public' },
    ownerCompanyId: { type: mongoose.Schema.Types.ObjectId },
```

Add the compound index (after the existing indexes):

```ts
productSchema.index({ visibility: 1, ownerCompanyId: 1 });
```

Extend `IProduct` (after `isFeatured: boolean;`):

```ts
  visibility: 'public' | 'company';
  ownerCompanyId?: mongoose.Types.ObjectId;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest product.visibility -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/models/product.model.ts src/__tests__/models/product.visibility.test.ts
git commit -m "feat : add visibility and owner company to product model"
```

---

## Task 2: companyCatalog model

**Files:**
- Create: `src/models/companyCatalog.model.ts`
- Test: `src/__tests__/models/companyCatalog.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/models/companyCatalog.test.ts
import CompanyCatalogModel from '../../models/companyCatalog.model';

describe('CompanyCatalog model', () => {
  it('defaults productIds and categoryIds to empty arrays', () => {
    const c = new CompanyCatalogModel({ companyId: '64b8f0000000000000000001' });
    expect(c.productIds).toEqual([]);
    expect(c.categoryIds).toEqual([]);
    expect(c.validateSync()).toBeUndefined();
  });

  it('requires a companyId', () => {
    const c = new CompanyCatalogModel({});
    expect(c.validateSync()?.errors?.companyId).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest models/companyCatalog -v`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement the model**

```ts
// src/models/companyCatalog.model.ts
import mongoose from 'mongoose';

const companyCatalogSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
    productIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    categoryIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  },
  { timestamps: true },
);

export interface ICompanyCatalog extends mongoose.Document {
  _id: mongoose.Types.ObjectId;
  companyId: mongoose.Types.ObjectId;
  productIds: mongoose.Types.ObjectId[];
  categoryIds: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

export default mongoose.model<ICompanyCatalog>('CompanyCatalog', companyCatalogSchema);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest models/companyCatalog -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/models/companyCatalog.model.ts src/__tests__/models/companyCatalog.test.ts
git commit -m "feat : add company catalog whitelist model"
```

---

## Task 3: companyCatalog repository

**Files:**
- Create: `src/repository/companyCatalog.repository.ts`

(Repositories are not unit-tested directly; covered via service tests. Verify via `npm run build`.)

- [ ] **Step 1: Implement the repository**

```ts
// src/repository/companyCatalog.repository.ts
import companyCatalogModel, { ICompanyCatalog } from '../models/companyCatalog.model';

export class CompanyCatalogRepository {
  private _model = companyCatalogModel;

  async findByCompanyId(companyId: string): Promise<ICompanyCatalog | null> {
    return this._model.findOne({ companyId });
  }

  async applyDeltas(
    companyId: string,
    deltas: { addProductIds?: string[]; removeProductIds?: string[]; addCategoryIds?: string[]; removeCategoryIds?: string[] },
  ): Promise<ICompanyCatalog> {
    // Ensure the doc exists.
    await this._model.updateOne(
      { companyId },
      { $setOnInsert: { companyId, productIds: [], categoryIds: [] } },
      { upsert: true },
    );

    if (deltas.addProductIds?.length) {
      await this._model.updateOne({ companyId }, { $addToSet: { productIds: { $each: deltas.addProductIds } } });
    }
    if (deltas.removeProductIds?.length) {
      await this._model.updateOne({ companyId }, { $pull: { productIds: { $in: deltas.removeProductIds } } });
    }
    if (deltas.addCategoryIds?.length) {
      await this._model.updateOne({ companyId }, { $addToSet: { categoryIds: { $each: deltas.addCategoryIds } } });
    }
    if (deltas.removeCategoryIds?.length) {
      await this._model.updateOne({ companyId }, { $pull: { categoryIds: { $in: deltas.removeCategoryIds } } });
    }

    return (await this._model.findOne({ companyId }))!;
  }
}
```

> `$addToSet` de-duplicates; `$pull` of an absent id is a no-op (per spec edge cases).

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/repository/companyCatalog.repository.ts
git commit -m "feat : add company catalog repository"
```

---

## Task 4: Narrow public catalog reads to visibility:'public'

**Files:**
- Modify: `src/repository/product.repository.ts`
- Modify: `src/services/catalog/product.service.ts`
- Modify: `src/controllers/catalog.controller.ts`
- Test: `src/__tests__/services/product.service.publicVisibility.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/services/product.service.publicVisibility.test.ts
const productRepo = {
  findWithFilters: jest.fn().mockResolvedValue({ docs: [], total: 0 }),
  findBySlug: jest.fn(),
};
const variantRepo = {
  getMinPriceByProductIds: jest.fn().mockResolvedValue([]),
  findDistinctProductIdsByFilters: jest.fn(),
};
const categoryRepo = { findBySlug: jest.fn().mockResolvedValue(null) };
jest.mock('../../repository/product.repository', () => ({
  __esModule: true,
  ProductRepository: jest.fn().mockImplementation(() => productRepo),
}));
jest.mock('../../repository/productVariant.repository', () => ({
  __esModule: true,
  ProductVariantRepository: jest.fn().mockImplementation(() => variantRepo),
}));
jest.mock('../../repository/category.repository', () => ({
  __esModule: true,
  CategoryRepository: jest.fn().mockImplementation(() => categoryRepo),
}));
jest.mock('../../services/cache/entities', () => ({
  __esModule: true,
  productListCacheManager: { get: jest.fn().mockResolvedValue(null), set: jest.fn(), flush: jest.fn() },
  productDetailCacheManager: { get: jest.fn().mockResolvedValue(null), set: jest.fn(), remove: jest.fn() },
}));

import productService from '../../services/catalog/product.service';

describe('public catalog excludes private products', () => {
  beforeEach(() => jest.clearAllMocks());

  it('listProducts forwards visibility:public to the repository filter', async () => {
    await productService.listProducts({ visibility: 'public' });
    expect(productRepo.findWithFilters).toHaveBeenCalledWith(
      expect.objectContaining({ filter: expect.objectContaining({ isActive: true, visibility: 'public' }) }),
    );
  });

  it('getFeaturedProducts filters to public', async () => {
    await productService.getFeaturedProducts();
    expect(productRepo.findWithFilters).toHaveBeenCalledWith(
      expect.objectContaining({ filter: expect.objectContaining({ visibility: 'public' }) }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest product.service.publicVisibility -v`
Expected: FAIL — `visibility` not forwarded.

- [ ] **Step 3: Add visibility to the repository filter + narrow public-only methods**

In `src/repository/product.repository.ts`:

Add `visibility` to `IProductFilter`:

```ts
export interface IProductFilter {
  categoryId?: string;
  productIds?: string[];
  isActive?: boolean;
  isFeatured?: boolean;
  visibility?: 'public' | 'company';
  ownerCompanyId?: string;
}
```

In `findWithFilters`, after the existing `if (filter.productIds?.length) ...` line, add:

```ts
    if (filter.visibility) query.visibility = filter.visibility;
    if (filter.ownerCompanyId) query.ownerCompanyId = filter.ownerCompanyId;
```

Narrow the public-only methods. Change `findBySlug`:

```ts
  async findBySlug(slug: string): Promise<IProduct | null> {
    return this._model.findOne({ slug, isActive: true, visibility: 'public' });
  }
```

Change `search`'s filter:

```ts
    const filter = { $text: { $search: query }, isActive: true, visibility: 'public' };
```

Change `findRelated`:

```ts
  async findRelated(productId: string, categoryId: string, limit: number): Promise<IProduct[]> {
    return this._model
      .find({ category: categoryId, isActive: true, visibility: 'public', _id: { $ne: productId } })
      .sort({ rating: -1 })
      .limit(limit);
  }
```

> `findById`, `findByIds`, `findBySlugAdmin`, and `update` stay unchanged — admin/internal paths must still see all products.

- [ ] **Step 4: Thread visibility through the public service + featured/bestsellers**

In `src/services/catalog/product.service.ts`:

In `listProducts`, where the filter is built for `findWithFilters` (`filter: { isActive: true, categoryId, productIds }`), add `visibility`:

```ts
      filter: { isActive: true, categoryId, productIds, visibility: query.visibility as 'public' | 'company' | undefined },
```

Add `visibility` to the destructured query type signature of `listProducts` (the inline `query: { ...; [key: string]: unknown }` already allows it via the index signature — no change needed beyond reading `query.visibility`).

In `getFeaturedProducts`, change the filter:

```ts
      filter: { isActive: true, isFeatured: true, visibility: 'public' },
```

In `getBestsellers`, change the filter:

```ts
      filter: { isActive: true, visibility: 'public' },
```

- [ ] **Step 5: Public controller injects visibility:'public'**

In `src/controllers/catalog.controller.ts`, change the public `listProducts` handler to inject the filter:

```ts
export const listProducts = async (req: Request, _res: Response, next: NextFunction) => {
  const response = await productService.listProducts({ ...(req.query as Record<string, unknown>), visibility: 'public' });
  next(response);
};
```

> `searchProducts`, `getProductBySlug`, `getRelatedProducts`, `getFeaturedProducts`, `getBestsellers` are now public-narrowed at the repository/service level. `listProductsAdmin` (admin) keeps calling `productService.listProducts(req.query)` without injecting `visibility`, so admin still sees all (and can filter by `?visibility=`/`?ownerCompanyId=`).

- [ ] **Step 6: Run test + build**

Run: `npx jest product.service.publicVisibility -v`
Expected: PASS (2 tests).
Run: `npm run build`
Expected: no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add src/repository/product.repository.ts src/services/catalog/product.service.ts src/controllers/catalog.controller.ts src/__tests__/services/product.service.publicVisibility.test.ts
git commit -m "feat : exclude company-private products from public catalog reads"
```

---

## Task 5: Product repository — employee-scoped methods

**Files:**
- Modify: `src/repository/product.repository.ts`

(Covered via `employee.catalog.service` tests in Tasks 7–8. Verify via `npm run build`.)

- [ ] **Step 1: Add the scope builder + scoped methods**

Add this interface near the top exports of `src/repository/product.repository.ts`:

```ts
export interface IEmployeeScope {
  companyId: string;
  productIds: string[];
  categoryIds: string[];
}
```

Add these methods to the `ProductRepository` class:

```ts
  private _employeePredicate(scope: IEmployeeScope): Record<string, unknown> {
    return {
      $or: [
        {
          visibility: 'public',
          $or: [{ _id: { $in: scope.productIds } }, { category: { $in: scope.categoryIds } }],
        },
        { visibility: 'company', ownerCompanyId: scope.companyId },
      ],
    };
  }

  async findEmployeeCatalog(params: {
    scope: IEmployeeScope;
    categoryId?: string;
    restrictToProductIds?: string[];
    sort: IProductSort;
    skip: number;
    limit: number;
  }): Promise<{ docs: IProduct[]; total: number }> {
    const query: Record<string, unknown> = { isActive: true, ...this._employeePredicate(params.scope) };
    if (params.categoryId) query.category = params.categoryId;
    if (params.restrictToProductIds?.length) query._id = { $in: params.restrictToProductIds };

    const [docs, total] = await Promise.all([
      this._model.find(query).sort({ [params.sort.field]: params.sort.direction }).skip(params.skip).limit(params.limit),
      this._model.countDocuments(query),
    ]);
    return { docs, total };
  }

  async findEmployeeProductBySlug(scope: IEmployeeScope, slug: string): Promise<IProduct | null> {
    return this._model.findOne({ slug, isActive: true, ...this._employeePredicate(scope) });
  }

  async searchEmployeeCatalog(scope: IEmployeeScope, query: string, skip: number, limit: number): Promise<{ docs: IProduct[]; total: number }> {
    const filter = { $text: { $search: query }, isActive: true, ...this._employeePredicate(scope) };
    const projection = { score: { $meta: 'textScore' } };
    const [docs, total] = await Promise.all([
      this._model.find(filter, projection).sort({ score: { $meta: 'textScore' } }).skip(skip).limit(limit),
      this._model.countDocuments(filter),
    ]);
    return { docs, total };
  }

  async findEmployeeRelated(scope: IEmployeeScope, productId: string, categoryId: string, limit: number): Promise<IProduct[]> {
    return this._model
      .find({ category: categoryId, isActive: true, _id: { $ne: productId }, ...this._employeePredicate(scope) })
      .sort({ rating: -1 })
      .limit(limit);
  }

  async findEmployeeByIds(scope: IEmployeeScope, ids: string[]): Promise<IProduct[]> {
    return this._model.find({ _id: { $in: ids }, isActive: true, ...this._employeePredicate(scope) });
  }
```

> The predicate is an `$or` of (public AND whitelisted-by-product-or-category) OR (private owned by the company). Empty whitelist arrays make the public branch match nothing, so the employee sees only their private products — a valid empty-catalog state.

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/repository/product.repository.ts
git commit -m "feat : add company-scoped product repository methods"
```

---

## Task 6: companyCatalog.service — admin whitelist read/mutate

**Files:**
- Create: `src/services/companyCatalog.service.ts`
- Test: `src/__tests__/services/companyCatalog.service.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/services/companyCatalog.service.test.ts
const catalogRepo = { findByCompanyId: jest.fn(), applyDeltas: jest.fn() };
const companyRepo = { findById: jest.fn() };
const productRepo = { findByIds: jest.fn() };
jest.mock('../../repository/companyCatalog.repository', () => ({
  __esModule: true,
  CompanyCatalogRepository: jest.fn().mockImplementation(() => catalogRepo),
}));
jest.mock('../../repository/company.repository', () => ({
  __esModule: true,
  CompanyRepository: jest.fn().mockImplementation(() => companyRepo),
}));
jest.mock('../../repository/product.repository', () => ({
  __esModule: true,
  ProductRepository: jest.fn().mockImplementation(() => productRepo),
}));

import companyCatalogService from '../../services/companyCatalog.service';
import { NotFoundError } from '../../errors/not-found.error';
import { BadRequestError } from '../../errors/bad-request.error';

describe('companyCatalog.service', () => {
  beforeEach(() => jest.clearAllMocks());

  it('getCatalog returns empty arrays when no doc exists', async () => {
    companyRepo.findById.mockResolvedValue({ _id: 'c1' });
    catalogRepo.findByCompanyId.mockResolvedValue(null);
    const out = await companyCatalogService.getCatalog('c1');
    expect(out).toEqual({ companyId: 'c1', productIds: [], categoryIds: [] });
  });

  it('throws NotFound for an unknown company', async () => {
    companyRepo.findById.mockResolvedValue(null);
    await expect(companyCatalogService.getCatalog('nope')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('applies deltas after validating added products are public', async () => {
    companyRepo.findById.mockResolvedValue({ _id: 'c1' });
    productRepo.findByIds.mockResolvedValue([{ _id: { toString: () => 'p1' }, visibility: 'public', isActive: true }]);
    catalogRepo.applyDeltas.mockResolvedValue({ companyId: 'c1', productIds: ['p1'], categoryIds: [] });
    const out = await companyCatalogService.updateCatalog('c1', { addProductIds: ['p1'] });
    expect(catalogRepo.applyDeltas).toHaveBeenCalledWith('c1', expect.objectContaining({ addProductIds: ['p1'] }));
    expect(out.productIds).toEqual(['p1']);
  });

  it('rejects whitelisting a non-public or missing product', async () => {
    companyRepo.findById.mockResolvedValue({ _id: 'c1' });
    productRepo.findByIds.mockResolvedValue([{ _id: { toString: () => 'p1' }, visibility: 'company', isActive: true }]);
    await expect(companyCatalogService.updateCatalog('c1', { addProductIds: ['p1'] })).rejects.toBeInstanceOf(BadRequestError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest companyCatalog.service -v`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement the service**

```ts
// src/services/companyCatalog.service.ts
import { NotFoundError } from '../errors/not-found.error';
import { BadRequestError } from '../errors/bad-request.error';
import { CompanyCatalogRepository } from '../repository/companyCatalog.repository';
import { CompanyRepository } from '../repository/company.repository';
import { ProductRepository } from '../repository/product.repository';

interface IDeltas {
  addProductIds?: string[];
  removeProductIds?: string[];
  addCategoryIds?: string[];
  removeCategoryIds?: string[];
}

class CompanyCatalogService {
  constructor(
    private readonly _catalogRepository: CompanyCatalogRepository,
    private readonly _companyRepository: CompanyRepository,
    private readonly _productRepository: ProductRepository,
  ) {}

  async getCatalog(companyId: string) {
    const company = await this._companyRepository.findById(companyId);
    if (!company) throw new NotFoundError('Company not found');

    const doc = await this._catalogRepository.findByCompanyId(companyId);
    return {
      companyId,
      productIds: doc ? doc.productIds.map(id => id.toString()) : [],
      categoryIds: doc ? doc.categoryIds.map(id => id.toString()) : [],
    };
  }

  async updateCatalog(companyId: string, deltas: IDeltas) {
    const company = await this._companyRepository.findById(companyId);
    if (!company) throw new NotFoundError('Company not found');

    if (deltas.addProductIds?.length) {
      const found = await this._productRepository.findByIds(deltas.addProductIds);
      const validIds = new Set(
        found.filter(p => p.isActive && p.visibility === 'public').map(p => p._id.toString()),
      );
      const invalid = deltas.addProductIds.filter(id => !validIds.has(id));
      if (invalid.length) throw new BadRequestError(`Cannot whitelist non-public or unknown products: ${invalid.join(', ')}`);
    }

    const doc = await this._catalogRepository.applyDeltas(companyId, deltas);
    return {
      companyId,
      productIds: doc.productIds.map(id => id.toString()),
      categoryIds: doc.categoryIds.map(id => id.toString()),
    };
  }
}

export default new CompanyCatalogService(
  new CompanyCatalogRepository(),
  new CompanyRepository(),
  new ProductRepository(),
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest companyCatalog.service -v`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/companyCatalog.service.ts src/__tests__/services/companyCatalog.service.test.ts
git commit -m "feat : add company catalog whitelist service"
```

---

## Task 7: employee.catalog.service — list + detail

**Files:**
- Create: `src/services/employee.catalog.service.ts`
- Test: `src/__tests__/services/employee.catalog.service.list.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/services/employee.catalog.service.list.test.ts
const catalogRepo = { findByCompanyId: jest.fn() };
const productRepo = {
  findEmployeeCatalog: jest.fn(),
  findEmployeeProductBySlug: jest.fn(),
};
const variantRepo = {
  getMinPriceByProductIds: jest.fn().mockResolvedValue([]),
  findByProductId: jest.fn().mockResolvedValue([]),
  findDistinctProductIdsByFilters: jest.fn(),
};
jest.mock('../../repository/companyCatalog.repository', () => ({
  __esModule: true,
  CompanyCatalogRepository: jest.fn().mockImplementation(() => catalogRepo),
}));
jest.mock('../../repository/product.repository', () => ({
  __esModule: true,
  ProductRepository: jest.fn().mockImplementation(() => productRepo),
}));
jest.mock('../../repository/productVariant.repository', () => ({
  __esModule: true,
  ProductVariantRepository: jest.fn().mockImplementation(() => variantRepo),
}));

import employeeCatalogService from '../../services/employee.catalog.service';
import { NotFoundError } from '../../errors/not-found.error';

describe('employee.catalog.service list + detail', () => {
  beforeEach(() => jest.clearAllMocks());

  it('lists scoped products using the company whitelist', async () => {
    catalogRepo.findByCompanyId.mockResolvedValue({ productIds: [{ toString: () => 'p1' }], categoryIds: [] });
    productRepo.findEmployeeCatalog.mockResolvedValue({ docs: [{ _id: { toString: () => 'p1' }, name: 'Mug', slug: 'mug', images: [], badge: null, rating: 0, totalReviews: 0, category: 'cat1', isFeatured: false }], total: 1 });
    const out = await employeeCatalogService.listProducts('c1', {});
    expect(productRepo.findEmployeeCatalog).toHaveBeenCalledWith(
      expect.objectContaining({ scope: expect.objectContaining({ companyId: 'c1', productIds: ['p1'], categoryIds: [] }) }),
    );
    expect(out.products).toHaveLength(1);
    expect(out.pagination.total).toBe(1);
  });

  it('returns an empty scope when the company has no catalog doc', async () => {
    catalogRepo.findByCompanyId.mockResolvedValue(null);
    productRepo.findEmployeeCatalog.mockResolvedValue({ docs: [], total: 0 });
    const out = await employeeCatalogService.listProducts('c1', {});
    expect(productRepo.findEmployeeCatalog).toHaveBeenCalledWith(
      expect.objectContaining({ scope: { companyId: 'c1', productIds: [], categoryIds: [] } }),
    );
    expect(out.products).toEqual([]);
  });

  it('throws NotFound for an out-of-scope product slug', async () => {
    catalogRepo.findByCompanyId.mockResolvedValue({ productIds: [], categoryIds: [] });
    productRepo.findEmployeeProductBySlug.mockResolvedValue(null);
    await expect(employeeCatalogService.getProductBySlug('c1', 'secret')).rejects.toBeInstanceOf(NotFoundError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest employee.catalog.service.list -v`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement the service (list + detail + scope helper)**

```ts
// src/services/employee.catalog.service.ts
import { NotFoundError } from '../errors/not-found.error';
import { CompanyCatalogRepository } from '../repository/companyCatalog.repository';
import { ProductRepository, IEmployeeScope, IProductSort } from '../repository/product.repository';
import { ProductVariantRepository } from '../repository/productVariant.repository';

const summarize = (p: { _id: unknown; name: string; slug: string; images: string[]; badge: unknown; rating: number; totalReviews: number }, price?: { minPrice: number; originalMinPrice: number }) => ({
  _id: p._id,
  name: p.name,
  slug: p.slug,
  images: p.images,
  badge: p.badge,
  rating: p.rating,
  totalReviews: p.totalReviews,
  minPrice: price?.minPrice ?? 0,
  originalMinPrice: price?.originalMinPrice ?? 0,
});

class EmployeeCatalogService {
  constructor(
    private readonly _catalogRepository: CompanyCatalogRepository,
    private readonly _productRepository: ProductRepository,
    private readonly _variantRepository: ProductVariantRepository,
  ) {}

  private async _scope(companyId: string): Promise<IEmployeeScope> {
    const doc = await this._catalogRepository.findByCompanyId(companyId);
    return {
      companyId,
      productIds: doc ? doc.productIds.map(id => id.toString()) : [],
      categoryIds: doc ? doc.categoryIds.map(id => id.toString()) : [],
    };
  }

  private async _withPrices<T extends { _id: { toString(): string }; name: string; slug: string; images: string[]; badge: unknown; rating: number; totalReviews: number }>(docs: T[]) {
    const ids = docs.map(d => d._id.toString());
    const priceMaps = await this._variantRepository.getMinPriceByProductIds(ids);
    const priceById = new Map(priceMaps.map(p => [p._id.toString(), p]));
    return docs.map(d => summarize(d, priceById.get(d._id.toString())));
  }

  async listProducts(companyId: string, query: { category?: string; sort?: string; page?: number; limit?: number }) {
    const scope = await this._scope(companyId);
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 12));

    const sort: IProductSort =
      query.sort === 'newest' ? { field: 'createdAt', direction: -1 } : { field: 'rating', direction: -1 };

    const { docs, total } = await this._productRepository.findEmployeeCatalog({
      scope,
      categoryId: query.category,
      sort,
      skip: (page - 1) * limit,
      limit,
    });

    const products = await this._withPrices(docs);
    return { products, pagination: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  async getProductBySlug(companyId: string, slug: string) {
    const scope = await this._scope(companyId);
    const product = await this._productRepository.findEmployeeProductBySlug(scope, slug);
    if (!product) throw new NotFoundError('Product not found');

    const variants = await this._variantRepository.findByProductId(product._id.toString(), true);
    return { product, variants };
  }
}

export default new EmployeeCatalogService(
  new CompanyCatalogRepository(),
  new ProductRepository(),
  new ProductVariantRepository(),
);
```

> Price/sort logic mirrors the public `product.service`. Attribute/price filtering (via `findDistinctProductIdsByFilters` + `restrictToProductIds`) is intentionally not wired in this first cut — list supports category + sort + pagination; richer filters can extend `findEmployeeCatalog`'s `restrictToProductIds` later without interface change.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest employee.catalog.service.list -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/employee.catalog.service.ts src/__tests__/services/employee.catalog.service.list.test.ts
git commit -m "feat : add employee catalog service list and detail"
```

---

## Task 8: employee.catalog.service — search, related, recently-viewed

**Files:**
- Modify: `src/services/employee.catalog.service.ts`
- Test: `src/__tests__/services/employee.catalog.service.more.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/services/employee.catalog.service.more.test.ts
const catalogRepo = { findByCompanyId: jest.fn().mockResolvedValue({ productIds: [], categoryIds: [] }) };
const productRepo = {
  searchEmployeeCatalog: jest.fn().mockResolvedValue({ docs: [], total: 0 }),
  findEmployeeProductBySlug: jest.fn(),
  findEmployeeRelated: jest.fn().mockResolvedValue([]),
  findEmployeeByIds: jest.fn().mockResolvedValue([]),
};
const variantRepo = { getMinPriceByProductIds: jest.fn().mockResolvedValue([]) };
const recentlyViewedUser = { get: jest.fn() };
jest.mock('../../repository/companyCatalog.repository', () => ({
  __esModule: true,
  CompanyCatalogRepository: jest.fn().mockImplementation(() => catalogRepo),
}));
jest.mock('../../repository/product.repository', () => ({
  __esModule: true,
  ProductRepository: jest.fn().mockImplementation(() => productRepo),
}));
jest.mock('../../repository/productVariant.repository', () => ({
  __esModule: true,
  ProductVariantRepository: jest.fn().mockImplementation(() => variantRepo),
}));
jest.mock('../../services/cache/entities', () => ({
  __esModule: true,
  recentlyViewedUserCacheManager: { get: (...a: unknown[]) => recentlyViewedUser.get(...a), set: jest.fn() },
}));

import employeeCatalogService from '../../services/employee.catalog.service';

describe('employee.catalog.service search/related/recently-viewed', () => {
  beforeEach(() => jest.clearAllMocks());

  it('search delegates to the scoped repo method', async () => {
    const out = await employeeCatalogService.searchProducts('c1', 'mug', 1, 12);
    expect(productRepo.searchEmployeeCatalog).toHaveBeenCalled();
    expect(out.products).toEqual([]);
  });

  it('related returns [] when the slug is out of scope', async () => {
    productRepo.findEmployeeProductBySlug.mockResolvedValue(null);
    const out = await employeeCatalogService.getRelated('c1', 'secret', 6);
    expect(out).toEqual([]);
    expect(productRepo.findEmployeeRelated).not.toHaveBeenCalled();
  });

  it('recently-viewed filters stored ids through the company scope', async () => {
    recentlyViewedUser.get.mockResolvedValue(['p1', 'p2']);
    productRepo.findEmployeeByIds.mockResolvedValue([{ _id: { toString: () => 'p1' }, name: 'Mug', slug: 'mug', images: [], badge: null, rating: 0, totalReviews: 0 }]);
    const out = await employeeCatalogService.getRecentlyViewed('c1', 'u1');
    expect(productRepo.findEmployeeByIds).toHaveBeenCalledWith(expect.objectContaining({ companyId: 'c1' }), ['p1', 'p2']);
    expect(out.products).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest employee.catalog.service.more -v`
Expected: FAIL — methods not defined.

- [ ] **Step 3: Add the methods**

Add the import at the top of `src/services/employee.catalog.service.ts`:

```ts
import { recentlyViewedUserCacheManager } from './cache/entities';
```

Add these methods to the `EmployeeCatalogService` class:

```ts
  async searchProducts(companyId: string, query: string, page: number, limit: number) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(50, Math.max(1, limit));
    if (!query?.trim()) return { products: [], pagination: { total: 0, page: safePage, limit: safeLimit, pages: 0 } };

    const scope = await this._scope(companyId);
    const { docs, total } = await this._productRepository.searchEmployeeCatalog(scope, query.trim(), (safePage - 1) * safeLimit, safeLimit);
    const products = await this._withPrices(docs);
    return { products, pagination: { total, page: safePage, limit: safeLimit, pages: Math.ceil(total / safeLimit) } };
  }

  async getRelated(companyId: string, slug: string, limit = 6) {
    const scope = await this._scope(companyId);
    const product = await this._productRepository.findEmployeeProductBySlug(scope, slug);
    if (!product) return [];

    const related = await this._productRepository.findEmployeeRelated(scope, product._id.toString(), product.category.toString(), limit);
    return this._withPrices(related);
  }

  async getRecentlyViewed(companyId: string, userId: string) {
    const ids = (await recentlyViewedUserCacheManager.get({ userId })) ?? [];
    if (!ids.length) return { products: [] };

    const scope = await this._scope(companyId);
    const inScope = await this._productRepository.findEmployeeByIds(scope, ids);
    const byId = new Map(inScope.map(p => [p._id.toString(), p]));

    // Preserve recency order, drop out-of-scope ids.
    const ordered = ids.map(id => byId.get(id)).filter((p): p is NonNullable<typeof p> => !!p);
    const products = await this._withPrices(ordered);
    return { products };
  }
```

> Tracking a view reuses the existing public `recently-viewed` flow (the employee is a logged-in user, keyed by `userId`); the employee catalog only changes the **read** to filter through scope. The `POST /employee/catalog/products/:slug/view` route (Task 12) calls the existing `recentlyViewedService.trackView` — but note `trackView` uses the public `findBySlug` (public-only), so it will only record views of public products. Private-product view tracking is acceptable to omit in 2b (documented limitation); recently-viewed still works for whitelisted public products.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest employee.catalog.service.more -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/employee.catalog.service.ts src/__tests__/services/employee.catalog.service.more.test.ts
git commit -m "feat : add employee catalog search related and recently viewed"
```

---

## Task 9: isEmployee attaches req.companyId

**Files:**
- Modify: `src/middlewares/isEmployee.middleware.ts`
- Modify: `src/@types/custom.d.ts`
- Test: `src/__tests__/middlewares/is-employee.test.ts` (extend)

- [ ] **Step 1: Extend the test**

Add this case inside the existing `describe('isEmployee middleware', ...)` block in `src/__tests__/middlewares/is-employee.test.ts`:

```ts
  it('attaches companyId to the request for an active employee', async () => {
    findEmployeeById.mockResolvedValue({ _id: 'e1', accountType: 'employee', employeeStatus: 'active', companyId: 'c1' });
    companyFindById.mockResolvedValue({ _id: 'c1', status: 'active' });
    const req: { user: { _id: string }; companyId?: string } = { user: { _id: 'e1' } };
    await new Promise((resolve) => requireEmployee(req as never, {} as never, () => resolve(undefined)));
    expect(req.companyId).toBe('c1');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest is-employee -v`
Expected: FAIL — `req.companyId` is undefined.

- [ ] **Step 3: Add companyId to the Request type**

In `src/@types/custom.d.ts`, add inside the `Request` interface (after `sessionId: string,`):

```ts
    companyId?: string,
```

- [ ] **Step 4: Attach companyId in the middleware**

In `src/middlewares/isEmployee.middleware.ts`, after the company active check passes and before `return next()`, add the assignment:

```ts
    req.companyId = employee.companyId as string;
    return next();
```

(Replace the existing bare `return next();` at the end of the success path with the two lines above.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest is-employee -v`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/middlewares/isEmployee.middleware.ts src/@types/custom.d.ts src/__tests__/middlewares/is-employee.test.ts
git commit -m "feat : attach companyId to request in isEmployee guard"
```

---

## Task 10: Admin private-product support

**Files:**
- Modify: `src/services/catalog/product.service.ts`
- Modify: `src/controllers/admin.catalog.controller.ts`
- Modify: `src/middlewares/validators/catalog.validator.ts`
- Test: `src/__tests__/services/product.service.privateCreate.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/services/product.service.privateCreate.test.ts
const productRepo = { slugExists: jest.fn().mockResolvedValue(false), create: jest.fn().mockImplementation(async (p) => ({ _id: 'p1', ...p })) };
const variantRepo = {};
const categoryRepo = { findById: jest.fn().mockResolvedValue({ _id: 'cat1' }) };
const companyRepo = { findById: jest.fn() };
jest.mock('../../repository/product.repository', () => ({ __esModule: true, ProductRepository: jest.fn().mockImplementation(() => productRepo) }));
jest.mock('../../repository/productVariant.repository', () => ({ __esModule: true, ProductVariantRepository: jest.fn().mockImplementation(() => variantRepo) }));
jest.mock('../../repository/category.repository', () => ({ __esModule: true, CategoryRepository: jest.fn().mockImplementation(() => categoryRepo) }));
jest.mock('../../repository/company.repository', () => ({ __esModule: true, CompanyRepository: jest.fn().mockImplementation(() => companyRepo) }));
jest.mock('../../services/cache/entities', () => ({ __esModule: true, productListCacheManager: { flush: jest.fn() }, productDetailCacheManager: { remove: jest.fn() } }));

import productService from '../../services/catalog/product.service';
import { BadRequestError } from '../../errors/bad-request.error';

describe('product.service private product create', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates a company-private product when the owner company exists', async () => {
    companyRepo.findById.mockResolvedValue({ _id: 'co1' });
    const out = await productService.createProduct({ name: 'Secret', categoryId: 'cat1', visibility: 'company', ownerCompanyId: 'co1' } as never);
    expect(productRepo.create).toHaveBeenCalledWith(expect.objectContaining({ visibility: 'company', ownerCompanyId: 'co1' }));
    expect(out._id).toBe('p1');
  });

  it('rejects a company-private product without a valid owner company', async () => {
    companyRepo.findById.mockResolvedValue(null);
    await expect(productService.createProduct({ name: 'Secret', categoryId: 'cat1', visibility: 'company', ownerCompanyId: 'missing' } as never)).rejects.toBeInstanceOf(BadRequestError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest product.service.privateCreate -v`
Expected: FAIL — visibility/ownerCompanyId not handled (and `CompanyRepository` not injected).

- [ ] **Step 3: Extend product.service create/update**

In `src/services/catalog/product.service.ts`:

Add the import:

```ts
import { CompanyRepository } from '../../repository/company.repository';
```

Add a 4th constructor dependency:

```ts
  constructor(
    private readonly _productRepository: ProductRepository,
    private readonly _variantRepository: ProductVariantRepository,
    private readonly _categoryRepository: CategoryRepository,
    private readonly _companyRepository: CompanyRepository,
  ) {}
```

Update the singleton export at the bottom:

```ts
export default new ProductService(
  new ProductRepository(),
  new ProductVariantRepository(),
  new CategoryRepository(),
  new CompanyRepository(),
);
```

In `createProduct`, extend the params type with `visibility?: 'public' | 'company'; ownerCompanyId?: string;`, and add this validation + fields. After the existing category existence check (`const category = await this._categoryRepository.findById(params.categoryId); if (!category) ...`), add:

```ts
    const visibility = params.visibility ?? 'public';
    let ownerCompanyId: string | undefined;
    if (visibility === 'company') {
      if (!params.ownerCompanyId) throw new BadRequestError('ownerCompanyId is required for a company-private product');
      const owner = await this._companyRepository.findById(params.ownerCompanyId);
      if (!owner) throw new BadRequestError('Owner company not found');
      ownerCompanyId = params.ownerCompanyId;
    }
```

Then include `visibility` and `ownerCompanyId` in the `createParams` object passed to `this._productRepository.create(...)`:

```ts
      visibility,
      ownerCompanyId,
```

> `ICreateProductParams` in `product.repository.ts` must also accept the new fields. Add to that interface: `visibility?: 'public' | 'company'; ownerCompanyId?: string;`.

- [ ] **Step 4: Wire the admin controller**

In `src/controllers/admin.catalog.controller.ts`, update `createProduct` to read + pass the new fields:

```ts
export const createProduct = async (req: Request, _res: Response, next: NextFunction) => {
  const { name, slug, description, details, materials, shipping, categoryId, images, badge, isFeatured, visibility, ownerCompanyId } = req.body;
  const response = await productService.createProduct({ name, slug, description, details, materials, shipping, categoryId, images, badge, isFeatured, visibility, ownerCompanyId });
  next(response);
};
```

- [ ] **Step 5: Add validation**

In `src/middlewares/validators/catalog.validator.ts`, add to the `createProductValidator` array (before `...validateRequest`):

```ts
  check('visibility').optional().isIn(['public', 'company']).withMessage('Invalid visibility'),
  check('ownerCompanyId').if(check('visibility').equals('company')).isMongoId().withMessage('ownerCompanyId must be a valid id for a company-private product'),
```

- [ ] **Step 6: Run test + build**

Run: `npx jest product.service.privateCreate -v`
Expected: PASS (2 tests).
Run: `npm run build`
Expected: no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add src/services/catalog/product.service.ts src/controllers/admin.catalog.controller.ts src/middlewares/validators/catalog.validator.ts src/repository/product.repository.ts src/__tests__/services/product.service.privateCreate.test.ts
git commit -m "feat : support creating company-private products in admin catalog"
```

---

## Task 11: Admin whitelist controller + routes

**Files:**
- Create: `src/controllers/admin.companyCatalog.controller.ts`
- Modify: `src/middlewares/validators/company.validator.ts`
- Modify: `src/routes/admin.route.ts`
- Test: `src/__tests__/controllers/admin.companyCatalog.controller.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/controllers/admin.companyCatalog.controller.test.ts
const getCatalog = jest.fn();
const updateCatalog = jest.fn();
const listCompanyProducts = jest.fn();
jest.mock('../../services/companyCatalog.service', () => ({
  __esModule: true,
  default: { getCatalog: (...a: unknown[]) => getCatalog(...a), updateCatalog: (...a: unknown[]) => updateCatalog(...a) },
}));
jest.mock('../../services/catalog/product.service', () => ({
  __esModule: true,
  default: { listProducts: (...a: unknown[]) => listCompanyProducts(...a) },
}));

import { getCatalogHandler, updateCatalogHandler, listCompanyProductsHandler } from '../../controllers/admin.companyCatalog.controller';

const run = (handler: (req: unknown, res: unknown, next: (p: unknown) => void) => Promise<void>, req: unknown) =>
  new Promise((resolve) => handler(req, {}, (p) => resolve(p)));

describe('admin companyCatalog controller', () => {
  beforeEach(() => jest.clearAllMocks());

  it('getCatalogHandler passes the company id', async () => {
    getCatalog.mockResolvedValue({ companyId: 'c1', productIds: [], categoryIds: [] });
    const out = await run(getCatalogHandler as never, { params: { id: 'c1' } });
    expect(getCatalog).toHaveBeenCalledWith('c1');
    expect(out).toEqual({ companyId: 'c1', productIds: [], categoryIds: [] });
  });

  it('updateCatalogHandler passes id + deltas', async () => {
    updateCatalog.mockResolvedValue({ companyId: 'c1', productIds: ['p1'], categoryIds: [] });
    await run(updateCatalogHandler as never, { params: { id: 'c1' }, body: { addProductIds: ['p1'] } });
    expect(updateCatalog).toHaveBeenCalledWith('c1', expect.objectContaining({ addProductIds: ['p1'] }));
  });

  it('listCompanyProductsHandler filters by ownerCompanyId + company visibility', async () => {
    listCompanyProducts.mockResolvedValue({ products: [], pagination: { total: 0, page: 1, limit: 12, pages: 0 } });
    await run(listCompanyProductsHandler as never, { params: { id: 'c1' }, query: {} });
    expect(listCompanyProducts).toHaveBeenCalledWith(expect.objectContaining({ visibility: 'company', ownerCompanyId: 'c1' }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest admin.companyCatalog.controller -v`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement the controller**

```ts
// src/controllers/admin.companyCatalog.controller.ts
import { NextFunction, Request, Response } from 'express';
import companyCatalogService from '../services/companyCatalog.service';
import productService from '../services/catalog/product.service';

export const getCatalogHandler = async (req: Request, _res: Response, next: NextFunction) => {
  const response = await companyCatalogService.getCatalog(req.params.id);
  next(response);
};

export const updateCatalogHandler = async (req: Request, _res: Response, next: NextFunction) => {
  const { addProductIds, removeProductIds, addCategoryIds, removeCategoryIds } = req.body;
  const response = await companyCatalogService.updateCatalog(req.params.id, { addProductIds, removeProductIds, addCategoryIds, removeCategoryIds });
  next(response);
};

export const listCompanyProductsHandler = async (req: Request, _res: Response, next: NextFunction) => {
  const response = await productService.listProducts({ ...(req.query as Record<string, unknown>), visibility: 'company', ownerCompanyId: req.params.id });
  next(response);
};
```

> `listProducts` already threads `visibility`; it also now honors `ownerCompanyId` because Task 4 added it to `IProductFilter` and `findWithFilters`. The admin list is unpaginated-cached the same way the public list is — acceptable for admin use.

- [ ] **Step 4: Add whitelist validators**

In `src/middlewares/validators/company.validator.ts`, add:

```ts
export const updateCompanyCatalogValidator = [
  check('addProductIds').optional().isArray().withMessage('addProductIds must be an array'),
  check('addProductIds.*').optional().isMongoId(),
  check('removeProductIds').optional().isArray().withMessage('removeProductIds must be an array'),
  check('removeProductIds.*').optional().isMongoId(),
  check('addCategoryIds').optional().isArray().withMessage('addCategoryIds must be an array'),
  check('addCategoryIds.*').optional().isMongoId(),
  check('removeCategoryIds').optional().isArray().withMessage('removeCategoryIds must be an array'),
  check('removeCategoryIds.*').optional().isMongoId(),
  ...validateRequest,
];
```

(`check`, `validateRequest`, `isMongoId` are already imported in that file from Phase 2a.)

- [ ] **Step 5: Wire the admin routes**

In `src/routes/admin.route.ts`, add imports:

```ts
import {
  getCatalogHandler,
  updateCatalogHandler,
  listCompanyProductsHandler,
} from '../controllers/admin.companyCatalog.controller';
import { updateCompanyCatalogValidator } from '../middlewares/validators/company.validator';
```

Add routes in the Companies & Employees block (after the employee routes added in 2a):

```ts
adminRouter.get('/companies/:id/catalog', companyIdValidator, asyncHandler(getCatalogHandler));
adminRouter.patch('/companies/:id/catalog', companyIdValidator, updateCompanyCatalogValidator, asyncHandler(updateCatalogHandler));
adminRouter.get('/companies/:id/products', companyIdValidator, asyncHandler(listCompanyProductsHandler));
```

- [ ] **Step 6: Run test + build**

Run: `npx jest admin.companyCatalog.controller -v`
Expected: PASS (3 tests).
Run: `npm run build`
Expected: no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add src/controllers/admin.companyCatalog.controller.ts src/middlewares/validators/company.validator.ts src/routes/admin.route.ts src/__tests__/controllers/admin.companyCatalog.controller.test.ts
git commit -m "feat : add admin company catalog whitelist endpoints"
```

---

## Task 12: Employee catalog controller + route + mount

**Files:**
- Create: `src/controllers/employee.catalog.controller.ts`
- Create: `src/routes/employee.catalog.route.ts`
- Modify: `src/routes/v1.route.ts`
- Test: `src/__tests__/routes/employee.catalog.route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/routes/employee.catalog.route.test.ts
const listProducts = jest.fn();
jest.mock('../../services/employee.catalog.service', () => ({
  __esModule: true,
  default: {
    listProducts: (...a: unknown[]) => listProducts(...a),
    getProductBySlug: jest.fn(),
    searchProducts: jest.fn(),
    getRelated: jest.fn(),
    getRecentlyViewed: jest.fn(),
  },
}));
// Stub the guard: inject an active employee company id.
jest.mock('../../middlewares/isEmployee.middleware', () => ({
  __esModule: true,
  default: (req: { companyId?: string; user?: { _id: string } }, _res: unknown, next: () => void) => {
    req.companyId = 'c1';
    req.user = { _id: 'u1' };
    next();
  },
}));

import express from 'express';
import request from 'supertest';
import employeeCatalogRouter from '../../routes/employee.catalog.route';
import { globalHandler } from '../../middlewares/error-handler.middleware';

const app = express();
app.use(express.json());
app.use('/employee/catalog', employeeCatalogRouter);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((data: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => globalHandler(data as never, req, res as never, next));

describe('employee catalog routes', () => {
  beforeEach(() => jest.clearAllMocks());

  it('GET /employee/catalog/products returns the scoped list', async () => {
    listProducts.mockResolvedValue({ products: [], pagination: { total: 0, page: 1, limit: 12, pages: 0 } });
    const res = await request(app).get('/employee/catalog/products');
    expect(res.status).toBe(200);
    expect(listProducts).toHaveBeenCalledWith('c1', expect.any(Object));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest employee.catalog.route -v`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement the controller**

```ts
// src/controllers/employee.catalog.controller.ts
import { NextFunction, Request, Response } from 'express';
import employeeCatalogService from '../services/employee.catalog.service';
import recentlyViewedService from '../services/recently-viewed.service';

export const listProducts = async (req: Request, _res: Response, next: NextFunction) => {
  const response = await employeeCatalogService.listProducts(req.companyId as string, req.query as Record<string, unknown>);
  next(response);
};

export const getProduct = async (req: Request, _res: Response, next: NextFunction) => {
  const response = await employeeCatalogService.getProductBySlug(req.companyId as string, req.params.slug);
  next(response);
};

export const search = async (req: Request, _res: Response, next: NextFunction) => {
  const { q, page, limit } = req.query;
  const response = await employeeCatalogService.searchProducts(req.companyId as string, (q as string) ?? '', Number(page) || 1, Number(limit) || 12);
  next(response);
};

export const related = async (req: Request, _res: Response, next: NextFunction) => {
  const response = await employeeCatalogService.getRelated(req.companyId as string, req.params.slug);
  next(response);
};

export const trackView = async (req: Request, _res: Response, next: NextFunction) => {
  await recentlyViewedService.trackView({ userId: req.user._id, sessionId: req.sessionId }, req.params.slug);
  next({ tracked: true });
};

export const recentlyViewed = async (req: Request, _res: Response, next: NextFunction) => {
  const response = await employeeCatalogService.getRecentlyViewed(req.companyId as string, req.user._id);
  next(response);
};
```

> `req.sessionId` may be undefined on employee routes (no cart-session middleware); `trackView` only uses `sessionId` for guests, and here `userId` is always set, so the user branch is taken.

- [ ] **Step 4: Implement the route**

```ts
// src/routes/employee.catalog.route.ts
import { Router } from 'express';
import { asyncHandler } from '../utils/asynchandler';
import requireEmployee from '../middlewares/isEmployee.middleware';
import {
  listProducts,
  getProduct,
  search,
  related,
  trackView,
  recentlyViewed,
} from '../controllers/employee.catalog.controller';

const employeeCatalogRouter = Router();

employeeCatalogRouter.use(requireEmployee);

employeeCatalogRouter.get('/search', asyncHandler(search));
employeeCatalogRouter.get('/recently-viewed', asyncHandler(recentlyViewed));
employeeCatalogRouter.get('/products', asyncHandler(listProducts));
employeeCatalogRouter.get('/products/:slug', asyncHandler(getProduct));
employeeCatalogRouter.get('/products/:slug/related', asyncHandler(related));
employeeCatalogRouter.post('/products/:slug/view', asyncHandler(trackView));

export default employeeCatalogRouter;
```

> `/search` and `/recently-viewed` are registered before `/products/:slug` so they aren't captured as a slug.

- [ ] **Step 5: Mount in v1.route.ts**

In `src/routes/v1.route.ts`, add the import and mount (after the `/employee/auth` mount from 2a):

```ts
import employeeCatalogRouter from './employee.catalog.route';
```

```ts
v1Router.use('/employee/catalog', employeeCatalogRouter);
```

- [ ] **Step 6: Run test + build**

Run: `npx jest employee.catalog.route -v`
Expected: PASS (1 test).
Run: `npm run build`
Expected: no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add src/controllers/employee.catalog.controller.ts src/routes/employee.catalog.route.ts src/routes/v1.route.ts src/__tests__/routes/employee.catalog.route.test.ts
git commit -m "feat : add employee catalog routes"
```

---

## Task 13: Docs + full verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Document in README**

Append to `README.md`:

```markdown
## Company catalog (Phase 2b)

Each company has a private catalog = admin-whitelisted public products/categories
(`PATCH /admin/companies/:id/catalog` with add/remove id deltas) plus the company's own private
products (created via the admin catalog with `visibility: "company"` + `ownerCompanyId`). Category
grants are live (future products in a granted category appear automatically). Employees browse it at
the `isEmployee`-guarded `/employee/catalog/*` routes (list, detail, search, related, recently-viewed).
Company-private products never appear in the public `/catalog/*` reads.
```

- [ ] **Step 2: Run the full suite**

Run: `npm test`
Expected: all suites pass (Phase 2a tests + the new 2b tests).

- [ ] **Step 3: Build + lint**

Run: `npm run build`
Expected: no TypeScript errors.
Run: `npm run lint:fix`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs : document company catalog visibility"
```

---

## After all tasks

- Dispatch a final code reviewer (superpowers:requesting-code-review) over the branch diff.
- Address Critical/Important findings.
- Use superpowers:finishing-a-development-branch.

---

## Self-review (against the spec)

**Spec coverage:**
- Product `visibility`/`ownerCompanyId` → Task 1. ✓
- `companyCatalog` model + repo → Tasks 2, 3. ✓
- Employee visibility predicate (§4.1) → Task 5 (`_employeePredicate`). ✓
- Public-catalog correctness change (§4.2, narrow to `visibility:'public'`, admin unaffected) → Task 4. ✓
- Admin whitelist get/PATCH deltas + validation → Tasks 6, 11. ✓
- Company-private product create (owner validation) → Task 10. ✓
- Employee catalog list/detail/search/related/recently-viewed → Tasks 7, 8, 12. ✓
- `isEmployee` attaches `req.companyId` → Task 9. ✓
- Out-of-scope slug → `NotFound` (404) → Tasks 7, 8. ✓
- No employee-catalog caching → reads compute fresh (no cache manager used in `employee.catalog.service`). ✓
- Routes guarded by `isEmployee`; admin behind `isAdmin` → Tasks 11, 12. ✓
- Deferred (wallet, ordering, featured/bestsellers, view-tracking of private products) noted. ✓

**Placeholder scan:** No TBD/TODO; every code step has full code. The two documented limitations (richer attribute filters on employee list; private-product view tracking) are explicit, scoped decisions, not placeholders.

**Type consistency:** `IEmployeeScope` (Task 5) is consumed by `employee.catalog.service` (Tasks 7–8) with matching shape `{ companyId, productIds, categoryIds }`. `findEmployeeCatalog`/`findEmployeeProductBySlug`/`searchEmployeeCatalog`/`findEmployeeRelated`/`findEmployeeByIds` signatures (Task 5) match their service callers. `IProductFilter.visibility`/`ownerCompanyId` (Task 4) match `listProducts`/admin-list usage (Tasks 4, 11) and `ICreateProductParams` additions (Task 10). `companyCatalogService.getCatalog`/`updateCatalog` (Task 6) match the controller (Task 11). `req.companyId` (Task 9 `@types`) matches employee controllers (Task 12).
```
