const getCatalog = jest.fn();
const updateCatalog = jest.fn();
const listCompanyProducts = jest.fn();
jest.mock('../../services/companyCatalog.service', () => ({
  __esModule: true,
  default: { getCatalog: (...a: unknown[]) => getCatalog(...a), updateCatalog: (...a: unknown[]) => updateCatalog(...a) },
}));
jest.mock('../../services/catalog/product.service', () => ({
  __esModule: true,
  default: { listProducts: (...a: unknown[]) => listCompanyProducts(...a) },
}));

import { getCatalogHandler, updateCatalogHandler, listCompanyProductsHandler } from '../../controllers/admin.companyCatalog.controller';

const run = (handler: (req: unknown, res: unknown, next: (p: unknown) => void) => Promise<void>, req: unknown) =>
  new Promise((resolve) => handler(req, {}, (p) => resolve(p)));

describe('admin companyCatalog controller', () => {
  beforeEach(() => jest.clearAllMocks());

  it('getCatalogHandler passes the company id', async () => {
    getCatalog.mockResolvedValue({ companyId: 'c1', productIds: [], categoryIds: [] });
    const out = await run(getCatalogHandler as never, { params: { id: 'c1' } });
    expect(getCatalog).toHaveBeenCalledWith('c1');
    expect(out).toEqual({ companyId: 'c1', productIds: [], categoryIds: [] });
  });

  it('updateCatalogHandler passes id + deltas', async () => {
    updateCatalog.mockResolvedValue({ companyId: 'c1', productIds: ['p1'], categoryIds: [] });
    await run(updateCatalogHandler as never, { params: { id: 'c1' }, body: { addProductIds: ['p1'] } });
    expect(updateCatalog).toHaveBeenCalledWith('c1', expect.objectContaining({ addProductIds: ['p1'] }));
  });

  it('listCompanyProductsHandler filters by ownerCompanyId + company visibility', async () => {
    listCompanyProducts.mockResolvedValue({ products: [], pagination: { total: 0, page: 1, limit: 12, pages: 0 } });
    await run(listCompanyProductsHandler as never, { params: { id: 'c1' }, query: {} });
    expect(listCompanyProducts).toHaveBeenCalledWith(expect.objectContaining({ visibility: 'company', ownerCompanyId: 'c1' }));
  });
});
