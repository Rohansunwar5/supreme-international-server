const catalogRepo = { findByCompanyId: jest.fn().mockResolvedValue({ productIds: [], categoryIds: [] }) };
const productRepo = {
  searchEmployeeCatalog: jest.fn().mockResolvedValue({ docs: [], total: 0 }),
  findEmployeeProductBySlug: jest.fn(),
  findEmployeeRelated: jest.fn().mockResolvedValue([]),
  findEmployeeByIds: jest.fn().mockResolvedValue([]),
};
const variantRepo = { getMinPriceByProductIds: jest.fn().mockResolvedValue([]) };
const recentlyViewedUser = { get: jest.fn() };
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
jest.mock('../../services/cache/entities', () => ({
  __esModule: true,
  recentlyViewedUserCacheManager: { get: (...a: unknown[]) => recentlyViewedUser.get(...a), set: jest.fn() },
}));

import employeeCatalogService from '../../services/employee.catalog.service';

describe('employee.catalog.service search/related/recently-viewed', () => {
  beforeEach(() => jest.clearAllMocks());

  it('search delegates to the scoped repo method', async () => {
    const out = await employeeCatalogService.searchProducts('c1', 'mug', 1, 12);
    expect(productRepo.searchEmployeeCatalog).toHaveBeenCalled();
    expect(out.products).toEqual([]);
  });

  it('related returns [] when the slug is out of scope', async () => {
    productRepo.findEmployeeProductBySlug.mockResolvedValue(null);
    const out = await employeeCatalogService.getRelated('c1', 'secret', 6);
    expect(out).toEqual([]);
    expect(productRepo.findEmployeeRelated).not.toHaveBeenCalled();
  });

  it('recently-viewed filters stored ids through the company scope', async () => {
    recentlyViewedUser.get.mockResolvedValue(['p1', 'p2']);
    productRepo.findEmployeeByIds.mockResolvedValue([{ _id: { toString: () => 'p1' }, name: 'Mug', slug: 'mug', images: [], badge: null, rating: 0, totalReviews: 0 }]);
    const out = await employeeCatalogService.getRecentlyViewed('c1', 'u1');
    expect(productRepo.findEmployeeByIds).toHaveBeenCalledWith(expect.objectContaining({ companyId: 'c1' }), ['p1', 'p2']);
    expect(out.products).toHaveLength(1);
  });
});
