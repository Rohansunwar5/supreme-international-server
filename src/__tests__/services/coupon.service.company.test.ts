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
