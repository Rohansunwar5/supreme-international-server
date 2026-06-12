import { customAlphabet } from 'nanoid';
import mongoose from 'mongoose';
import { BadRequestError } from '../errors/bad-request.error';
import { CartRepository } from '../repository/cart.repository';
import { ProductRepository } from '../repository/product.repository';
import { ProductVariantRepository } from '../repository/productVariant.repository';
import { CompanyCatalogRepository } from '../repository/companyCatalog.repository';
import { OrderRepository } from '../repository/order.repository';
import { CouponUsageRepository } from '../repository/couponUsage.repository';
import walletService from './wallet.service';
import couponService from './coupon.service';
import { createRazorpayOrder } from '../utils/razorpay.util';
import { getEffectivePrice } from '../utils/flash-sale.util';
import { IOrderItem, IShippingAddress } from '../models/order.model';
import config from '../config';

const generateOrderId = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 8);

interface IEmployeeCheckoutBody {
  shippingAddress: IShippingAddress;
  couponCode?: string;
}

class EmployeeCheckoutService {
  constructor(
    private readonly _cartRepository: CartRepository,
    private readonly _productRepository: ProductRepository,
    private readonly _variantRepository: ProductVariantRepository,
    private readonly _catalogRepository: CompanyCatalogRepository,
    private readonly _orderRepository: OrderRepository,
    private readonly _couponUsageRepository: CouponUsageRepository,
  ) {}

  async checkout(employeeId: string, companyId: string, body: IEmployeeCheckoutBody) {
    const cart = await this._cartRepository.findByUserId(employeeId);
    const items = cart?.items ?? [];
    if (!items.length) throw new BadRequestError('Cart is empty');

    // 1. Scope re-validation: every cart product must be in the company catalog scope.
    const catalog = await this._catalogRepository.findByCompanyId(companyId);
    const scope = {
      companyId,
      productIds: catalog ? catalog.productIds.map(id => id.toString()) : [],
      categoryIds: catalog ? catalog.categoryIds.map(id => id.toString()) : [],
    };
    const cartProductIds = [...new Set(items.map(i => i.productId.toString()))];
    const inScope = await this._productRepository.findEmployeeByIds(scope, cartProductIds);
    const inScopeIds = new Set(inScope.map(p => p._id.toString()));
    if (cartProductIds.some(id => !inScopeIds.has(id))) {
      throw new BadRequestError('A product in your cart is not available in your company catalog');
    }

    // 2. Re-price + stock check at live variant prices.
    const variantIds = items.map(i => i.variantId.toString());
    const liveVariants = await this._variantRepository.findByIds(variantIds);
    const liveMap = new Map(liveVariants.map(v => [v._id.toString(), v]));

    const orderItems: IOrderItem[] = [];
    for (const item of items) {
      const live = liveMap.get(item.variantId.toString());
      if (!live || !live.isActive) throw new BadRequestError('A product in your cart is no longer available.');
      if (live.stock < item.qty) throw new BadRequestError(`Insufficient stock for "${item.productName}". Only ${live.stock} left.`);
      const eff = getEffectivePrice(live);
      orderItems.push({
        variantId: new mongoose.Types.ObjectId(item.variantId.toString()),
        productId: new mongoose.Types.ObjectId(item.productId.toString()),
        sku: item.sku,
        productName: item.productName,
        attributeLabels: item.attributeLabels,
        image: item.image,
        qty: item.qty,
        priceAtPurchase: eff.price,
        originalPriceAtPurchase: eff.originalPrice,
      });
    }

    const subtotal = orderItems.reduce((sum, i) => sum + i.priceAtPurchase * i.qty, 0);

    // 3. Company coupon (optional).
    let couponDiscount = 0;
    let couponCode: string | null = null;
    let couponId: string | null = null;
    if (body.couponCode) {
      const { coupon, discountAmount } = await couponService.validateAndComputeDiscount({
        code: body.couponCode,
        cartSubtotal: subtotal,
        cartItems: orderItems.map(i => ({ productId: i.productId.toString() })),
        userId: employeeId,
        companyId,
      });
      couponDiscount = discountAmount;
      couponCode = coupon.code;
      couponId = coupon._id.toString();
    }

    // 4. Total. Employee gifting orders ship free (no shipping charge / tax).
    const shippingCharge = 0;
    const shippingTax = 0;
    const total = subtotal - couponDiscount + shippingCharge + shippingTax;

    // 5. Auto-apply wallet.
    const wallet = await walletService.getWallet(employeeId);
    const walletApplied = Math.min(wallet.balance, total);
    const remainder = total - walletApplied;

    const orderId = `SOV-${generateOrderId()}`;

    // 6. Reserve wallet (only if > 0). The $gte guard throws INSUFFICIENT_BALANCE on a concurrent drain.
    if (walletApplied > 0) {
      await walletService.debit(employeeId, companyId, walletApplied, `Order ${orderId}`, undefined, {
        source: 'order_redemption',
        referenceId: orderId,
      });
    }

    // After reservation, any failure must reverse the reserved credits (no order exists to cancel).
    try {
      const billing = { subtotal, couponCode, couponDiscount, shippingCharge, shippingTax, total };
      const baseOrder = {
        orderId,
        userId: employeeId,
        customerEmail: `${employeeId}@employee.local`,
        sessionId: null,
        items: orderItems,
        shippingAddress: body.shippingAddress,
        billing,
        couponId,
        employeeId,
        companyId,
        orderType: 'employee' as const,
        walletApplied,
      };

      // 7. Branch on remainder.
      if (remainder === 0) {
        await this._orderRepository.create({
          ...baseOrder,
          status: 'confirmed',
          payment: { gateway: 'wallet', razorpayOrderId: null, razorpayPaymentId: null, razorpaySignature: null, status: 'paid', method: 'wallet', paidAt: new Date() },
        });
        // Confirm immediately: decrement stock + clear the cart (no webhook will arrive).
        await Promise.all(orderItems.map(i => this._variantRepository.adjustStock(i.variantId.toString(), -i.qty)));
        // Record coupon usage here too — wallet-only orders never reach the payment
        // webhook, so without this a company coupon's usageLimit/perUserLimit would
        // never decrement and could be redeemed an unlimited number of times.
        if (couponId) {
          await Promise.all([
            this._couponUsageRepository.create({ couponId, userId: employeeId, orderId }),
            couponService.incrementUsage(couponId),
          ]);
        }
        await this._cartRepository.clearItems(employeeId);
        return { orderId, walletApplied, remainder: 0, fullyPaidByWallet: true };
      }

      const razorpayOrder = await createRazorpayOrder({
        amountInPaise: Math.round(remainder * 100),
        receipt: orderId,
        notes: { orderId },
      });
      await this._orderRepository.create({
        ...baseOrder,
        payment: { gateway: 'razorpay', razorpayOrderId: razorpayOrder.id, razorpayPaymentId: null, razorpaySignature: null, status: 'pending', method: null, paidAt: null },
      });

      return {
        orderId,
        walletApplied,
        remainder,
        fullyPaidByWallet: false,
        razorpayOrderId: razorpayOrder.id,
        razorpayKeyId: config.RAZORPAY_KEY_ID,
        amountInPaise: Math.round(remainder * 100),
        currency: 'INR',
      };
    } catch (err) {
      if (walletApplied > 0) {
        await walletService.credit(employeeId, companyId, walletApplied, `Reversal for failed order ${orderId}`, undefined, {
          source: 'refund',
          referenceId: orderId,
        });
      }
      throw err;
    }
  }
}

export default new EmployeeCheckoutService(
  new CartRepository(),
  new ProductRepository(),
  new ProductVariantRepository(),
  new CompanyCatalogRepository(),
  new OrderRepository(),
  new CouponUsageRepository(),
);
