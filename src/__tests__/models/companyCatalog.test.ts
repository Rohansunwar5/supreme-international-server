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
