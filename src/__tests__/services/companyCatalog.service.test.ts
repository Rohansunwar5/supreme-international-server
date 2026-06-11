const catalogRepo = { findByCompanyId: jest.fn(), applyDeltas: jest.fn() };
const companyRepo = { findById: jest.fn() };
const productRepo = { findByIds: jest.fn() };
jest.mock('../../repository/companyCatalog.repository', () => ({
  __esModule: true,
  CompanyCatalogRepository: jest.fn().mockImplementation(() => catalogRepo),
}));
jest.mock('../../repository/company.repository', () => ({
  __esModule: true,
  CompanyRepository: jest.fn().mockImplementation(() => companyRepo),
}));
jest.mock('../../repository/product.repository', () => ({
  __esModule: true,
  ProductRepository: jest.fn().mockImplementation(() => productRepo),
}));

import companyCatalogService from '../../services/companyCatalog.service';
import { NotFoundError } from '../../errors/not-found.error';
import { BadRequestError } from '../../errors/bad-request.error';

describe('companyCatalog.service', () => {
  beforeEach(() => jest.clearAllMocks());

  it('getCatalog returns empty arrays when no doc exists', async () => {
    companyRepo.findById.mockResolvedValue({ _id: 'c1' });
    catalogRepo.findByCompanyId.mockResolvedValue(null);
    const out = await companyCatalogService.getCatalog('c1');
    expect(out).toEqual({ companyId: 'c1', productIds: [], categoryIds: [] });
  });

  it('throws NotFound for an unknown company', async () => {
    companyRepo.findById.mockResolvedValue(null);
    await expect(companyCatalogService.getCatalog('nope')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('applies deltas after validating added products are public', async () => {
    companyRepo.findById.mockResolvedValue({ _id: 'c1' });
    productRepo.findByIds.mockResolvedValue([{ _id: { toString: () => 'p1' }, visibility: 'public', isActive: true }]);
    catalogRepo.applyDeltas.mockResolvedValue({ companyId: 'c1', productIds: ['p1'], categoryIds: [] });
    const out = await companyCatalogService.updateCatalog('c1', { addProductIds: ['p1'] });
    expect(catalogRepo.applyDeltas).toHaveBeenCalledWith('c1', expect.objectContaining({ addProductIds: ['p1'] }));
    expect(out.productIds).toEqual(['p1']);
  });

  it('rejects whitelisting a non-public or missing product', async () => {
    companyRepo.findById.mockResolvedValue({ _id: 'c1' });
    productRepo.findByIds.mockResolvedValue([{ _id: { toString: () => 'p1' }, visibility: 'company', isActive: true }]);
    await expect(companyCatalogService.updateCatalog('c1', { addProductIds: ['p1'] })).rejects.toBeInstanceOf(BadRequestError);
  });
});
