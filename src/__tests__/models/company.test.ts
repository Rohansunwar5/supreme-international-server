import CompanyModel from '../../models/company.model';

describe('Company model', () => {
  it('defaults status to active and requires name', () => {
    const c = new CompanyModel({ name: 'Mercedes', slug: 'mercedes', createdBy: '64b8f0000000000000000001' });
    expect(c.status).toBe('active');
    const err = c.validateSync();
    expect(err).toBeUndefined();
  });

  it('rejects an invalid status', () => {
    const c = new CompanyModel({ name: 'X', slug: 'x', createdBy: '64b8f0000000000000000001', status: 'bogus' });
    const err = c.validateSync();
    expect(err).toBeDefined();
  });

  it('requires a name', () => {
    const c = new CompanyModel({ slug: 'x', createdBy: '64b8f0000000000000000001' });
    const err = c.validateSync();
    expect(err?.errors?.name).toBeDefined();
  });
});
