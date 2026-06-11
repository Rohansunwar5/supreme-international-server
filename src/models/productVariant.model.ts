import mongoose from 'mongoose';

const variantAttributeSchema = new mongoose.Schema(
  {
    attributeId: { type: mongoose.Schema.Types.ObjectId, required: true },
    attributeName: { type: String, required: true },
    attributeSlug: { type: String, required: true },
    valueId: { type: mongoose.Schema.Types.ObjectId, required: true },
    valueLabel: { type: String, required: true },
    valueSlug: { type: String, required: true },
    valueMeta: { type: Map, of: String, default: {} },
  },
  { _id: false },
);

const productVariantSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, required: true },
    sku: { type: String, required: true, trim: true, uppercase: true },
    price: { type: Number, required: true, min: 0 },
    originalPrice: { type: Number, required: true, min: 0 },
    stock: { type: Number, required: true, min: 0, default: 0 },
    moq: { type: Number, required: true, min: 1, default: 1 },
    images: { type: [String], default: [] },
    attributes: { type: [variantAttributeSchema], default: [] },
    variantKey: { type: String, required: true },
    isActive: { type: Boolean, default: true },
    flashSalePrice: { type: Number, default: null },
    flashSaleEndsAt: { type: Date, default: null },
  },
  { timestamps: true },
);

productVariantSchema.index({ product: 1, isActive: 1 });
productVariantSchema.index({ product: 1, variantKey: 1 }, { unique: true });
productVariantSchema.index({ 'attributes.valueId': 1 });
productVariantSchema.index({ price: 1, isActive: 1 });
productVariantSchema.index({ stock: 1, isActive: 1 });
productVariantSchema.index({ sku: 1 }, { unique: true });

export interface IVariantAttribute {
  attributeId: mongoose.Types.ObjectId;
  attributeName: string;
  attributeSlug: string;
  valueId: mongoose.Types.ObjectId;
  valueLabel: string;
  valueSlug: string;
  valueMeta: Map<string, string>;
}

export interface IProductVariant extends mongoose.Document {
  _id: mongoose.Types.ObjectId;
  product: mongoose.Types.ObjectId;
  sku: string;
  price: number;
  originalPrice: number;
  stock: number;
  moq: number;
  images: string[];
  attributes: IVariantAttribute[];
  variantKey: string;
  isActive: boolean;
  flashSalePrice: number | null;
  flashSaleEndsAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export default mongoose.model<IProductVariant>('ProductVariant', productVariantSchema);
