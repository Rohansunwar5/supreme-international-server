const productRepo = {
  findWithFilters: jest.fn().mockResolvedValue({ docs: [], total: 0 }),
  findBySlug: jest.fn(),
};
const variantRepo = {
  getMinPriceByProductIds: jest.fn().mockResolvedValue([]),
  findDistinctProductIdsByFilters: jest.fn(),
};
const categoryRepo = { findBySlug: jest.fn().mockResolvedValue(null) };
jest.mock('../../repository/product.repository', () => ({
  __esModule: true,
  ProductRepository: jest.fn().mockImplementation(() => productRepo),
}));
jest.mock('../../repository/productVariant.repository', () => ({
  __esModule: true,
  ProductVariantRepository: jest.fn().mockImplementation(() => variantRepo),
}));
jest.mock('../../repository/category.repository', () => ({
  __esModule: true,
  CategoryRepository: jest.fn().mockImplementation(() => categoryRepo),
}));
jest.mock('../../services/cache/entities', () => ({
  __esModule: true,
  productListCacheManager: { get: jest.fn().mockResolvedValue(null), set: jest.fn(), flush: jest.fn() },
  productDetailCacheManager: { get: jest.fn().mockResolvedValue(null), set: jest.fn(), remove: jest.fn() },
}));

import productService from '../../services/catalog/product.service';

describe('public catalog excludes private products', () => {
  beforeEach(() => jest.clearAllMocks());

  it('listProducts forwards visibility:public to the repository filter', async () => {
    await productService.listProducts({ visibility: 'public' });
    expect(productRepo.findWithFilters).toHaveBeenCalledWith(
      expect.objectContaining({ filter: expect.objectContaining({ isActive: true, visibility: 'public' }) }),
    );
  });

  it('getFeaturedProducts filters to public', async () => {
    await productService.getFeaturedProducts();
    expect(productRepo.findWithFilters).toHaveBeenCalledWith(
      expect.objectContaining({ filter: expect.objectContaining({ visibility: 'public' }) }),
    );
  });
});
