import mongoose from 'mongoose';
import { BadRequestError } from '../errors/bad-request.error';
import { NotFoundError } from '../errors/not-found.error';
import { CartRepository } from '../repository/cart.repository';
import { ProductVariantRepository } from '../repository/productVariant.repository';
import { ProductRepository } from '../repository/product.repository';
import { guestCartCacheManager, IGuestCart, IGuestCartItem } from './cache/entities';
import { ICartItem } from '../models/cart.model';
import couponService from './coupon.service';
import { getEffectivePrice } from '../utils/flash-sale.util';
import config from '../config';

const MAX_QTY_PER_ITEM = config.MAX_CART_QTY_PER_ITEM;

interface ICartActor {
  userId?: string;
  sessionId: string;
}

interface ICartItemDisplay {
  variantId: string;
  productId: string;
  productName: string;
  productSlug: string;
  sku: string;
  image: string;
  attributeLabels: string[];
  priceSnapshot: number;
  originalPriceSnapshot: number;
  currentPrice: number;
  priceChanged: boolean;
  qty: number;
  moq: number;
  belowMoq: boolean;
}

interface ICartResponse {
  sessionId: string;
  items: ICartItemDisplay[];
  subtotal: number;
  coupon: { code: string; discountAmount: number } | null;
  total: number;
  itemCount: number;
  hasPriceChanges: boolean;
  hasMoqViolations: boolean;
}

class CartService {
  constructor(
    private readonly _cartRepository: CartRepository,
    private readonly _variantRepository: ProductVariantRepository,
    private readonly _productRepository: ProductRepository,
  ) {}

  async getCart(actor: ICartActor): Promise<ICartResponse> {
    if (actor.userId) {
      const cart = await this._cartRepository.findByUserId(actor.userId);
      const items = this._mongoItemsToDisplay(cart?.items ?? []);
      return this._buildResponse(actor.sessionId, items, cart?.coupon ?? null);
    }
    const guestCart = await guestCartCacheManager.get({ sessionId: actor.sessionId });
    return this._buildResponse(actor.sessionId, guestCart?.items ?? [], guestCart?.coupon ?? null);
  }

  async addItem(actor: ICartActor, variantId: string, qty: number): Promise<ICartResponse> {
    if (qty < 1) throw new BadRequestError('qty must be at least 1');
    if (qty > MAX_QTY_PER_ITEM) throw new BadRequestError(`Maximum ${MAX_QTY_PER_ITEM} units per item`);

    const variant = await this._variantRepository.findById(variantId);
    if (!variant || !variant.isActive) throw new NotFoundError('Product variant not found or unavailable');
    if (variant.stock < 1) throw new BadRequestError('This variant is out of stock');

    const product = await this._productRepository.findById(variant.product.toString());
    if (!product || !product.isActive) throw new NotFoundError('Product not found');

    const effectivePrice = getEffectivePrice(variant);
    const newItem: IGuestCartItem = {
      variantId: variant._id.toString(),
      productId: product._id.toString(),
      productName: product.name,
      productSlug: product.slug,
      sku: variant.sku,
      image: product.images[0] ?? '',
      attributeLabels: variant.attributes.map(a => a.valueLabel),
      priceSnapshot: effectivePrice.price,
      originalPriceSnapshot: effectivePrice.originalPrice,
      qty,
    };

    if (actor.userId) {
      const mongoItem: ICartItem = {
        variantId: new mongoose.Types.ObjectId(variantId),
        productId: new mongoose.Types.ObjectId(product._id.toString()),
        productName: product.name,
        productSlug: product.slug,
        sku: variant.sku,
        image: product.images[0] ?? '',
        attributeLabels: variant.attributes.map(a => a.valueLabel),
        priceSnapshot: effectivePrice.price,
        originalPriceSnapshot: effectivePrice.originalPrice,
        qty,
      };

      const existingCart = await this._cartRepository.findByUserId(actor.userId);
      const existingItem = existingCart?.items.find(
        i => i.variantId.toString() === variantId,
      );
      if (existingItem) mongoItem.qty = Math.min(existingItem.qty + qty, MAX_QTY_PER_ITEM);

      const cart = await this._cartRepository.upsertItem(actor.userId, mongoItem);
      return this._buildResponse(actor.sessionId, this._mongoItemsToDisplay(cart?.items ?? []), cart?.coupon ?? null);
    }

    const guestCart = await this._getGuestCart(actor.sessionId);
    const existingIdx = guestCart.items.findIndex(i => i.variantId === variantId);

    if (existingIdx >= 0) {
      guestCart.items[existingIdx].qty = Math.min(guestCart.items[existingIdx].qty + qty, MAX_QTY_PER_ITEM);
      guestCart.items[existingIdx].priceSnapshot = variant.price;
      guestCart.items[existingIdx].originalPriceSnapshot = variant.originalPrice;
    } else {
      guestCart.items.push(newItem);
    }

    guestCart.updatedAt = new Date().toISOString();
    await guestCartCacheManager.set({ sessionId: actor.sessionId }, guestCart);

    return this._buildResponse(actor.sessionId, guestCart.items, guestCart.coupon);
  }

  async updateItemQty(actor: ICartActor, variantId: string, qty: number): Promise<ICartResponse> {
    if (qty < 1) throw new BadRequestError('qty must be at least 1');
    if (qty > MAX_QTY_PER_ITEM) throw new BadRequestError(`Maximum ${MAX_QTY_PER_ITEM} units per item`);

    if (actor.userId) {
      const cart = await this._cartRepository.findByUserId(actor.userId);
      const exists = cart?.items.some(i => i.variantId.toString() === variantId);
      if (!exists) throw new NotFoundError('Item not found in cart');

      const updated = await this._cartRepository.updateItemQty(actor.userId, variantId, qty);
      return this._buildResponse(actor.sessionId, this._mongoItemsToDisplay(updated?.items ?? []), updated?.coupon ?? null);
    }

    const guestCart = await this._getGuestCart(actor.sessionId);
    const idx = guestCart.items.findIndex(i => i.variantId === variantId);
    if (idx < 0) throw new NotFoundError('Item not found in cart');

    guestCart.items[idx].qty = qty;
    guestCart.updatedAt = new Date().toISOString();
    await guestCartCacheManager.set({ sessionId: actor.sessionId }, guestCart);

    return this._buildResponse(actor.sessionId, guestCart.items, guestCart.coupon);
  }

  async removeItem(actor: ICartActor, variantId: string): Promise<ICartResponse> {
    if (actor.userId) {
      const updated = await this._cartRepository.removeItem(actor.userId, variantId);
      return this._buildResponse(actor.sessionId, this._mongoItemsToDisplay(updated?.items ?? []), updated?.coupon ?? null);
    }

    const guestCart = await this._getGuestCart(actor.sessionId);
    guestCart.items = guestCart.items.filter(i => i.variantId !== variantId);
    guestCart.updatedAt = new Date().toISOString();
    await guestCartCacheManager.set({ sessionId: actor.sessionId }, guestCart);

    return this._buildResponse(actor.sessionId, guestCart.items, guestCart.coupon);
  }

  async clearCart(actor: ICartActor): Promise<boolean> {
    if (actor.userId) {
      await this._cartRepository.clearItems(actor.userId);
    } else {
      await guestCartCacheManager.remove({ sessionId: actor.sessionId });
    }
    return true;
  }

  async mergeGuestCart(userId: string, sessionId: string): Promise<ICartResponse> {
    const guestCart = await guestCartCacheManager.get({ sessionId });

    if (!guestCart || !guestCart.items.length) {
      const userCart = await this._cartRepository.findOrCreate(userId);
      return this._buildResponse(sessionId, this._mongoItemsToDisplay(userCart.items), userCart.coupon);
    }

    const userCart = await this._cartRepository.findOrCreate(userId);
    const mergedItems: ICartItem[] = [...userCart.items];

    const guestVariantIds = guestCart.items.map(i => i.variantId);
    const liveVariants = await this._variantRepository.findByIds(guestVariantIds);
    const liveVariantMap = new Map(liveVariants.map(v => [v._id.toString(), v]));

    for (const guestItem of guestCart.items) {
      const liveVariant = liveVariantMap.get(guestItem.variantId);
      if (!liveVariant || !liveVariant.isActive || liveVariant.stock < 1) continue;

      const existingIdx = mergedItems.findIndex(
        i => i.variantId.toString() === guestItem.variantId,
      );

      if (existingIdx >= 0) {
        mergedItems[existingIdx].qty = Math.min(
          mergedItems[existingIdx].qty + guestItem.qty,
          MAX_QTY_PER_ITEM,
        );
      } else {
        const mergeEffectivePrice = getEffectivePrice(liveVariant);
        mergedItems.push({
          variantId: new mongoose.Types.ObjectId(guestItem.variantId),
          productId: new mongoose.Types.ObjectId(guestItem.productId),
          productName: guestItem.productName,
          productSlug: guestItem.productSlug,
          sku: guestItem.sku,
          image: guestItem.image,
          attributeLabels: guestItem.attributeLabels,
          priceSnapshot: mergeEffectivePrice.price,
          originalPriceSnapshot: mergeEffectivePrice.originalPrice,
          qty: guestItem.qty,
        });
      }
    }

    let finalCart = await this._cartRepository.setItems(userId, mergedItems);
    await guestCartCacheManager.remove({ sessionId });

    // Carry over guest coupon if user cart has none
    if (guestCart.coupon && !userCart.coupon) {
      try {
        const mergedSubtotal = mergedItems.reduce((sum, i) => sum + i.priceSnapshot * i.qty, 0);
        const { coupon, discountAmount } = await couponService.validateAndComputeDiscount({
          code: guestCart.coupon.code,
          cartSubtotal: mergedSubtotal,
          cartItems: mergedItems.map(i => ({ productId: i.productId.toString() })),
          userId,
        });
        finalCart = await this._cartRepository.setCoupon(userId, {
          code: coupon.code,
          discountAmount,
          couponId: new mongoose.Types.ObjectId(coupon._id.toString()),
        });
      } catch {
        // Coupon no longer valid — silently discard
      }
    }

    return this._buildResponse(sessionId, this._mongoItemsToDisplay(finalCart?.items ?? []), finalCart?.coupon ?? null);
  }

  async applyCoupon(actor: ICartActor, code: string): Promise<ICartResponse> {
    const rawItems = await this._getRawItems(actor);
    if (!rawItems.length) throw new BadRequestError('Cannot apply coupon to an empty cart');

    const subtotal = rawItems.reduce((sum, i) => sum + i.priceSnapshot * i.qty, 0);
    const cartItemsForValidation = rawItems.map(i => ({ productId: i.productId }));

    const { coupon, discountAmount } = await couponService.validateAndComputeDiscount({
      code,
      cartSubtotal: subtotal,
      cartItems: cartItemsForValidation,
      userId: actor.userId,
    });

    if (actor.userId) {
      const updated = await this._cartRepository.setCoupon(actor.userId, {
        code: coupon.code,
        discountAmount,
        couponId: new mongoose.Types.ObjectId(coupon._id.toString()),
      });
      return this._buildResponse(
        actor.sessionId,
        this._mongoItemsToDisplay(updated?.items ?? []),
        updated?.coupon ?? null,
      );
    }

    const guestCart = await this._getGuestCart(actor.sessionId);
    guestCart.coupon = { code: coupon.code, discountAmount, couponId: coupon._id.toString() };
    guestCart.updatedAt = new Date().toISOString();
    await guestCartCacheManager.set({ sessionId: actor.sessionId }, guestCart);

    return this._buildResponse(actor.sessionId, guestCart.items, guestCart.coupon);
  }

  async removeCoupon(actor: ICartActor): Promise<ICartResponse> {
    if (actor.userId) {
      const updated = await this._cartRepository.setCoupon(actor.userId, null);
      return this._buildResponse(
        actor.sessionId,
        this._mongoItemsToDisplay(updated?.items ?? []),
        null,
      );
    }

    const guestCart = await this._getGuestCart(actor.sessionId);
    guestCart.coupon = null;
    guestCart.updatedAt = new Date().toISOString();
    await guestCartCacheManager.set({ sessionId: actor.sessionId }, guestCart);

    return this._buildResponse(actor.sessionId, guestCart.items, null);
  }

  private async _getRawItems(actor: ICartActor): Promise<IGuestCartItem[]> {
    if (actor.userId) {
      const cart = await this._cartRepository.findByUserId(actor.userId);
      return this._mongoItemsToDisplay(cart?.items ?? []);
    }
    const guestCart = await guestCartCacheManager.get({ sessionId: actor.sessionId });
    return guestCart?.items ?? [];
  }

  private _mongoItemsToDisplay(items: ICartItem[]): IGuestCartItem[] {
    return items.map(i => ({
      variantId: i.variantId.toString(),
      productId: i.productId.toString(),
      productName: i.productName,
      productSlug: i.productSlug,
      sku: i.sku,
      image: i.image,
      attributeLabels: i.attributeLabels,
      priceSnapshot: i.priceSnapshot,
      originalPriceSnapshot: i.originalPriceSnapshot,
      qty: i.qty,
    }));
  }

  private async _buildResponse(
    sessionId: string,
    items: IGuestCartItem[],
    coupon: { code: string; discountAmount: number; couponId: string } | { code: string; discountAmount: number; couponId: mongoose.Types.ObjectId } | null,
  ): Promise<ICartResponse> {
    const variantIds = items.map(i => i.variantId);
    const liveMeta = await this._fetchLiveVariantMeta(variantIds);

    const displayItems: ICartItemDisplay[] = items.map(item => {
      const meta = liveMeta.get(item.variantId);
      const currentPrice = meta?.price ?? item.priceSnapshot;
      // Unavailable variants have no known MOQ; default to 1 so they never falsely flag.
      const moq = meta?.moq ?? 1;
      return {
        ...item,
        currentPrice,
        priceChanged: currentPrice !== item.priceSnapshot,
        moq,
        belowMoq: item.qty < moq,
      };
    });

    const subtotal = displayItems.reduce((sum, i) => sum + i.priceSnapshot * i.qty, 0);
    const discountAmount = coupon?.discountAmount ?? 0;
    const total = Math.max(0, subtotal - discountAmount);

    return {
      sessionId,
      items: displayItems,
      subtotal,
      coupon: coupon ? { code: coupon.code, discountAmount: coupon.discountAmount } : null,
      total,
      itemCount: items.reduce((sum, i) => sum + i.qty, 0),
      hasPriceChanges: displayItems.some(i => i.priceChanged),
      hasMoqViolations: displayItems.some(i => i.belowMoq),
    };
  }

  private async _fetchLiveVariantMeta(variantIds: string[]): Promise<Map<string, { price: number; moq: number }>> {
    const map = new Map<string, { price: number; moq: number }>();
    if (!variantIds.length) return map;

    const variants = await this._variantRepository.findByIds(variantIds);
    for (const v of variants) map.set(v._id.toString(), { price: v.price, moq: v.moq });

    return map;
  }

  private async _getGuestCart(sessionId: string): Promise<IGuestCart> {
    const cart = await guestCartCacheManager.get({ sessionId });
    return cart ?? { sessionId, items: [], coupon: null, updatedAt: new Date().toISOString() };
  }
}

export default new CartService(
  new CartRepository(),
  new ProductVariantRepository(),
  new ProductRepository(),
);
