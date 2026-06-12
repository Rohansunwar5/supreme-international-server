import walletModel, { IWallet } from '../models/wallet.model';

export class WalletRepository {
  private _model = walletModel;

  async findByEmployeeId(employeeId: string): Promise<IWallet | null> {
    return this._model.findOne({ employeeId });
  }

  async getOrCreate(employeeId: string, companyId: string): Promise<IWallet> {
    // Atomic upsert: two concurrent first-time credits/debits can't race the
    // unique employeeId index into a duplicate-key 500.
    return this._model.findOneAndUpdate(
      { employeeId },
      { $setOnInsert: { employeeId, companyId, balance: 0 } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ) as Promise<IWallet>;
  }

  async atomicCredit(walletId: string, amount: number): Promise<IWallet | null> {
    return this._model.findOneAndUpdate(
      { _id: walletId },
      { $inc: { balance: amount } },
      { new: true },
    );
  }

  async atomicDebit(walletId: string, amount: number): Promise<IWallet | null> {
    return this._model.findOneAndUpdate(
      { _id: walletId, balance: { $gte: amount } },
      { $inc: { balance: -amount } },
      { new: true },
    );
  }
}
