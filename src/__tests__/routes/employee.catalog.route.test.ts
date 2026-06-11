const listProducts = jest.fn();
jest.mock('../../services/employee.catalog.service', () => ({
  __esModule: true,
  default: {
    listProducts: (...a: unknown[]) => listProducts(...a),
    getProductBySlug: jest.fn(),
    searchProducts: jest.fn(),
    getRelated: jest.fn(),
    getRecentlyViewed: jest.fn(),
  },
}));
// Stub the guard: inject an active employee company id.
jest.mock('../../middlewares/isEmployee.middleware', () => ({
  __esModule: true,
  default: (req: { companyId?: string; user?: { _id: string } }, _res: unknown, next: () => void) => {
    req.companyId = 'c1';
    req.user = { _id: 'u1' };
    next();
  },
}));

import express from 'express';
import request from 'supertest';
import employeeCatalogRouter from '../../routes/employee.catalog.route';
import { globalHandler } from '../../middlewares/error-handler.middleware';

const app = express();
app.use(express.json());
app.use('/employee/catalog', employeeCatalogRouter);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((data: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => globalHandler(data as never, req, res as never, next));

describe('employee catalog routes', () => {
  beforeEach(() => jest.clearAllMocks());

  it('GET /employee/catalog/products returns the scoped list', async () => {
    listProducts.mockResolvedValue({ products: [], pagination: { total: 0, page: 1, limit: 12, pages: 0 } });
    const res = await request(app).get('/employee/catalog/products');
    expect(res.status).toBe(200);
    expect(listProducts).toHaveBeenCalledWith('c1', expect.any(Object));
  });
});
