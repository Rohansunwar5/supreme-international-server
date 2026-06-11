import mongoose from 'mongoose';

const badgeSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true },
    variant: { type: String, enum: ['primary', 'accent'], required: true },
  },
  { _id: false },
);

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true, unique: true },
    description: { type: String, trim: true, default: '' },
    details: { type: String, trim: true, default: '' },
    materials: { type: String, trim: true, default: '' },
    shipping: { type: String, trim: true, default: '' },
    category: { type: mongoose.Schema.Types.ObjectId, required: true },
    images: { type: [String], default: [] },
    badge: { type: badgeSchema, default: null },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    totalReviews: { type: Number, default: 0, min: 0 },
    totalPurchases: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false },
    visibility: { type: String, enum: ['public', 'company'], default: 'public' },
    ownerCompanyId: { type: mongoose.Schema.Types.ObjectId },
  },
  { timestamps: true },
);

productSchema.index({ slug: 1 });
productSchema.index({ category: 1, isActive: 1 });
productSchema.index({ isActive: 1, isFeatured: 1 });
productSchema.index({ isActive: 1, rating: -1 });
productSchema.index({ isActive: 1, createdAt: -1 });
productSchema.index(
  { name: 'text', description: 'text', details: 'text' },
  { weights: { name: 10, description: 3, details: 1 }, name: 'product_text_search' },
);
productSchema.index({ visibility: 1, ownerCompanyId: 1 });

export interface IProductBadge {
  label: string;
  variant: 'primary' | 'accent';
}

export interface IProduct extends mongoose.Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  slug: string;
  description: string;
  details: string;
  materials: string;
  shipping: string;
  category: mongoose.Types.ObjectId;
  images: string[];
  badge: IProductBadge | null;
  rating: number;
  totalReviews: number;
  totalPurchases: number;
  isActive: boolean;
  isFeatured: boolean;
  visibility: 'public' | 'company';
  ownerCompanyId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export default mongoose.model<IProduct>('Product', productSchema);
