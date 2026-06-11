import config from '../../config';

describe('cart qty cap config', () => {
  it('exposes a configurable per-item cap defaulting high enough for B2B', () => {
    expect(config.MAX_CART_QTY_PER_ITEM).toBeGreaterThanOrEqual(1000);
  });
});
