const getWallet = jest.fn();
const getLedger = jest.fn();
jest.mock('../../services/wallet.service', () => ({
  __esModule: true,
  default: { getWallet: (...a: unknown[]) => getWallet(...a), getLedger: (...a: unknown[]) => getLedger(...a) },
}));
jest.mock('../../middlewares/isEmployee.middleware', () => ({
  __esModule: true,
  default: (req: { user?: { _id: string }; companyId?: string }, _res: unknown, next: () => void) => {
    req.user = { _id: 'u1' };
    req.companyId = 'c1';
    next();
  },
}));

import express from 'express';
import request from 'supertest';
import employeeWalletRouter from '../../routes/employee.wallet.route';
import { globalHandler } from '../../middlewares/error-handler.middleware';

const app = express();
app.use(express.json());
app.use('/employee/wallet', employeeWalletRouter);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((data: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => globalHandler(data as never, req, res as never, next));

describe('employee wallet routes', () => {
  beforeEach(() => jest.clearAllMocks());

  it('GET /employee/wallet returns the own balance', async () => {
    getWallet.mockResolvedValue({ balance: 250, currency: 'INR' });
    const res = await request(app).get('/employee/wallet');
    expect(res.status).toBe(200);
    expect(res.body.data.balance).toBe(250);
    expect(getWallet).toHaveBeenCalledWith('u1');
  });

  it('GET /employee/wallet/ledger returns own history', async () => {
    getLedger.mockResolvedValue({ items: [], pagination: { total: 0, page: 1, limit: 20, pages: 0 } });
    const res = await request(app).get('/employee/wallet/ledger');
    expect(res.status).toBe(200);
    expect(getLedger).toHaveBeenCalledWith('u1', undefined, undefined);
  });
});
