const orderRepo = { findByOrderId: jest.fn(), markCancelled: jest.fn(), markPaymentFailed: jest.fn(), markWalletRefunded: jest.fn() };
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
    orderRepo.markWalletRefunded.mockResolvedValue({ orderId: 'SOV-1' }); // claim succeeds
    await orderService.cancelOrder('SOV-1', 'e1');
    expect(walletSvc.credit).toHaveBeenCalledWith('e1', 'co1', 200, expect.any(String), undefined, expect.objectContaining({ source: 'refund', referenceId: 'SOV-1' }));
  });

  it('does not double-credit when the wallet refund was already claimed', async () => {
    orderRepo.findByOrderId.mockResolvedValue({
      orderId: 'SOV-1', userId: { toString: () => 'e1' }, status: 'pending',
      orderType: 'employee', walletApplied: 200, employeeId: { toString: () => 'e1' }, companyId: { toString: () => 'co1' }, items: [],
    });
    orderRepo.markCancelled.mockResolvedValue({ orderId: 'SOV-1' });
    orderRepo.markWalletRefunded.mockResolvedValue(null); // already refunded by another path
    await orderService.cancelOrder('SOV-1', 'e1');
    expect(walletSvc.credit).not.toHaveBeenCalled();
  });

  it('payment.failed webhook refunds reserved wallet for an employee order', async () => {
    orderRepo.markPaymentFailed.mockResolvedValue({
      orderId: 'SOV-2', orderType: 'employee', walletApplied: 50, employeeId: { toString: () => 'e1' }, companyId: { toString: () => 'co1' },
    });
    orderRepo.markWalletRefunded.mockResolvedValue({ orderId: 'SOV-2' }); // claim succeeds
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
