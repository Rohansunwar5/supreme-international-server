import mongoose from 'mongoose';

const companySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxLength: 120 },
    slug: { type: String, required: true, unique: true },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    primaryContact: {
      name: { type: String },
      email: { type: String },
      isdCode: { type: String },
      phoneNumber: { type: String },
    },
    notes: { type: String },
    createdBy: { type: mongoose.Schema.Types.ObjectId, required: true },
  },
  { timestamps: true },
);

companySchema.index({ status: 1, createdAt: -1 });

export interface ICompany extends mongoose.Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  slug: string;
  status: 'active' | 'inactive';
  primaryContact?: { name?: string; email?: string; isdCode?: string; phoneNumber?: string };
  notes?: string;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export default mongoose.model<ICompany>('Company', companySchema);
