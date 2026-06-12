import walletModel, { IWallet } from '../models/wallet.model';

export class WalletRepository {
  private _model = walletModel;

  async findByEmployeeId(employeeId: string): Promise<IWallet | null> {
    return this._model.findOne({ employeeId });
  }

  async getOrCreate(employeeId: string, companyId: string): Promise<IWallet> {
    const existing = await this._model.findOne({ employeeId });
    if (existing) return existing;
    return this._model.create({ employeeId, companyId, balance: 0 });
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
