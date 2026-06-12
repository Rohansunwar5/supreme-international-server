import WalletModel from '../../models/wallet.model';

describe('Wallet model', () => {
  it('defaults balance to 0 and currency to INR', () => {
    const w = new WalletModel({ employeeId: '64b8f0000000000000000001', companyId: '64b8f0000000000000000002' });
    expect(w.balance).toBe(0);
    expect(w.currency).toBe('INR');
    expect(w.validateSync()).toBeUndefined();
  });

  it('requires employeeId and companyId', () => {
    const w = new WalletModel({});
    const err = w.validateSync();
    expect(err?.errors?.employeeId).toBeDefined();
    expect(err?.errors?.companyId).toBeDefined();
  });

  it('rejects a negative balance', () => {
    const w = new WalletModel({ employeeId: '64b8f0000000000000000001', companyId: '64b8f0000000000000000002', balance: -5 });
    expect(w.validateSync()?.errors?.balance).toBeDefined();
  });
});
