import orderModel, { IOrderItem, IShippingAddress, IBilling, IPayment, OrderStatus, ITrackingInfo } from '../models/order.model';

export interface ICreateOrderParams {
  orderId: string;
  userId?: string | null;
  customerEmail: string;
  guestInfo?: { name: string; email: string; phone: string } | null;
  sessionId?: string | null;
  items: IOrderItem[];
  shippingAddress: IShippingAddress;
  billing: IBilling;
  couponId?: string | null;
  payment: IPayment;
  employeeId?: string | null;
  companyId?: string | null;
  orderType?: 'standard' | 'employee';
  walletApplied?: number;
  status?: OrderStatus;
}

export class OrderRepository {
  private _model = orderModel;

  async create(params: ICreateOrderParams) {
    return this._model.create(params);
  }

  async findByOrderId(orderId: string) {
    return this._model.findOne({ orderId });
  }

  async findByRazorpayOrderId(razorpayOrderId: string) {
    return this._model.findOne({ 'payment.razorpayOrderId': razorpayOrderId });
  }

  async findByUserId(userId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;
    const [docs, total] = await Promise.all([
      this._model.find({ userId }).sort({ createdAt: -1 }).skip(skip).limit(limit),
      this._model.countDocuments({ userId }),
    ]);
    return { docs, total };
  }

  async findAllAdmin(filter: {
    status?: OrderStatus;
    dateFrom?: Date;
    dateTo?: Date;
  }, page: number, limit: number) {
    const query: Record<string, unknown> = {};
    if (filter.status) query.status = filter.status;
    if (filter.dateFrom || filter.dateTo) {
      const dateRange: Record<string, Date> = {};
      if (filter.dateFrom) dateRange.$gte = filter.dateFrom;
      if (filter.dateTo) dateRange.$lte = filter.dateTo;
      query.createdAt = dateRange;
    }

    const skip = (page - 1) * limit;
    const [docs, total] = await Promise.all([
      this._model.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      this._model.countDocuments(query),
    ]);
    return { docs, total };
  }

  async confirmPayment(params: {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
    method?: string;
  }) {
    return this._model.findOneAndUpdate(
      { 'payment.razorpayOrderId': params.razorpayOrderId, 'payment.status': 'pending' },
      {
        'payment.status': 'paid',
        'payment.razorpayPaymentId': params.razorpayPaymentId,
        'payment.razorpaySignature': params.razorpaySignature,
        'payment.method': params.method ?? null,
        'payment.paidAt': new Date(),
        status: 'confirmed',
        $push: { timeline: { status: 'confirmed', note: 'Payment received', timestamp: new Date() } },
      },
      { new: true },
    );
  }

  async updateStatus(orderId: string, status: OrderStatus, note?: string, trackingInfo?: ITrackingInfo) {
    const update: Record<string, unknown> = {
      status,
      $push: { timeline: { status, note: note ?? '', timestamp: new Date() } },
    };
    if (trackingInfo) update.trackingInfo = trackingInfo;

    return this._model.findOneAndUpdate({ orderId }, update, { new: true });
  }

  async markCancelled(orderId: string, note?: string) {
    return this._model.findOneAndUpdate(
      { orderId, status: { $in: ['pending', 'confirmed'] } },
      {
        status: 'cancelled',
        $push: { timeline: { status: 'cancelled', note: note ?? 'Cancelled by user', timestamp: new Date() } },
      },
      { new: true },
    );
  }

  async findDeliveredOrderWithProduct(userId: string, productId: string) {
    return this._model.findOne({
      userId,
      status: 'delivered',
      'items.productId': productId,
    }).select('_id');
  }

  async markPaymentFailed(razorpayOrderId: string) {
    return this._model.findOneAndUpdate(
      { 'payment.razorpayOrderId': razorpayOrderId, 'payment.status': 'pending' },
      {
        'payment.status': 'failed',
        $push: { timeline: { status: 'pending', note: 'Payment failed', timestamp: new Date() } },
      },
      { new: true },
    );
  }

  /**
   * Atomically claims the wallet refund for an employee order. Returns the order
   * only to the first caller that flips walletRefundedAt from null; all subsequent
   * callers (a concurrent cancel + a payment.failed webhook on the same order) get
   * null and must NOT re-credit. This is the at-most-once guard for wallet refunds.
   */
  async markWalletRefunded(orderId: string) {
    return this._model.findOneAndUpdate(
      { orderId, orderType: 'employee', walletApplied: { $gt: 0 }, walletRefundedAt: null },
      { $set: { walletRefundedAt: new Date() } },
      { new: true },
    );
  }

  async markRefunded(orderId: string) {
    return this._model.findOneAndUpdate(
      { orderId },
      {
        'payment.status': 'refunded',
        status: 'refunded',
        $push: { timeline: { status: 'refunded', note: 'Refund initiated', timestamp: new Date() } },
      },
      { new: true },
    );
  }
}
