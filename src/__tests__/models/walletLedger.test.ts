import WalletLedgerModel from '../../models/walletLedger.model';

const base = {
  walletId: '64b8f0000000000000000001',
  employeeId: '64b8f0000000000000000002',
  companyId: '64b8f0000000000000000003',
  amount: 100,
  balanceAfter: 100,
  reason: 'Q1 gifting',
};

describe('WalletLedger model', () => {
  it('accepts a valid credit entry', () => {
    const e = new WalletLedgerModel({ ...base, type: 'credit', source: 'admin_topup' });
    expect(e.validateSync()).toBeUndefined();
  });

  it('rejects an invalid type', () => {
    const e = new WalletLedgerModel({ ...base, type: 'bogus', source: 'admin_topup' });
    expect(e.validateSync()?.errors?.type).toBeDefined();
  });

  it('rejects an invalid source', () => {
    const e = new WalletLedgerModel({ ...base, type: 'credit', source: 'bogus' });
    expect(e.validateSync()?.errors?.source).toBeDefined();
  });

  it('requires a reason', () => {
    const e = new WalletLedgerModel({ walletId: base.walletId, employeeId: base.employeeId, companyId: base.companyId, amount: 1, balanceAfter: 1, type: 'credit', source: 'admin_topup' });
    expect(e.validateSync()?.errors?.reason).toBeDefined();
  });
});
