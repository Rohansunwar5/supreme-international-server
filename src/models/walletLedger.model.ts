import mongoose from 'mongoose';

const walletLedgerSchema = new mongoose.Schema(
  {
    walletId: { type: mongoose.Schema.Types.ObjectId, required: true },
    employeeId: { type: mongoose.Schema.Types.ObjectId, required: true },
    companyId: { type: mongoose.Schema.Types.ObjectId, required: true },
    type: { type: String, enum: ['credit', 'debit'], required: true },
    amount: { type: Number, required: true, min: 0.01 },
    balanceAfter: { type: Number, required: true },
    reason: { type: String, required: true },
    source: { type: String, enum: ['admin_topup', 'admin_adjustment', 'order_redemption', 'refund'], required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId },
    referenceId: { type: mongoose.Schema.Types.ObjectId },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

walletLedgerSchema.index({ walletId: 1, createdAt: -1 });
walletLedgerSchema.index({ employeeId: 1 });

export interface IWalletLedger extends mongoose.Document {
  _id: mongoose.Types.ObjectId;
  walletId: mongoose.Types.ObjectId;
  employeeId: mongoose.Types.ObjectId;
  companyId: mongoose.Types.ObjectId;
  type: 'credit' | 'debit';
  amount: number;
  balanceAfter: number;
  reason: string;
  source: 'admin_topup' | 'admin_adjustment' | 'order_redemption' | 'refund';
  createdBy?: mongoose.Types.ObjectId;
  referenceId?: mongoose.Types.ObjectId;
  createdAt: Date;
}

export default mongoose.model<IWalletLedger>('WalletLedger', walletLedgerSchema);
