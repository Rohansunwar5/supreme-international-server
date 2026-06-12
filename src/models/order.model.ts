import mongoose from 'mongoose';

export interface IOrderItem {
  variantId: mongoose.Types.ObjectId;
  productId: mongoose.Types.ObjectId;
  sku: string;
  productName: string;
  attributeLabels: string[];
  image: string;
  qty: number;
  priceAtPurchase: number;
  originalPriceAtPurchase: number;
}

export interface IShippingAddress {
  fullName: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
}

export interface IBilling {
  subtotal: number;
  couponCode: string | null;
  couponDiscount: number;
  shippingCharge: number;
  shippingTax: number;
  total: number;
}

export interface IPayment {
  gateway: 'razorpay' | 'wallet';
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  razorpaySignature: string | null;
  status: 'pending' | 'paid' | 'failed' | 'refunded';
  method: string | null;
  paidAt: Date | null;
}

export interface ITimelineEntry {
  status: string;
  note: string;
  timestamp: Date;
}

export interface ITrackingInfo {
  courier: string | null;
  trackingId: string | null;
  trackingUrl: string | null;
}

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded';

export interface IOrder extends mongoose.Document {
  orderId: string;
  userId: mongoose.Types.ObjectId | null;
  customerEmail: string;
  guestInfo: { name: string; email: string; phone: string } | null;
  sessionId: string | null;
  items: IOrderItem[];
  shippingAddress: IShippingAddress;
  billing: IBilling;
  couponId: mongoose.Types.ObjectId | null;
  employeeId?: mongoose.Types.ObjectId;
  companyId?: mongoose.Types.ObjectId;
  orderType: 'standard' | 'employee';
  walletApplied: number;
  payment: IPayment;
  status: OrderStatus;
  timeline: ITimelineEntry[];
  trackingInfo: ITrackingInfo | null;
  createdAt: Date;
  updatedAt: Date;
}

const orderItemSchema = new mongoose.Schema<IOrderItem>(
  {
    variantId: { type: mongoose.Schema.Types.ObjectId, required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, required: true },
    sku: { type: String, required: true },
    productName: { type: String, required: true },
    attributeLabels: { type: [String], default: [] },
    image: { type: String, default: '' },
    qty: { type: Number, required: true, min: 1 },
    priceAtPurchase: { type: Number, required: true },
    originalPriceAtPurchase: { type: Number, required: true },
  },
  { _id: false },
);

const shippingAddressSchema = new mongoose.Schema<IShippingAddress>(
  {
    fullName: { type: String, required: true },
    phone: { type: String, required: true },
    line1: { type: String, required: true },
    line2: { type: String, default: '' },
    city: { type: String, required: true },
    state: { type: String, required: true },
    pincode: { type: String, required: true },
    country: { type: String, default: 'India' },
  },
  { _id: false },
);

const billingSchema = new mongoose.Schema<IBilling>(
  {
    subtotal: { type: Number, required: true },
    couponCode: { type: String, default: null },
    couponDiscount: { type: Number, default: 0 },
    shippingCharge: { type: Number, required: true },
    shippingTax: { type: Number, required: true },
    total: { type: Number, required: true },
  },
  { _id: false },
);

const paymentSchema = new mongoose.Schema<IPayment>(
  {
    gateway: { type: String, default: 'razorpay' },
    razorpayOrderId: { type: String, default: null },
    razorpayPaymentId: { type: String, default: null },
    razorpaySignature: { type: String, default: null },
    status: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded'],
      default: 'pending',
    },
    method: { type: String, default: null },
    paidAt: { type: Date, default: null },
  },
  { _id: false },
);

const timelineSchema = new mongoose.Schema<ITimelineEntry>(
  {
    status: { type: String, required: true },
    note: { type: String, default: '' },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false },
);

const trackingInfoSchema = new mongoose.Schema<ITrackingInfo>(
  {
    courier: { type: String, default: null },
    trackingId: { type: String, default: null },
    trackingUrl: { type: String, default: null },
  },
  { _id: false },
);

const orderSchema = new mongoose.Schema<IOrder>(
  {
    orderId: { type: String, required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, default: null },
    customerEmail: { type: String, required: true },
    guestInfo: {
      type: new mongoose.Schema(
        { name: String, email: String, phone: String },
        { _id: false },
      ),
      default: null,
    },
    sessionId: { type: String, default: null },
    items: { type: [orderItemSchema], required: true },
    shippingAddress: { type: shippingAddressSchema, required: true },
    billing: { type: billingSchema, required: true },
    couponId: { type: mongoose.Schema.Types.ObjectId, default: null },
    employeeId: { type: mongoose.Schema.Types.ObjectId, default: undefined },
    companyId: { type: mongoose.Schema.Types.ObjectId, default: undefined },
    orderType: { type: String, enum: ['standard', 'employee'], default: 'standard' },
    walletApplied: { type: Number, default: 0, min: 0 },
    payment: { type: paymentSchema, required: true },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'],
      default: 'pending',
    },
    timeline: { type: [timelineSchema], default: [] },
    trackingInfo: { type: trackingInfoSchema, default: null },
  },
  { timestamps: true },
);

orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ 'payment.razorpayOrderId': 1 });
orderSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model<IOrder>('Order', orderSchema);
