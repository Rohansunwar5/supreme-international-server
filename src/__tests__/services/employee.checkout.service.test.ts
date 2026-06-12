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

const VID = '64b8f0000000000000000011';
const PID = '64b8f0000000000000000022';
const cartItem = (over: Record<string, unknown> = {}) => ({
  variantId: VID, productId: PID, productName: 'Mug', productSlug: 'mug', sku: 'S1', image: '',
  attributeLabels: [], priceSnapshot: 100, originalPriceSnapshot: 100, qty: 2, ...over,
});
const liveVariant = (over: Record<string, unknown> = {}) => ({ _id: { toString: () => VID }, isActive: true, stock: 10, price: 100, originalPrice: 100, ...over });
const inScope = [{ _id: { toString: () => PID } }];
const address = { fullName: 'E', phone: '9', line1: 'a', line2: '', city: 'b', state: 'c', pincode: '1', country: 'India' };

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
    productRepo.findEmployeeByIds.mockResolvedValue([]);
    await expect(employeeCheckoutService.checkout('e1', 'co1', { shippingAddress: address }))
      .rejects.toBeInstanceOf(BadRequestError);
  });

  it('rejects insufficient stock', async () => {
    variantRepo.findByIds.mockResolvedValue([liveVariant({ stock: 1 })]);
    await expect(employeeCheckoutService.checkout('e1', 'co1', { shippingAddress: address }))
      .rejects.toBeInstanceOf(BadRequestError);
  });

  it('fully wallet-paid order: reserves wallet, confirms, no razorpay, decrements stock, clears cart', async () => {
    walletSvc.getWallet.mockResolvedValue({ balance: 1000, currency: 'INR' });
    walletSvc.debit.mockResolvedValue({ balance: 800, currency: 'INR' });

    const out = await employeeCheckoutService.checkout('e1', 'co1', { shippingAddress: address });

    expect(walletSvc.debit).toHaveBeenCalledWith('e1', 'co1', 200, expect.any(String), undefined, expect.objectContaining({ source: 'order_redemption' }));
    expect(razorpay.createRazorpayOrder).not.toHaveBeenCalled();
    expect(orderRepo.create).toHaveBeenCalledWith(expect.objectContaining({ orderType: 'employee', walletApplied: 200, status: 'confirmed', payment: expect.objectContaining({ gateway: 'wallet', status: 'paid' }) }));
    expect(variantRepo.adjustStock).toHaveBeenCalledWith(VID, -2);
    expect(cartRepo.clearItems).toHaveBeenCalledWith('e1');
    expect(out.fullyPaidByWallet).toBe(true);
    expect(out.remainder).toBe(0);
  });

  it('split order: reserves partial wallet + creates razorpay for the remainder, stays pending', async () => {
    walletSvc.getWallet.mockResolvedValue({ balance: 50, currency: 'INR' });
    walletSvc.debit.mockResolvedValue({ balance: 0, currency: 'INR' });
    razorpay.createRazorpayOrder.mockResolvedValue({ id: 'rp_99' });

    const out = await employeeCheckoutService.checkout('e1', 'co1', { shippingAddress: address });

    expect(walletSvc.debit).toHaveBeenCalledWith('e1', 'co1', 50, expect.any(String), undefined, expect.objectContaining({ source: 'order_redemption' }));
    expect(razorpay.createRazorpayOrder).toHaveBeenCalledWith(expect.objectContaining({ amountInPaise: 15000 }));
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

  it('reverses the wallet reservation if order persistence fails', async () => {
    walletSvc.getWallet.mockResolvedValue({ balance: 1000, currency: 'INR' });
    walletSvc.debit.mockResolvedValue({ balance: 800, currency: 'INR' });
    orderRepo.create.mockRejectedValue(new Error('db down'));

    await expect(employeeCheckoutService.checkout('e1', 'co1', { shippingAddress: address }))
      .rejects.toThrow('db down');
    expect(walletSvc.credit).toHaveBeenCalledWith('e1', 'co1', 200, expect.any(String), undefined, expect.objectContaining({ source: 'refund', referenceId: expect.any(String) }));
  });
});
