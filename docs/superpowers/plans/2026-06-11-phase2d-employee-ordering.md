# Phase 2d — Employee Ordering (Wallet + Razorpay) & Company Coupons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an employee check out their cart as a real order settled by auto-applied wallet credits + Razorpay for the remainder, with company-scoped coupons.

**Architecture:** A dedicated `employee.checkout.service` re-validates catalog scope, re-prices, applies a company coupon, reserves wallet credits (2c `debit` with `source:'order_redemption'`), and either confirms a wallet-only order immediately or creates a Razorpay order for the remainder (confirmed by the existing webhook). Cancel + `payment.failed` refund the reserved credits. Employees reuse the existing `/cart` and `/orders` routes; only checkout is new.

**Tech Stack:** Express, TypeScript, Mongoose, Razorpay, Jest + supertest.

**Spec:** `docs/superpowers/specs/2026-06-11-phase2d-employee-ordering-design.md`

**Note on a spec simplification:** the spec mentioned an `order.walletLedgerId`; this plan omits it — refunds reference the order via `walletApplied` + `referenceId=orderId`, so the original ledger entry id is not needed and 2c's wallet service is left untouched.

---

## File structure

**Create:**
- `src/services/employee.checkout.service.ts`
- `src/controllers/employee.checkout.controller.ts`
- `src/routes/employee.checkout.route.ts`
- Test files per task.

**Modify:**
- `src/models/coupon.model.ts` — optional `companyId`.
- `src/repository/coupon.repository.ts` — `companyId` in `ICreateCouponParams`.
- `src/services/coupon.service.ts` — company-scope enforcement in `validateAndComputeDiscount`.
- `src/middlewares/validators/coupon.validator.ts` — optional `companyId`.
- `src/models/order.model.ts` — employee fields + make `razorpayOrderId` optional.
- `src/repository/order.repository.ts` — employee fields in `ICreateOrderParams`.
- `src/services/order.service.ts` — refund reserved wallet on cancel + `payment.failed`.
- `src/middlewares/validators/checkout.validator.ts` — employee checkout body validator.
- `src/routes/v1.route.ts` — mount `/employee/checkout`.
- `README.md`.

---

## Task 1: Coupon company scope (model + repository)

**Files:**
- Modify: `src/models/coupon.model.ts`
- Modify: `src/repository/coupon.repository.ts`
- Test: `src/__tests__/models/coupon.company.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/models/coupon.company.test.ts
import CouponModel from '../../models/coupon.model';

describe('Coupon companyId', () => {
  it('accepts an optional companyId', () => {
    const c = new CouponModel({ code: 'ACME10', type: 'percent', value: 10, startsAt: new Date(), createdBy: '64b8f0000000000000000001', companyId: '64b8f0000000000000000002' });
    expect(c.companyId?.toString()).toBe('64b8f0000000000000000002');
    expect(c.validateSync()).toBeUndefined();
  });

  it('defaults companyId to undefined (public coupon)', () => {
    const c = new CouponModel({ code: 'PUB10', type: 'flat', value: 50, startsAt: new Date(), createdBy: '64b8f0000000000000000001' });
    expect(c.companyId).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest models/coupon.company -v`
Expected: FAIL — `companyId` not a schema path.

- [ ] **Step 3: Add `companyId` to the model**

In `src/models/coupon.model.ts`, add to the `ICoupon` interface (after `createdBy`):
```ts
  companyId?: mongoose.Types.ObjectId;
```
And to the schema (after `createdBy`):
```ts
    companyId: { type: mongoose.Schema.Types.ObjectId, default: undefined },
```

- [ ] **Step 4: Add `companyId` to the repository create params**

In `src/repository/coupon.repository.ts`, add `companyId?: string;` to the `ICreateCouponParams` interface. (The repository's `create`/`update` pass the params object straight to the model, so no other change is needed — confirm `create` does `this._model.create(params)` and `update` does `findByIdAndUpdate(id, params)`.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest models/coupon.company -v`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/models/coupon.model.ts src/repository/coupon.repository.ts src/__tests__/models/coupon.company.test.ts
git commit -m "feat : add optional companyId to coupon"
```

---

## Task 2: Coupon service company-scope enforcement + validator

**Files:**
- Modify: `src/services/coupon.service.ts`
- Modify: `src/middlewares/validators/coupon.validator.ts`
- Test: `src/__tests__/services/coupon.service.company.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/services/coupon.service.company.test.ts
const couponRepo = { findByCode: jest.fn() };
const usageRepo = { countByUserAndCoupon: jest.fn().mockResolvedValue(0) };
const productRepo = { findByIds: jest.fn().mockResolvedValue([]) };
jest.mock('../../repository/coupon.repository', () => ({ __esModule: true, CouponRepository: jest.fn().mockImplementation(() => couponRepo) }));
jest.mock('../../repository/couponUsage.repository', () => ({ __esModule: true, CouponUsageRepository: jest.fn().mockImplementation(() => usageRepo) }));
jest.mock('../../repository/product.repository', () => ({ __esModule: true, ProductRepository: jest.fn().mockImplementation(() => productRepo) }));

import couponService from '../../services/coupon.service';
import { BadRequestError } from '../../errors/bad-request.error';

const activeCoupon = (extra: Record<string, unknown>) => ({
  _id: { toString: () => 'cp1' }, code: 'X', isActive: true, startsAt: new Date(Date.now() - 1000),
  expiresAt: null, minOrderValue: 0, usageLimit: 0, perUserLimit: 0, usedCount: 0,
  applicableProducts: [], applicableCategories: [], type: 'flat', value: 50, maxDiscountAmount: 0, ...extra,
});

describe('coupon.service company scope', () => {
  beforeEach(() => jest.clearAllMocks());

  it('accepts a company coupon for the matching company', async () => {
    couponRepo.findByCode.mockResolvedValue(activeCoupon({ companyId: { toString: () => 'co1' } }));
    const { discountAmount } = await couponService.validateAndComputeDiscount({ code: 'X', cartSubtotal: 500, cartItems: [], companyId: 'co1' });
    expect(discountAmount).toBe(50);
  });

  it('rejects a company coupon for a different company', async () => {
    couponRepo.findByCode.mockResolvedValue(activeCoupon({ companyId: { toString: () => 'co2' } }));
    await expect(couponService.validateAndComputeDiscount({ code: 'X', cartSubtotal: 500, cartItems: [], companyId: 'co1' }))
      .rejects.toBeInstanceOf(BadRequestError);
  });

  it('rejects a company coupon in standard (no companyId) checkout', async () => {
    couponRepo.findByCode.mockResolvedValue(activeCoupon({ companyId: { toString: () => 'co1' } }));
    await expect(couponService.validateAndComputeDiscount({ code: 'X', cartSubtotal: 500, cartItems: [] }))
      .rejects.toBeInstanceOf(BadRequestError);
  });

  it('rejects a public coupon in employee (companyId) checkout', async () => {
    couponRepo.findByCode.mockResolvedValue(activeCoupon({}));
    await expect(couponService.validateAndComputeDiscount({ code: 'X', cartSubtotal: 500, cartItems: [], companyId: 'co1' }))
      .rejects.toBeInstanceOf(BadRequestError);
  });

  it('accepts a public coupon in standard checkout', async () => {
    couponRepo.findByCode.mockResolvedValue(activeCoupon({}));
    const { discountAmount } = await couponService.validateAndComputeDiscount({ code: 'X', cartSubtotal: 500, cartItems: [] });
    expect(discountAmount).toBe(50);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest coupon.service.company -v`
Expected: FAIL — `companyId` not accepted / no scope enforcement.

- [ ] **Step 3: Add company scoping to the service**

In `src/services/coupon.service.ts`, add `companyId?: string;` to the `IValidateCouponParams` interface. Then inside `validateAndComputeDiscount`, immediately after the `if (!coupon || !coupon.isActive) ...` line, add:

```ts
    const couponCompanyId = coupon.companyId ? coupon.companyId.toString() : null;
    if (params.companyId) {
      // Employee checkout: only this company's coupons are valid.
      if (couponCompanyId !== params.companyId) throw new BadRequestError('This coupon is not valid for your company');
    } else if (couponCompanyId) {
      // Standard checkout: company-scoped coupons are not allowed.
      throw new BadRequestError('Invalid or inactive coupon code');
    }
```

- [ ] **Step 4: Add the validator field**

In `src/middlewares/validators/coupon.validator.ts`, add to BOTH `createCouponValidator` and `updateCouponValidator` (before their `...validateRequest`):
```ts
  check('companyId').optional().isMongoId().withMessage('companyId must be a valid id'),
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest coupon.service.company -v`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/services/coupon.service.ts src/middlewares/validators/coupon.validator.ts src/__tests__/services/coupon.service.company.test.ts
git commit -m "feat : enforce company scope on coupon validation"
```

---

## Task 3: Order model — employee fields + optional razorpayOrderId

**Files:**
- Modify: `src/models/order.model.ts`
- Test: `src/__tests__/models/order.employee.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/models/order.employee.test.ts
import OrderModel from '../../models/order.model';

const baseOrder = {
  orderId: 'SOV-TEST1234',
  customerEmail: 'e@x.com',
  items: [{ variantId: '64b8f0000000000000000001', productId: '64b8f0000000000000000002', sku: 'S1', productName: 'Mug', qty: 1, priceAtPurchase: 100, originalPriceAtPurchase: 100 }],
  shippingAddress: { fullName: 'E', phone: '9', line1: 'a', city: 'b', state: 'c', pincode: '1' },
  billing: { subtotal: 100, shippingCharge: 0, shippingTax: 0, total: 100 },
};

describe('Order employee fields', () => {
  it('defaults orderType to standard and walletApplied to 0', () => {
    const o = new OrderModel({ ...baseOrder, payment: { razorpayOrderId: 'rp_1' } });
    expect(o.orderType).toBe('standard');
    expect(o.walletApplied).toBe(0);
  });

  it('allows a wallet-only employee order with NO razorpayOrderId', () => {
    const o = new OrderModel({
      ...baseOrder,
      orderType: 'employee',
      employeeId: '64b8f0000000000000000003',
      companyId: '64b8f0000000000000000004',
      walletApplied: 100,
      payment: { gateway: 'wallet', status: 'paid' },
    });
    expect(o.validateSync()).toBeUndefined();
    expect(o.payment.razorpayOrderId ?? null).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest models/order.employee -v`
Expected: FAIL — `orderType` not a path AND the wallet-only order fails validation because `razorpayOrderId` is required.

- [ ] **Step 3: Modify the model**

In `src/models/order.model.ts`:

(a) In `IPayment`, change `razorpayOrderId` to allow null:
```ts
  razorpayOrderId: string | null;
```
(b) In the `paymentSchema`, change the `razorpayOrderId` line from `required: true` to:
```ts
    razorpayOrderId: { type: String, default: null },
```
(c) In `IOrder`, add (after `couponId`):
```ts
  employeeId?: mongoose.Types.ObjectId;
  companyId?: mongoose.Types.ObjectId;
  orderType: 'standard' | 'employee';
  walletApplied: number;
```
(d) In the order schema object (after the `couponId` field), add:
```ts
    employeeId: { type: mongoose.Schema.Types.ObjectId, default: undefined },
    companyId: { type: mongoose.Schema.Types.ObjectId, default: undefined },
    orderType: { type: String, enum: ['standard', 'employee'], default: 'standard' },
    walletApplied: { type: Number, default: 0, min: 0 },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest models/order.employee -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/models/order.model.ts src/__tests__/models/order.employee.test.ts
git commit -m "feat : add employee order fields and make razorpay order id optional"
```

---

## Task 4: Order repository — employee create params

**Files:**
- Modify: `src/repository/order.repository.ts`

(No direct test — covered via checkout service tests. Verify via `npm run build`.)

- [ ] **Step 1: Extend `ICreateOrderParams`**

In `src/repository/order.repository.ts`, add to the `ICreateOrderParams` interface (after `couponId`):
```ts
  employeeId?: string | null;
  companyId?: string | null;
  orderType?: 'standard' | 'employee';
  walletApplied?: number;
```
The `create` method already does `this._model.create(params)`, so the new fields pass through. No other change.

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/repository/order.repository.ts
git commit -m "feat : add employee fields to order create params"
```

---

## Task 5: employee.checkout.service

**Files:**
- Create: `src/services/employee.checkout.service.ts`
- Test: `src/__tests__/services/employee.checkout.service.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/services/employee.checkout.service.test.ts
const cartRepo = { findByUserId: jest.fn(), clearItems: jest.fn() };
const productRepo = { findEmployeeByIds: jest.fn() };
const variantRepo = { findByIds: jest.fn(), adjustStock: jest.fn() };
const catalogRepo = { findByCompanyId: jest.fn() };
const orderRepo = { create: jest.fn() };
const walletSvc = { getWallet: jest.fn(), debit: jest.fn(), credit: jest.fn() };
const couponSvc = { validateAndComputeDiscount: jest.fn() };
const razorpay = { createRazorpayOrder: jest.fn() };

jest.mock('../../repository/cart.repository', () => ({ __esModule: true, CartRepository: jest.fn().mockImplementation(() => cartRepo) }));
jest.mock('../../repository/product.repository', () => ({ __esModule: true, ProductRepository: jest.fn().mockImplementation(() => productRepo) }));
jest.mock('../../repository/productVariant.repository', () => ({ __esModule: true, ProductVariantRepository: jest.fn().mockImplementation(() => variantRepo) }));
jest.mock('../../repository/companyCatalog.repository', () => ({ __esModule: true, CompanyCatalogRepository: jest.fn().mockImplementation(() => catalogRepo) }));
jest.mock('../../repository/order.repository', () => ({ __esModule: true, OrderRepository: jest.fn().mockImplementation(() => orderRepo) }));
jest.mock('../../services/wallet.service', () => ({ __esModule: true, default: walletSvc }));
jest.mock('../../services/coupon.service', () => ({ __esModule: true, default: couponSvc }));
jest.mock('../../utils/razorpay.util', () => ({ __esModule: true, createRazorpayOrder: (...a: unknown[]) => razorpay.createRazorpayOrder(...a) }));
jest.mock('../../utils/flash-sale.util', () => ({ __esModule: true, getEffectivePrice: (v: { price: number; originalPrice: number }) => ({ price: v.price, originalPrice: v.originalPrice }) }));

import employeeCheckoutService from '../../services/employee.checkout.service';
import { BadRequestError } from '../../errors/bad-request.error';

const cartItem = (over: Record<string, unknown> = {}) => ({
  variantId: 'v1', productId: 'p1', productName: 'Mug', productSlug: 'mug', sku: 'S1', image: '',
  attributeLabels: [], priceSnapshot: 100, originalPriceSnapshot: 100, qty: 2, ...over,
});
const liveVariant = (over: Record<string, unknown> = {}) => ({ _id: { toString: () => 'v1' }, isActive: true, stock: 10, price: 100, originalPrice: 100, ...over });
const inScope = [{ _id: { toString: () => 'p1' } }];
const address = { fullName: 'E', phone: '9', line1: 'a', city: 'b', state: 'c', pincode: '1' };

describe('employee.checkout.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    cartRepo.findByUserId.mockResolvedValue({ items: [cartItem()] });
    productRepo.findEmployeeByIds.mockResolvedValue(inScope);
    variantRepo.findByIds.mockResolvedValue([liveVariant()]);
    catalogRepo.findByCompanyId.mockResolvedValue({ productIds: [{ toString: () => 'p1' }], categoryIds: [] });
    orderRepo.create.mockImplementation(async (o) => ({ _id: 'o1', ...o }));
  });

  it('rejects an out-of-scope cart item', async () => {
    productRepo.findEmployeeByIds.mockResolvedValue([]); // p1 not in scope
    await expect(employeeCheckoutService.checkout('e1', 'co1', { shippingAddress: address }))
      .rejects.toBeInstanceOf(BadRequestError);
  });

  it('rejects insufficient stock', async () => {
    variantRepo.findByIds.mockResolvedValue([liveVariant({ stock: 1 })]); // need 2
    await expect(employeeCheckoutService.checkout('e1', 'co1', { shippingAddress: address }))
      .rejects.toBeInstanceOf(BadRequestError);
  });

  it('fully wallet-paid order: reserves wallet, confirms, no razorpay, decrements stock, clears cart', async () => {
    walletSvc.getWallet.mockResolvedValue({ balance: 1000, currency: 'INR' });
    walletSvc.debit.mockResolvedValue({ balance: 800, currency: 'INR' });

    const out = await employeeCheckoutService.checkout('e1', 'co1', { shippingAddress: address });

    expect(walletSvc.debit).toHaveBeenCalledWith('e1', 'co1', 200, expect.any(String), undefined, expect.objectContaining({ source: 'order_redemption' }));
    expect(razorpay.createRazorpayOrder).not.toHaveBeenCalled();
    expect(orderRepo.create).toHaveBeenCalledWith(expect.objectContaining({ orderType: 'employee', walletApplied: 200, payment: expect.objectContaining({ gateway: 'wallet', status: 'paid' }) }));
    expect(variantRepo.adjustStock).toHaveBeenCalledWith('v1', -2);
    expect(cartRepo.clearItems).toHaveBeenCalledWith('e1');
    expect(out.fullyPaidByWallet).toBe(true);
    expect(out.remainder).toBe(0);
  });

  it('split order: reserves partial wallet + creates razorpay for the remainder, stays pending', async () => {
    walletSvc.getWallet.mockResolvedValue({ balance: 50, currency: 'INR' }); // total 200
    walletSvc.debit.mockResolvedValue({ balance: 0, currency: 'INR' });
    razorpay.createRazorpayOrder.mockResolvedValue({ id: 'rp_99' });

    const out = await employeeCheckoutService.checkout('e1', 'co1', { shippingAddress: address });

    expect(walletSvc.debit).toHaveBeenCalledWith('e1', 'co1', 50, expect.any(String), undefined, expect.objectContaining({ source: 'order_redemption' }));
    expect(razorpay.createRazorpayOrder).toHaveBeenCalledWith(expect.objectContaining({ amountInPaise: 15000 })); // 150 * 100
    expect(orderRepo.create).toHaveBeenCalledWith(expect.objectContaining({ walletApplied: 50, payment: expect.objectContaining({ gateway: 'razorpay', razorpayOrderId: 'rp_99', status: 'pending' }) }));
    expect(out.fullyPaidByWallet).toBe(false);
    expect(out.remainder).toBe(150);
    expect(out.razorpayOrderId).toBe('rp_99');
  });

  it('empty cart throws', async () => {
    cartRepo.findByUserId.mockResolvedValue({ items: [] });
    await expect(employeeCheckoutService.checkout('e1', 'co1', { shippingAddress: address }))
      .rejects.toBeInstanceOf(BadRequestError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest employee.checkout.service -v`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement the service**

```ts
// src/services/employee.checkout.service.ts
import { customAlphabet } from 'nanoid';
import mongoose from 'mongoose';
import { BadRequestError } from '../errors/bad-request.error';
import { CartRepository } from '../repository/cart.repository';
import { ProductRepository } from '../repository/product.repository';
import { ProductVariantRepository } from '../repository/productVariant.repository';
import { CompanyCatalogRepository } from '../repository/companyCatalog.repository';
import { OrderRepository } from '../repository/order.repository';
import walletService from './wallet.service';
import couponService from './coupon.service';
import { createRazorpayOrder } from '../utils/razorpay.util';
import { getEffectivePrice } from '../utils/flash-sale.util';
import { IOrderItem, IShippingAddress } from '../models/order.model';
import config from '../config';

const generateOrderId = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 8);

interface IEmployeeCheckoutBody {
  shippingAddress: IShippingAddress;
  couponCode?: string;
}

class EmployeeCheckoutService {
  constructor(
    private readonly _cartRepository: CartRepository,
    private readonly _productRepository: ProductRepository,
    private readonly _variantRepository: ProductVariantRepository,
    private readonly _catalogRepository: CompanyCatalogRepository,
    private readonly _orderRepository: OrderRepository,
  ) {}

  async checkout(employeeId: string, companyId: string, body: IEmployeeCheckoutBody) {
    const cart = await this._cartRepository.findByUserId(employeeId);
    const items = cart?.items ?? [];
    if (!items.length) throw new BadRequestError('Cart is empty');

    // 1. Scope re-validation: every cart product must be in the company catalog scope.
    const catalog = await this._catalogRepository.findByCompanyId(companyId);
    const scope = {
      companyId,
      productIds: catalog ? catalog.productIds.map(id => id.toString()) : [],
      categoryIds: catalog ? catalog.categoryIds.map(id => id.toString()) : [],
    };
    const cartProductIds = [...new Set(items.map(i => i.productId.toString()))];
    const inScope = await this._productRepository.findEmployeeByIds(scope, cartProductIds);
    const inScopeIds = new Set(inScope.map(p => p._id.toString()));
    if (cartProductIds.some(id => !inScopeIds.has(id))) {
      throw new BadRequestError('A product in your cart is not available in your company catalog');
    }

    // 2. Re-price + stock check at live variant prices.
    const variantIds = items.map(i => i.variantId.toString());
    const liveVariants = await this._variantRepository.findByIds(variantIds);
    const liveMap = new Map(liveVariants.map(v => [v._id.toString(), v]));

    const orderItems: IOrderItem[] = [];
    for (const item of items) {
      const live = liveMap.get(item.variantId.toString());
      if (!live || !live.isActive) throw new BadRequestError(`A product in your cart is no longer available.`);
      if (live.stock < item.qty) throw new BadRequestError(`Insufficient stock for "${item.productName}". Only ${live.stock} left.`);
      const eff = getEffectivePrice(live);
      orderItems.push({
        variantId: new mongoose.Types.ObjectId(item.variantId.toString()),
        productId: new mongoose.Types.ObjectId(item.productId.toString()),
        sku: item.sku,
        productName: item.productName,
        attributeLabels: item.attributeLabels,
        image: item.image,
        qty: item.qty,
        priceAtPurchase: eff.price,
        originalPriceAtPurchase: eff.originalPrice,
      });
    }

    const subtotal = orderItems.reduce((sum, i) => sum + i.priceAtPurchase * i.qty, 0);

    // 3. Company coupon (optional).
    let couponDiscount = 0;
    let couponCode: string | null = null;
    let couponId: string | null = null;
    if (body.couponCode) {
      const { coupon, discountAmount } = await couponService.validateAndComputeDiscount({
        code: body.couponCode,
        cartSubtotal: subtotal,
        cartItems: orderItems.map(i => ({ productId: i.productId.toString() })),
        userId: employeeId,
        companyId,
      });
      couponDiscount = discountAmount;
      couponCode = coupon.code;
      couponId = coupon._id.toString();
    }

    // 4. Shipping + tax + total (reuse the standard rules).
    const discountedSubtotal = subtotal - couponDiscount;
    const shippingCharge = discountedSubtotal >= config.FREE_SHIPPING_THRESHOLD ? 0 : config.STANDARD_SHIPPING_CHARGE;
    const shippingTax = Math.round(shippingCharge * config.SHIPPING_TAX_RATE);
    const total = discountedSubtotal + shippingCharge + shippingTax;

    // 5. Auto-apply wallet.
    const wallet = await walletService.getWallet(employeeId);
    const walletApplied = Math.min(wallet.balance, total);
    const remainder = total - walletApplied;

    const orderId = `SOV-${generateOrderId()}`;

    // 6. Reserve wallet (only if > 0). $gte guard => INSUFFICIENT_BALANCE on a concurrent drain.
    if (walletApplied > 0) {
      await walletService.debit(employeeId, companyId, walletApplied, `Order ${orderId}`, undefined, {
        source: 'order_redemption',
        referenceId: orderId,
      });
    }

    const billing = { subtotal, couponCode, couponDiscount, shippingCharge, shippingTax, total };
    const baseOrder = {
      orderId,
      userId: employeeId,
      customerEmail: body.shippingAddress.fullName ? `${employeeId}@employee.local` : `${employeeId}@employee.local`,
      sessionId: null,
      items: orderItems,
      shippingAddress: body.shippingAddress,
      billing,
      couponId,
      employeeId,
      companyId,
      orderType: 'employee' as const,
      walletApplied,
    };

    // 7. Branch on remainder.
    if (remainder === 0) {
      await this._orderRepository.create({
        ...baseOrder,
        payment: { gateway: 'wallet', razorpayOrderId: null, razorpayPaymentId: null, razorpaySignature: null, status: 'paid', method: 'wallet', paidAt: new Date() },
      });
      // Confirm immediately: decrement stock + clear cart (no webhook will arrive).
      await Promise.all(orderItems.map(i => this._variantRepository.adjustStock(i.variantId.toString(), -i.qty)));
      await this._cartRepository.clearItems(employeeId);
      return { orderId, walletApplied, remainder: 0, fullyPaidByWallet: true };
    }

    const razorpayOrder = await createRazorpayOrder({
      amountInPaise: Math.round(remainder * 100),
      receipt: orderId,
      notes: { orderId },
    });
    await this._orderRepository.create({
      ...baseOrder,
      payment: { gateway: 'razorpay', razorpayOrderId: razorpayOrder.id, razorpayPaymentId: null, razorpaySignature: null, status: 'pending', method: null, paidAt: null },
    });

    return {
      orderId,
      walletApplied,
      remainder,
      fullyPaidByWallet: false,
      razorpayOrderId: razorpayOrder.id,
      razorpayKeyId: config.RAZORPAY_KEY_ID,
      amountInPaise: Math.round(remainder * 100),
      currency: 'INR',
    };
  }
}

export default new EmployeeCheckoutService(
  new CartRepository(),
  new ProductRepository(),
  new ProductVariantRepository(),
  new CompanyCatalogRepository(),
  new OrderRepository(),
);
```

> The wallet-only branch sets `payment.status:'paid'` + `status:'confirmed'` (the order schema's `status` defaults to `pending`; pass `status: 'confirmed'` explicitly — add `status: 'confirmed'` to the `baseOrder` spread for the remainder===0 create). **Add `status: 'confirmed'` to the wallet-only `create` call.** (The split order keeps the default `pending`.)
> The `customerEmail` fallback above is a placeholder identity; if the employee `User` has a real email, the controller can pass it instead — see Task 7 note.

- [ ] **Step 4: Fix the wallet-only order status**

Ensure the `remainder === 0` `create` call includes `status: 'confirmed'`:
```ts
      await this._orderRepository.create({
        ...baseOrder,
        status: 'confirmed',
        payment: { gateway: 'wallet', razorpayOrderId: null, razorpayPaymentId: null, razorpaySignature: null, status: 'paid', method: 'wallet', paidAt: new Date() },
      });
```
(`ICreateOrderParams` does not currently list `status`; add `status?: OrderStatus;` to it in `src/repository/order.repository.ts` and import `OrderStatus` there if not already imported. The model defaults `status` to `pending` otherwise.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest employee.checkout.service -v`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/services/employee.checkout.service.ts src/repository/order.repository.ts src/__tests__/services/employee.checkout.service.test.ts
git commit -m "feat : add employee checkout service with wallet reservation and razorpay remainder"
```

---

## Task 6: Order service — refund reserved wallet on cancel + payment.failed

**Files:**
- Modify: `src/services/order.service.ts`
- Test: `src/__tests__/services/order.service.refund.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/services/order.service.refund.test.ts
const orderRepo = { findByOrderId: jest.fn(), markCancelled: jest.fn(), markPaymentFailed: jest.fn() };
const variantRepo = { adjustStock: jest.fn() };
const cartRepo = {};
const usageRepo = {};
const walletSvc = { credit: jest.fn() };
jest.mock('../../repository/order.repository', () => ({ __esModule: true, OrderRepository: jest.fn().mockImplementation(() => orderRepo) }));
jest.mock('../../repository/productVariant.repository', () => ({ __esModule: true, ProductVariantRepository: jest.fn().mockImplementation(() => variantRepo) }));
jest.mock('../../repository/cart.repository', () => ({ __esModule: true, CartRepository: jest.fn().mockImplementation(() => cartRepo) }));
jest.mock('../../repository/couponUsage.repository', () => ({ __esModule: true, CouponUsageRepository: jest.fn().mockImplementation(() => usageRepo) }));
jest.mock('../../services/wallet.service', () => ({ __esModule: true, default: walletSvc }));
jest.mock('../../services/coupon.service', () => ({ __esModule: true, default: { incrementUsage: jest.fn() } }));
jest.mock('../../services/mail.service', () => ({ __esModule: true, default: { sendOrderConfirmationEmail: jest.fn() } }));
jest.mock('../../utils/razorpay.util', () => ({ __esModule: true, verifyWebhookSignature: jest.fn().mockReturnValue(true) }));

import orderService from '../../services/order.service';

describe('order.service wallet refund', () => {
  beforeEach(() => jest.clearAllMocks());

  it('cancelOrder refunds reserved wallet for an employee order', async () => {
    orderRepo.findByOrderId.mockResolvedValue({
      orderId: 'SOV-1', userId: { toString: () => 'e1' }, status: 'pending',
      orderType: 'employee', walletApplied: 200, employeeId: { toString: () => 'e1' }, companyId: { toString: () => 'co1' }, items: [],
    });
    orderRepo.markCancelled.mockResolvedValue({ orderId: 'SOV-1' });
    await orderService.cancelOrder('SOV-1', 'e1');
    expect(walletSvc.credit).toHaveBeenCalledWith('e1', 'co1', 200, expect.any(String), undefined, expect.objectContaining({ source: 'refund', referenceId: 'SOV-1' }));
  });

  it('payment.failed webhook refunds reserved wallet for an employee order', async () => {
    orderRepo.markPaymentFailed.mockResolvedValue({
      orderId: 'SOV-2', orderType: 'employee', walletApplied: 50, employeeId: { toString: () => 'e1' }, companyId: { toString: () => 'co1' },
    });
    await orderService.processWebhook(Buffer.from('{}'), 'sig', { event: 'payment.failed', payload: { payment: { entity: { order_id: 'rp_1' } } } });
    expect(walletSvc.credit).toHaveBeenCalledWith('e1', 'co1', 50, expect.any(String), undefined, expect.objectContaining({ source: 'refund', referenceId: 'SOV-2' }));
  });

  it('cancelOrder does not refund a standard order', async () => {
    orderRepo.findByOrderId.mockResolvedValue({ orderId: 'SOV-3', userId: { toString: () => 'u1' }, status: 'pending', orderType: 'standard', walletApplied: 0, items: [] });
    orderRepo.markCancelled.mockResolvedValue({ orderId: 'SOV-3' });
    await orderService.cancelOrder('SOV-3', 'u1');
    expect(walletSvc.credit).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest order.service.refund -v`
Expected: FAIL — no refund wiring.

- [ ] **Step 3: Add the refund helper + wire it**

In `src/services/order.service.ts`:

(a) Add the import:
```ts
import walletService from './wallet.service';
```
(b) Add a private helper to the `OrderService` class:
```ts
  private async _refundReservedWallet(order: { orderId: string; orderType?: string; walletApplied?: number; employeeId?: { toString(): string } | null; companyId?: { toString(): string } | null }) {
    if (order.orderType !== 'employee' || !order.walletApplied || order.walletApplied <= 0) return;
    if (!order.employeeId || !order.companyId) return;
    await walletService.credit(
      order.employeeId.toString(),
      order.companyId.toString(),
      order.walletApplied,
      `Refund for order ${order.orderId}`,
      undefined,
      { source: 'refund', referenceId: order.orderId },
    );
  }
```
(c) In `cancelOrder`, after the stock-restore block (before `return cancelled;`), add:
```ts
    await this._refundReservedWallet(order);
```
(d) In `processWebhook`, in the `payment.failed` branch, replace:
```ts
      if (failedRazorpayOrderId) {
        await this._orderRepository.markPaymentFailed(failedRazorpayOrderId);
      }
```
with:
```ts
      if (failedRazorpayOrderId) {
        const failedOrder = await this._orderRepository.markPaymentFailed(failedRazorpayOrderId);
        if (failedOrder) await this._refundReservedWallet(failedOrder);
      }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest order.service.refund -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/order.service.ts src/__tests__/services/order.service.refund.test.ts
git commit -m "feat : refund reserved wallet on employee order cancel and payment failure"
```

---

## Task 7: Employee checkout controller + route + mount + validator

**Files:**
- Create: `src/controllers/employee.checkout.controller.ts`
- Create: `src/routes/employee.checkout.route.ts`
- Modify: `src/middlewares/validators/checkout.validator.ts`
- Modify: `src/routes/v1.route.ts`
- Test: `src/__tests__/routes/employee.checkout.route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/routes/employee.checkout.route.test.ts
const checkout = jest.fn();
jest.mock('../../services/employee.checkout.service', () => ({ __esModule: true, default: { checkout: (...a: unknown[]) => checkout(...a) } }));
jest.mock('../../middlewares/isEmployee.middleware', () => ({
  __esModule: true,
  default: (req: { user?: { _id: string }; companyId?: string }, _res: unknown, next: () => void) => {
    req.user = { _id: 'e1' };
    req.companyId = 'co1';
    next();
  },
}));

import express from 'express';
import request from 'supertest';
import employeeCheckoutRouter from '../../routes/employee.checkout.route';
import { globalHandler } from '../../middlewares/error-handler.middleware';

const app = express();
app.use(express.json());
app.use('/employee/checkout', employeeCheckoutRouter);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((data: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => globalHandler(data as never, req, res as never, next));

const address = { fullName: 'E', phone: '9999999999', line1: 'a', city: 'b', state: 'c', pincode: '560001' };

describe('employee checkout route', () => {
  beforeEach(() => jest.clearAllMocks());

  it('POST /employee/checkout passes employeeId, companyId, body to the service', async () => {
    checkout.mockResolvedValue({ orderId: 'SOV-1', walletApplied: 200, remainder: 0, fullyPaidByWallet: true });
    const res = await request(app).post('/employee/checkout').send({ shippingAddress: address });
    expect(res.status).toBe(200);
    expect(res.body.data.orderId).toBe('SOV-1');
    expect(checkout).toHaveBeenCalledWith('e1', 'co1', expect.objectContaining({ shippingAddress: expect.any(Object) }));
  });

  it('rejects a missing shipping address (422)', async () => {
    const res = await request(app).post('/employee/checkout').send({});
    expect(res.status).toBe(422);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest employee.checkout.route -v`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement the controller**

```ts
// src/controllers/employee.checkout.controller.ts
import { NextFunction, Request, Response } from 'express';
import employeeCheckoutService from '../services/employee.checkout.service';

export const employeeCheckout = async (req: Request, _res: Response, next: NextFunction) => {
  const { shippingAddress, couponCode } = req.body;
  const response = await employeeCheckoutService.checkout(req.user._id, req.companyId as string, { shippingAddress, couponCode });
  next(response);
};
```

- [ ] **Step 4: Add the validator**

In `src/middlewares/validators/checkout.validator.ts`, add a new export (reuse the same shipping-address checks the standard checkout validator uses — replicate them for the employee body):
```ts
export const employeeCheckoutValidator = [
  check('shippingAddress.fullName').isString().trim().notEmpty().withMessage('Shipping name is required'),
  check('shippingAddress.phone').isString().trim().notEmpty().withMessage('Shipping phone is required'),
  check('shippingAddress.line1').isString().trim().notEmpty().withMessage('Address line 1 is required'),
  check('shippingAddress.city').isString().trim().notEmpty().withMessage('City is required'),
  check('shippingAddress.state').isString().trim().notEmpty().withMessage('State is required'),
  check('shippingAddress.pincode').isString().trim().notEmpty().withMessage('Pincode is required'),
  check('couponCode').optional().isString(),
  ...validateRequest,
];
```
(Confirm `check` and `validateRequest` are already imported in this file; they are used by the existing validators there.)

- [ ] **Step 5: Implement the route**

```ts
// src/routes/employee.checkout.route.ts
import { Router } from 'express';
import { asyncHandler } from '../utils/asynchandler';
import requireEmployee from '../middlewares/isEmployee.middleware';
import { employeeCheckout } from '../controllers/employee.checkout.controller';
import { employeeCheckoutValidator } from '../middlewares/validators/checkout.validator';

const employeeCheckoutRouter = Router();

employeeCheckoutRouter.post('/', requireEmployee, employeeCheckoutValidator, asyncHandler(employeeCheckout));

export default employeeCheckoutRouter;
```

- [ ] **Step 6: Mount in v1.route.ts**

In `src/routes/v1.route.ts`, add the import:
```ts
import employeeCheckoutRouter from './employee.checkout.route';
```
And mount after the existing `v1Router.use('/employee/wallet', employeeWalletRouter);` line:
```ts
v1Router.use('/employee/checkout', employeeCheckoutRouter);
```

- [ ] **Step 7: Run test + build**

Run: `npx jest employee.checkout.route -v`
Expected: PASS (2 tests).
Run: `npm run build`
Expected: no TypeScript errors.

- [ ] **Step 8: Commit**

```bash
git add src/controllers/employee.checkout.controller.ts src/routes/employee.checkout.route.ts src/middlewares/validators/checkout.validator.ts src/routes/v1.route.ts src/__tests__/routes/employee.checkout.route.test.ts
git commit -m "feat : add employee checkout route"
```

---

## Task 8: Docs + full verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Document in README**

Append to `README.md`:

```markdown
## Employee ordering (Phase 2d)

Employees check out their cart at `POST /employee/checkout` (`isEmployee`). The service re-validates
every item is in the company catalog scope, re-prices, applies an optional **company-scoped** coupon
(`coupon.companyId`), then auto-applies wallet credits (`min(balance, total)`) and reserves them
(`order_redemption` debit). If credits cover the full total the order is confirmed immediately
(`payment.gateway:'wallet'`, stock decremented, cart cleared); otherwise a Razorpay order is created
for the remainder and confirmed by the existing `payment.captured` webhook. Cancelling the order or a
`payment.failed` webhook refunds the reserved credits. Employees view/cancel orders via the existing
`/orders/*` routes.
```

- [ ] **Step 2: Run the full suite**

Run: `npm test`
Expected: all suites pass (existing 107 + the new Phase 2d tests).

- [ ] **Step 3: Build + lint**

Run: `npm run build`
Expected: no TypeScript errors.
Run: `npm run lint:fix`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs : document employee ordering"
```

---

## After all tasks
- Final code review over the branch diff (focus: no overspend, refund correctness, wallet-only vs split stock timing, scope enforcement).
- Address Critical/Important findings.
- Use superpowers:finishing-a-development-branch to integrate.

---

## Self-review (against the spec)

**Spec coverage:**
- `coupon.companyId` + company-scope validation → Tasks 1, 2. ✓
- Standard checkout rejects company coupons; employee rejects public → Task 2. ✓
- `order` employee fields + `payment.gateway:'wallet'` + optional `razorpayOrderId` → Tasks 3, 4. ✓
- Scope re-validation at checkout → Task 5. ✓
- Re-price + stock → Task 5. ✓
- `walletApplied = min(balance,total)`, reserve via `order_redemption` debit → Task 5. ✓
- `remainder 0` → confirmed wallet order, stock decremented, cart cleared, no Razorpay → Task 5. ✓
- `remainder > 0` → Razorpay for remainder, pending, confirmed by existing webhook → Task 5. ✓
- `INSUFFICIENT_BALANCE` on concurrent drain → Task 5 (walletService.debit throws). ✓
- Refund on cancel + `payment.failed` → Task 6. ✓
- Employee checkout route behind `isEmployee`; orders/cancel reuse `/orders/*` → Task 7 (+ existing). ✓
- Admin company coupons via existing endpoints + `companyId` → Tasks 1, 2. ✓
- Tests (service + order refund + coupon scope + route) → Tasks 2, 5, 6, 7. ✓
- Deferred (TTL sweep, returns) NOT implemented. ✓

**Placeholder scan:** None. (Task 5 has an explicit Step 4 to add `status:'confirmed'` to the wallet-only create — intentional, with full code.)

**Type consistency:** `walletService.debit(employeeId, companyId, amount, reason, adminId?, opts?)` and `.credit(...)` and `.getWallet(employeeId)→{balance,currency}` match 2c. `couponService.validateAndComputeDiscount({ code, cartSubtotal, cartItems, userId?, companyId? })` matches Task 2's extension. `ProductRepository.findEmployeeByIds(scope, ids)` matches 2b. `OrderRepository.create(ICreateOrderParams)` extended in Task 4 (+ `status?`). `createRazorpayOrder({ amountInPaise, receipt, notes })` and `getEffectivePrice` match existing usage. `req.user._id` + `req.companyId` match `@types/custom.d.ts`. Order `IPayment.razorpayOrderId` widened to `string | null` in Task 3 and used consistently in Task 5.

**One flagged item:** Task 5's `customerEmail` uses a synthetic `<employeeId>@employee.local` placeholder since the checkout body doesn't carry the email. If the employee's real email should appear on the order/confirmation, the controller (Task 7) can load the employee and pass it; for 2d the synthetic value keeps the order valid without an extra lookup. Implementer may substitute the real email if trivial.
