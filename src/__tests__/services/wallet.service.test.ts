const walletRepo = { findByEmployeeId: jest.fn(), getOrCreate: jest.fn(), atomicCredit: jest.fn(), atomicDebit: jest.fn() };
const ledgerRepo = { create: jest.fn(), findByWallet: jest.fn() };
const userRepo = { findEmployeeById: jest.fn() };
jest.mock('../../repository/wallet.repository', () => ({ __esModule: true, WalletRepository: jest.fn().mockImplementation(() => walletRepo) }));
jest.mock('../../repository/walletLedger.repository', () => ({ __esModule: true, WalletLedgerRepository: jest.fn().mockImplementation(() => ledgerRepo) }));
jest.mock('../../repository/user.repository', () => ({ __esModule: true, UserRepository: jest.fn().mockImplementation(() => userRepo) }));

import walletService from '../../services/wallet.service';
import { BadRequestError } from '../../errors/bad-request.error';

describe('wallet.service', () => {
  beforeEach(() => jest.clearAllMocks());

  it('credit auto-creates the wallet, increments balance, writes a ledger entry', async () => {
    walletRepo.getOrCreate.mockResolvedValue({ _id: 'w1', balance: 0 });
    walletRepo.atomicCredit.mockResolvedValue({ _id: 'w1', balance: 100, currency: 'INR' });
    ledgerRepo.create.mockImplementation(async (e) => ({ _id: 'l1', ...e }));

    const out = await walletService.credit('e1', 'co1', 100, 'Q1', 'admin1');

    expect(walletRepo.atomicCredit).toHaveBeenCalledWith('w1', 100);
    expect(ledgerRepo.create).toHaveBeenCalledWith(expect.objectContaining({ type: 'credit', source: 'admin_topup', amount: 100, balanceAfter: 100, reason: 'Q1', createdBy: 'admin1' }));
    expect(out.balance).toBe(100);
  });

  it('debit decrements balance and writes a debit entry', async () => {
    walletRepo.getOrCreate.mockResolvedValue({ _id: 'w1', balance: 100 });
    walletRepo.atomicDebit.mockResolvedValue({ _id: 'w1', balance: 40, currency: 'INR' });
    ledgerRepo.create.mockImplementation(async (e) => ({ _id: 'l2', ...e }));

    const out = await walletService.debit('e1', 'co1', 60, 'correction', 'admin1');

    expect(walletRepo.atomicDebit).toHaveBeenCalledWith('w1', 60);
    expect(ledgerRepo.create).toHaveBeenCalledWith(expect.objectContaining({ type: 'debit', source: 'admin_adjustment', balanceAfter: 40 }));
    expect(out.balance).toBe(40);
  });

  it('debit beyond balance throws INSUFFICIENT_BALANCE', async () => {
    walletRepo.getOrCreate.mockResolvedValue({ _id: 'w1', balance: 10 });
    walletRepo.atomicDebit.mockResolvedValue(null);
    await expect(walletService.debit('e1', 'co1', 60, 'x', 'admin1')).rejects.toBeInstanceOf(BadRequestError);
    expect(ledgerRepo.create).not.toHaveBeenCalled();
  });

  it('getWallet returns a synthesized zero wallet when none exists', async () => {
    walletRepo.findByEmployeeId.mockResolvedValue(null);
    const out = await walletService.getWallet('e1');
    expect(out).toEqual({ balance: 0, currency: 'INR' });
  });

  it('adminCredit rejects a non-employee id', async () => {
    userRepo.findEmployeeById.mockResolvedValue(null);
    await expect(walletService.adminCredit('nope', 50, 'x', 'admin1')).rejects.toThrow();
  });
});
