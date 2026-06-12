const adminCredit = jest.fn();
const adminDebit = jest.fn();
jest.mock('../../services/wallet.service', () => ({
  __esModule: true,
  default: {
    adminCredit: (...a: unknown[]) => adminCredit(...a),
    adminDebit: (...a: unknown[]) => adminDebit(...a),
    adminGetWallet: jest.fn(),
    adminGetLedger: jest.fn(),
  },
}));

import { creditHandler, debitHandler } from '../../controllers/admin.wallet.controller';

const run = (handler: (req: unknown, res: unknown, next: (p: unknown) => void) => Promise<void>, req: unknown) =>
  new Promise((resolve) => handler(req, {}, (p) => resolve(p)));

describe('admin wallet controller', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creditHandler passes employeeId, amount, reason, admin id', async () => {
    adminCredit.mockResolvedValue({ balance: 100, currency: 'INR' });
    const out = await run(creditHandler as never, { params: { id: 'e1' }, body: { amount: 100, reason: 'Q1' }, admin: { _id: 'a1' } });
    expect(adminCredit).toHaveBeenCalledWith('e1', 100, 'Q1', 'a1');
    expect(out).toEqual({ balance: 100, currency: 'INR' });
  });

  it('debitHandler passes employeeId, amount, reason, admin id', async () => {
    adminDebit.mockResolvedValue({ balance: 40, currency: 'INR' });
    await run(debitHandler as never, { params: { id: 'e1' }, body: { amount: 60, reason: 'fix' }, admin: { _id: 'a1' } });
    expect(adminDebit).toHaveBeenCalledWith('e1', 60, 'fix', 'a1');
  });
});
