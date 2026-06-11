import mongoose from 'mongoose';

const companyCatalogSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
    productIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    categoryIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  },
  { timestamps: true },
);

export interface ICompanyCatalog extends mongoose.Document {
  _id: mongoose.Types.ObjectId;
  companyId: mongoose.Types.ObjectId;
  productIds: mongoose.Types.ObjectId[];
  categoryIds: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

export default mongoose.model<ICompanyCatalog>('CompanyCatalog', companyCatalogSchema);
