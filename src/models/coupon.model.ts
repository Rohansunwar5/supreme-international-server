import mongoose from 'mongoose';

export interface ICoupon extends mongoose.Document {
  code: string;
  description: string;
  type: 'flat' | 'percent';
  value: number;
  minOrderValue: number;
  maxDiscountAmount: number;
  usageLimit: number;
  perUserLimit: number;
  usedCount: number;
  applicableCategories: mongoose.Types.ObjectId[];
  applicableProducts: mongoose.Types.ObjectId[];
  isActive: boolean;
  startsAt: Date;
  expiresAt: Date | null;
  createdBy: mongoose.Types.ObjectId;
  companyId?: mongoose.Types.ObjectId;
}

const couponSchema = new mongoose.Schema<ICoupon>(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    description: { type: String, default: '' },
    type: { type: String, enum: ['flat', 'percent'], required: true },
    value: { type: Number, required: true, min: 0 },
    minOrderValue: { type: Number, default: 0 },
    maxDiscountAmount: { type: Number, default: 0 },
    usageLimit: { type: Number, default: 0 },
    perUserLimit: { type: Number, default: 0 },
    usedCount: { type: Number, default: 0 },
    applicableCategories: [{ type: mongoose.Schema.Types.ObjectId }],
    applicableProducts: [{ type: mongoose.Schema.Types.ObjectId }],
    isActive: { type: Boolean, default: true },
    startsAt: { type: Date, required: true },
    expiresAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, required: true },
    companyId: { type: mongoose.Schema.Types.ObjectId, default: undefined },
  },
  { timestamps: true },
);

couponSchema.index({ isActive: 1, startsAt: 1, expiresAt: 1 });

export default mongoose.model<ICoupon>('Coupon', couponSchema);
