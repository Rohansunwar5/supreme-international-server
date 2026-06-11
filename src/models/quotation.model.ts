import mongoose from 'mongoose';

const quotationItemSchema = new mongoose.Schema(
  {
    variantId: { type: mongoose.Schema.Types.ObjectId, required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, required: true },
    productName: { type: String, required: true },
    sku: { type: String, required: true },
    attributeLabels: { type: [String], default: [] },
    unitPrice: { type: Number, required: true, min: 0 },
    qty: { type: Number, required: true, min: 1 },
    moq: { type: Number, required: true, min: 1 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const quotationContactSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true },
    phoneNumber: { type: String, default: '' },
    isdCode: { type: String, default: '' },
    company: { type: String, default: '' },
  },
  { _id: false },
);

const quotationSchema = new mongoose.Schema(
  {
    quotationNumber: { type: String, required: true, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, required: true },
    contact: { type: quotationContactSchema, required: true },
    items: { type: [quotationItemSchema], required: true },
    subtotal: { type: Number, required: true, min: 0 },
    couponCode: { type: String, default: null },
    discountAmount: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR' },
    pdfUrl: { type: String, required: true },
    status: {
      type: String,
      enum: ['generated', 'sent', 'viewed', 'converted', 'archived'],
      default: 'generated',
    },
    downloadCount: { type: Number, default: 0, min: 0 },
    lastDownloadedAt: { type: Date, default: null },
    source: { type: String, enum: ['b2b'], default: 'b2b' },
  },
  { timestamps: true },
);

quotationSchema.index({ quotationNumber: 1 }, { unique: true });
quotationSchema.index({ user: 1, createdAt: -1 });
quotationSchema.index({ status: 1, createdAt: -1 });

export interface IQuotationItem {
  variantId: mongoose.Types.ObjectId;
  productId: mongoose.Types.ObjectId;
  productName: string;
  sku: string;
  attributeLabels: string[];
  unitPrice: number;
  qty: number;
  moq: number;
  lineTotal: number;
}

export interface IQuotationContact {
  name: string;
  email: string;
  phoneNumber: string;
  isdCode: string;
  company: string;
}

export type QuotationStatus = 'generated' | 'sent' | 'viewed' | 'converted' | 'archived';

export interface IQuotation extends mongoose.Document {
  _id: mongoose.Types.ObjectId;
  quotationNumber: string;
  user: mongoose.Types.ObjectId;
  contact: IQuotationContact;
  items: IQuotationItem[];
  subtotal: number;
  couponCode: string | null;
  discountAmount: number;
  total: number;
  currency: string;
  pdfUrl: string;
  status: QuotationStatus;
  downloadCount: number;
  lastDownloadedAt: Date | null;
  source: 'b2b';
  createdAt: Date;
  updatedAt: Date;
}

export default mongoose.model<IQuotation>('Quotation', quotationSchema);
