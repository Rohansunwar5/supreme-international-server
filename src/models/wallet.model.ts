import mongoose from 'mongoose';

const walletSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
    companyId: { type: mongoose.Schema.Types.ObjectId, required: true },
    balance: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: 'INR' },
  },
  { timestamps: true },
);

export interface IWallet extends mongoose.Document {
  _id: mongoose.Types.ObjectId;
  employeeId: mongoose.Types.ObjectId;
  companyId: mongoose.Types.ObjectId;
  balance: number;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
}

export default mongoose.model<IWallet>('Wallet', walletSchema);
