import walletLedgerModel, { IWalletLedger } from '../models/walletLedger.model';

export interface ICreateLedgerEntry {
  walletId: string;
  employeeId: string;
  companyId: string;
  type: 'credit' | 'debit';
  amount: number;
  balanceAfter: number;
  reason: string;
  source: 'admin_topup' | 'admin_adjustment' | 'order_redemption' | 'refund';
  createdBy?: string;
  referenceId?: string;
}

export class WalletLedgerRepository {
  private _model = walletLedgerModel;

  async create(entry: ICreateLedgerEntry): Promise<IWalletLedger> {
    return this._model.create(entry);
  }

  async findByWallet(walletId: string, page: number, limit: number): Promise<{ items: IWalletLedger[]; total: number }> {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this._model.find({ walletId }).sort({ createdAt: -1 }).skip(skip).limit(limit),
      this._model.countDocuments({ walletId }),
    ]);
    return { items, total };
  }
}
