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
