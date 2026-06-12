const checkout = jest.fn();
jest.mock('../../services/employee.checkout.service', () => ({ __esModule: true, default: { checkout: (...a: unknown[]) => checkout(...a) } }));
jest.mock('../../middlewares/isEmployee.middleware', () => ({
  __esModule: true,
  default: (req: { user?: { _id: string }; companyId?: string }, _res: unknown, next: () => void) => {
    req.user = { _id: 'e1' };
    req.companyId = 'co1';
    next();
  },
}));

import express from 'express';
import request from 'supertest';
import employeeCheckoutRouter from '../../routes/employee.checkout.route';
import { globalHandler } from '../../middlewares/error-handler.middleware';

const app = express();
app.use(express.json());
app.use('/employee/checkout', employeeCheckoutRouter);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((data: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => globalHandler(data as never, req, res as never, next));

const address = { fullName: 'E', phone: '9999999999', line1: 'a', city: 'b', state: 'c', pincode: '560001' };

describe('employee checkout route', () => {
  beforeEach(() => jest.clearAllMocks());

  it('POST /employee/checkout passes employeeId, companyId, body to the service', async () => {
    checkout.mockResolvedValue({ orderId: 'SOV-1', walletApplied: 200, remainder: 0, fullyPaidByWallet: true });
    const res = await request(app).post('/employee/checkout').send({ shippingAddress: address });
    expect(res.status).toBe(200);
    expect(res.body.data.orderId).toBe('SOV-1');
    expect(checkout).toHaveBeenCalledWith('e1', 'co1', expect.objectContaining({ shippingAddress: expect.any(Object) }));
  });

  it('rejects a missing shipping address (422)', async () => {
    const res = await request(app).post('/employee/checkout').send({});
    expect(res.status).toBe(422);
  });
});
