const productRepo = { slugExists: jest.fn().mockResolvedValue(false), create: jest.fn().mockImplementation(async (p) => ({ _id: 'p1', ...p })) };
const variantRepo = {};
const categoryRepo = { findById: jest.fn().mockResolvedValue({ _id: 'cat1' }) };
const companyRepo = { findById: jest.fn() };
jest.mock('../../repository/product.repository', () => ({ __esModule: true, ProductRepository: jest.fn().mockImplementation(() => productRepo) }));
jest.mock('../../repository/productVariant.repository', () => ({ __esModule: true, ProductVariantRepository: jest.fn().mockImplementation(() => variantRepo) }));
jest.mock('../../repository/category.repository', () => ({ __esModule: true, CategoryRepository: jest.fn().mockImplementation(() => categoryRepo) }));
jest.mock('../../repository/company.repository', () => ({ __esModule: true, CompanyRepository: jest.fn().mockImplementation(() => companyRepo) }));
jest.mock('../../services/cache/entities', () => ({ __esModule: true, productListCacheManager: { flush: jest.fn() }, productDetailCacheManager: { remove: jest.fn() } }));

import productService from '../../services/catalog/product.service';
import { BadRequestError } from '../../errors/bad-request.error';

describe('product.service private product create', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates a company-private product when the owner company exists', async () => {
    companyRepo.findById.mockResolvedValue({ _id: 'co1' });
    const out = await productService.createProduct({ name: 'Secret', categoryId: 'cat1', visibility: 'company', ownerCompanyId: 'co1' } as never);
    expect(productRepo.create).toHaveBeenCalledWith(expect.objectContaining({ visibility: 'company', ownerCompanyId: 'co1' }));
    expect(out._id).toBe('p1');
  });

  it('rejects a company-private product without a valid owner company', async () => {
    companyRepo.findById.mockResolvedValue(null);
    await expect(productService.createProduct({ name: 'Secret', categoryId: 'cat1', visibility: 'company', ownerCompanyId: 'missing' } as never)).rejects.toBeInstanceOf(BadRequestError);
  });
});
