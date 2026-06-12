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
