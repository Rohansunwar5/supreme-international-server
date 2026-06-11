const catalogRepo = { findByCompanyId: jest.fn() };
const productRepo = {
  findEmployeeCatalog: jest.fn(),
  findEmployeeProductBySlug: jest.fn(),
};
const variantRepo = {
  getMinPriceByProductIds: jest.fn().mockResolvedValue([]),
  findByProductId: jest.fn().mockResolvedValue([]),
  findDistinctProductIdsByFilters: jest.fn(),
};
jest.mock('../../repository/companyCatalog.repository', () => ({
  __esModule: true,
  CompanyCatalogRepository: jest.fn().mockImplementation(() => catalogRepo),
}));
jest.mock('../../repository/product.repository', () => ({
  __esModule: true,
  ProductRepository: jest.fn().mockImplementation(() => productRepo),
}));
jest.mock('../../repository/productVariant.repository', () => ({
  __esModule: true,
  ProductVariantRepository: jest.fn().mockImplementation(() => variantRepo),
}));

import employeeCatalogService from '../../services/employee.catalog.service';
import { NotFoundError } from '../../errors/not-found.error';

describe('employee.catalog.service list + detail', () => {
  beforeEach(() => jest.clearAllMocks());

  it('lists scoped products using the company whitelist', async () => {
    catalogRepo.findByCompanyId.mockResolvedValue({ productIds: [{ toString: () => 'p1' }], categoryIds: [] });
    productRepo.findEmployeeCatalog.mockResolvedValue({ docs: [{ _id: { toString: () => 'p1' }, name: 'Mug', slug: 'mug', images: [], badge: null, rating: 0, totalReviews: 0, category: 'cat1', isFeatured: false }], total: 1 });
    const out = await employeeCatalogService.listProducts('c1', {});
    expect(productRepo.findEmployeeCatalog).toHaveBeenCalledWith(
      expect.objectContaining({ scope: expect.objectContaining({ companyId: 'c1', productIds: ['p1'], categoryIds: [] }) }),
    );
    expect(out.products).toHaveLength(1);
    expect(out.pagination.total).toBe(1);
  });

  it('returns an empty scope when the company has no catalog doc', async () => {
    catalogRepo.findByCompanyId.mockResolvedValue(null);
    productRepo.findEmployeeCatalog.mockResolvedValue({ docs: [], total: 0 });
    const out = await employeeCatalogService.listProducts('c1', {});
    expect(productRepo.findEmployeeCatalog).toHaveBeenCalledWith(
      expect.objectContaining({ scope: { companyId: 'c1', productIds: [], categoryIds: [] } }),
    );
    expect(out.products).toEqual([]);
  });

  it('throws NotFound for an out-of-scope product slug', async () => {
    catalogRepo.findByCompanyId.mockResolvedValue({ productIds: [], categoryIds: [] });
    productRepo.findEmployeeProductBySlug.mockResolvedValue(null);
    await expect(employeeCatalogService.getProductBySlug('c1', 'secret')).rejects.toBeInstanceOf(NotFoundError);
  });
});
