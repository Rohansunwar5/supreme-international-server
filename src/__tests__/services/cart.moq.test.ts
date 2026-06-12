const guestGet = jest.fn();
jest.mock('../../services/cache/entities', () => ({
  __esModule: true,
  guestCartCacheManager: {
    get: (...a: unknown[]) => guestGet(...a),
    set: jest.fn(),
    remove: jest.fn(),
  },
}));

const findByIds = jest.fn();
jest.mock('../../repository/productVariant.repository', () => ({
  __esModule: true,
  ProductVariantRepository: jest.fn().mockImplementation(() => ({ findByIds: (...a: unknown[]) => findByIds(...a) })),
}));
jest.mock('../../repository/cart.repository', () => ({
  __esModule: true,
  CartRepository: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../../repository/product.repository', () => ({
  __esModule: true,
  ProductRepository: jest.fn().mockImplementation(() => ({})),
}));

import cartService from '../../services/cart.service';

const makeGuestItem = (variantId: string, qty: number) => ({
  variantId,
  productId: 'p1',
  productName: 'Mug',
  productSlug: 'mug',
  sku: 'M-1',
  image: '',
  attributeLabels: ['Red'],
  priceSnapshot: 100,
  originalPriceSnapshot: 120,
  qty,
});

describe('cart MOQ surfacing', () => {
  beforeEach(() => jest.clearAllMocks());

  it('flags an item below its variant MOQ and sets hasMoqViolations', async () => {
    guestGet.mockResolvedValue({ items: [makeGuestItem('v1', 10)], coupon: null });
    findByIds.mockResolvedValue([{ _id: { toString: () => 'v1' }, price: 100, moq: 50 }]);

    const res = await cartService.getCart({ sessionId: 's1' });

    expect(res.items[0].moq).toBe(50);
    expect(res.items[0].belowMoq).toBe(true);
    expect(res.hasMoqViolations).toBe(true);
  });

  it('does not flag an item that meets its variant MOQ', async () => {
    guestGet.mockResolvedValue({ items: [makeGuestItem('v1', 100)], coupon: null });
    findByIds.mockResolvedValue([{ _id: { toString: () => 'v1' }, price: 100, moq: 50 }]);

    const res = await cartService.getCart({ sessionId: 's1' });

    expect(res.items[0].moq).toBe(50);
    expect(res.items[0].belowMoq).toBe(false);
    expect(res.hasMoqViolations).toBe(false);
  });

  it('falls back to moq 1 (no violation) when the variant is no longer available', async () => {
    guestGet.mockResolvedValue({ items: [makeGuestItem('gone', 1)], coupon: null });
    findByIds.mockResolvedValue([]);

    const res = await cartService.getCart({ sessionId: 's1' });

    expect(res.items[0].moq).toBe(1);
    expect(res.items[0].belowMoq).toBe(false);
    expect(res.hasMoqViolations).toBe(false);
  });
});
