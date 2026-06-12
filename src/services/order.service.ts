import { BadRequestError } from '../errors/bad-request.error';
import { NotFoundError } from '../errors/not-found.error';
import { UnauthorizedError } from '../errors/unauthorized.error';
import { OrderRepository } from '../repository/order.repository';
import { ProductVariantRepository } from '../repository/productVariant.repository';
import { CartRepository } from '../repository/cart.repository';
import { CouponUsageRepository } from '../repository/couponUsage.repository';
import { guestCartCacheManager } from './cache/entities';
import { verifyWebhookSignature } from '../utils/razorpay.util';
import { OrderStatus, ITrackingInfo } from '../models/order.model';
import couponService from './coupon.service';
import walletService from './wallet.service';
import mailService from './mail.service';

class OrderService {
  constructor(
    private readonly _orderRepository: OrderRepository,
    private readonly _variantRepository: ProductVariantRepository,
    private readonly _cartRepository: CartRepository,
    private readonly _couponUsageRepository: CouponUsageRepository,
  ) { }

  async processWebhook(rawBody: Buffer, signature: string, payload: Record<string, unknown>) {
    const valid = verifyWebhookSignature(rawBody, signature);
    if (!valid) throw new UnauthorizedError('Invalid webhook signature');

    const event = payload.event as string;

    if (event === 'payment.failed') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const failedEntity = ((payload.payload as any)?.payment?.entity ?? {}) as Record<string, string>;
      const failedRazorpayOrderId = failedEntity['order_id'];
      if (failedRazorpayOrderId) {
        const failedOrder = await this._orderRepository.markPaymentFailed(failedRazorpayOrderId);
        if (failedOrder) await this._refundReservedWallet(failedOrder);
      }
      return { received: true };
    }

    if (event !== 'payment.captured') return { received: true };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const paymentEntity = ((payload.payload as any)?.payment?.entity ?? {}) as Record<string, string>;
    const razorpayOrderId = paymentEntity['order_id'];
    const razorpayPaymentId = paymentEntity['id'];
    const razorpaySignature = paymentEntity['signature'] ?? null;
    const method = paymentEntity['method'] ?? null;

    if (!razorpayOrderId || !razorpayPaymentId)
      return { received: true };

    const order = await this._orderRepository.confirmPayment({
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature: razorpaySignature ?? '',
      method,
    });

    if (!order) return { received: true }; // already processed or not found

    // Decrement stock atomically; filter prevents going below 0 on duplicate webhooks
    await Promise.all(
      order.items.map(item =>
        this._variantRepository.adjustStock(item.variantId.toString(), -item.qty),
      ),
    );
    // Note: adjustStock returns null if stock < qty (already decremented by a prior webhook retry).
    // We intentionally don't throw here — the order is confirmed and goods will ship.

    // Record coupon usage + increment count
    if (order.couponId && order.userId) {
      await Promise.all([
        this._couponUsageRepository.create({
          couponId: order.couponId.toString(),
          userId: order.userId.toString(),
          orderId: order._id.toString(),
        }),
        couponService.incrementUsage(order.couponId.toString()),
      ]);
    } else if (order.couponId) {
      await couponService.incrementUsage(order.couponId.toString());
    }

    // Clear cart
    if (order.userId) {
      await this._cartRepository.clearItems(order.userId.toString());
    } else if (order.sessionId) {
      await guestCartCacheManager.remove({ sessionId: order.sessionId });
    }

    // Send confirmation email to all customers (fire-and-forget)
    mailService.sendOrderConfirmationEmail(order.customerEmail, {
      orderId: order.orderId,
      total: order.billing.total,
      items: order.items,
    }).catch(() => null);

    return { received: true };
  }

  async getOrder(orderId: string, userId?: string, guestEmail?: string) {
    const order = await this._orderRepository.findByOrderId(orderId);
    if (!order) throw new NotFoundError('Order not found');

    if (order.userId) {
      if (!userId || order.userId.toString() !== userId)
        throw new UnauthorizedError('Access denied');
    } else {
      if (!guestEmail || order.customerEmail.toLowerCase() !== guestEmail.toLowerCase())
        throw new UnauthorizedError('Access denied');
    }

    return order;
  }

  async getUserOrders(userId: string, page: number, limit: number) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(20, Math.max(1, limit));
    const { docs, total } = await this._orderRepository.findByUserId(userId, safePage, safeLimit);
    return { orders: docs, pagination: { total, page: safePage, limit: safeLimit, pages: Math.ceil(total / safeLimit) } };
  }

  async cancelOrder(orderId: string, userId: string) {
    const order = await this._orderRepository.findByOrderId(orderId);
    if (!order) throw new NotFoundError('Order not found');
    if (!order.userId || order.userId.toString() !== userId)
      throw new UnauthorizedError('Access denied');
    if (!['pending', 'confirmed'].includes(order.status))
      throw new BadRequestError(`Cannot cancel an order in '${order.status}' status`);

    const cancelled = await this._orderRepository.markCancelled(orderId, 'Cancelled by customer');
    if (!cancelled) throw new BadRequestError('Order could not be cancelled — status may have changed');

    // Restore stock if payment was already captured (confirmed status)
    if (order.status === 'confirmed') {
      await Promise.all(
        order.items.map(item =>
          this._variantRepository.adjustStock(item.variantId.toString(), item.qty),
        ),
      );
    }

    await this._refundReservedWallet(order);

    return cancelled;
  }

  private async _refundReservedWallet(order: {
    orderId: string;
    orderType?: string;
    walletApplied?: number;
    employeeId?: { toString(): string } | null;
    companyId?: { toString(): string } | null;
  }) {
    if (order.orderType !== 'employee' || !order.walletApplied || order.walletApplied <= 0) return;
    if (!order.employeeId || !order.companyId) return;
    await walletService.credit(
      order.employeeId.toString(),
      order.companyId.toString(),
      order.walletApplied,
      `Refund for order ${order.orderId}`,
      undefined,
      { source: 'refund', referenceId: order.orderId },
    );
  }

  async adminListOrders(filter: {
    status?: OrderStatus;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, Number(filter.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(filter.limit) || 20));
    const { docs, total } = await this._orderRepository.findAllAdmin(
      {
        status: filter.status,
        dateFrom: filter.dateFrom ? new Date(filter.dateFrom) : undefined,
        dateTo: filter.dateTo ? new Date(filter.dateTo) : undefined,
      },
      page,
      limit,
    );
    return {
      orders: docs,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }

  async adminGetOrder(orderId: string) {
    const order = await this._orderRepository.findByOrderId(orderId);
    if (!order) throw new NotFoundError('Order not found');
    return order;
  }

  async adminUpdateStatus(
    orderId: string,
    status: OrderStatus,
    note?: string,
    trackingInfo?: ITrackingInfo,
  ) {
    const order = await this._orderRepository.findByOrderId(orderId);
    if (!order) throw new NotFoundError('Order not found');

    const validTransitions: Record<OrderStatus, OrderStatus[]> = {
      pending: ['confirmed', 'cancelled'],
      confirmed: ['processing', 'cancelled'],
      processing: ['shipped'],
      shipped: ['delivered'],
      delivered: ['refunded'],
      cancelled: [],
      refunded: [],
    };

    if (!validTransitions[order.status].includes(status))
      throw new BadRequestError(`Cannot transition from '${order.status}' to '${status}'`);

    const updated = await this._orderRepository.updateStatus(orderId, status, note, trackingInfo);
    if (!updated) throw new BadRequestError('Order status could not be updated — it may have changed concurrently');

    // Restore stock if admin cancels a confirmed order
    if (status === 'cancelled' && order.status === 'confirmed') {
      await Promise.all(
        order.items.map(item =>
          this._variantRepository.adjustStock(item.variantId.toString(), item.qty),
        ),
      );
    }

    return updated;
  }

  async retryPayment(orderId: string, userId: string) {
    const order = await this._orderRepository.findByOrderId(orderId);
    if (!order) throw new NotFoundError('Order not found');
    if (!order.userId || order.userId.toString() !== userId)
      throw new UnauthorizedError('Access denied');
    if (!['pending', 'failed'].includes(order.payment.status))
      throw new BadRequestError('This order cannot be retried — payment has already been captured or refunded');

    // Razorpay orders are reusable: return the existing order credentials so the
    // client can reopen the Razorpay checkout modal without creating a new order.
    return {
      orderId: order.orderId,
      razorpayOrderId: order.payment.razorpayOrderId,
      amount: order.billing.total,
      amountInPaise: Math.round(order.billing.total * 100),
      currency: 'INR',
    };
  }

  async adminInitiateRefund(orderId: string) {
    const order = await this._orderRepository.findByOrderId(orderId);
    if (!order) throw new NotFoundError('Order not found');
    if (order.payment.status !== 'paid')
      throw new BadRequestError('Only paid orders can be refunded');

    // Razorpay refund API integration: left for production setup
    // as it requires manual review workflow in most cases
    return this._orderRepository.markRefunded(orderId);
  }
}

export default new OrderService(
  new OrderRepository(),
  new ProductVariantRepository(),
  new CartRepository(),
  new CouponUsageRepository(),
);
