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
