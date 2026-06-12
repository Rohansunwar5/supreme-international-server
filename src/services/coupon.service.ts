import { BadRequestError } from '../errors/bad-request.error';
import { NotFoundError } from '../errors/not-found.error';
import { CouponRepository, ICreateCouponParams } from '../repository/coupon.repository';
import { CouponUsageRepository } from '../repository/couponUsage.repository';
import { ProductRepository } from '../repository/product.repository';
import { ICoupon } from '../models/coupon.model';

interface IValidateCouponParams {
  code: string;
  cartSubtotal: number;
  cartItems: { productId: string }[];
  userId?: string;
  companyId?: string;
}

interface IValidateCouponResult {
  coupon: ICoupon;
  discountAmount: number;
}

class CouponService {
  constructor(
    private readonly _couponRepository: CouponRepository,
    private readonly _couponUsageRepository: CouponUsageRepository,
    private readonly _productRepository: ProductRepository,
  ) {}

  async validateAndComputeDiscount(params: IValidateCouponParams): Promise<IValidateCouponResult> {
    const coupon = await this._couponRepository.findByCode(params.code);
    if (!coupon || !coupon.isActive) throw new BadRequestError('Invalid or inactive coupon code');

    const couponCompanyId = coupon.companyId ? coupon.companyId.toString() : null;
    if (params.companyId) {
      // Employee checkout: only this company's coupons are valid.
      if (couponCompanyId !== params.companyId) throw new BadRequestError('This coupon is not valid for your company');
    } else if (couponCompanyId) {
      // Standard checkout: company-scoped coupons are not allowed.
      throw new BadRequestError('Invalid or inactive coupon code');
    }

    const now = new Date();
    if (now < coupon.startsAt) throw new BadRequestError('Coupon is not yet active');
    if (coupon.expiresAt && now > coupon.expiresAt) throw new BadRequestError('Coupon has expired');

    if (params.cartSubtotal < coupon.minOrderValue)
      throw new BadRequestError(`Minimum order value of ₹${coupon.minOrderValue} required to use this coupon`);

    if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit)
      throw new BadRequestError('This coupon has reached its usage limit');

    if (coupon.perUserLimit > 0 && params.userId) {
      const used = await this._couponUsageRepository.countByUserAndCoupon(
        coupon._id.toString(),
        params.userId,
      );
      if (used >= coupon.perUserLimit)
        throw new BadRequestError('You have already used this coupon the maximum number of times');
    }

    if (coupon.applicableProducts.length > 0 || coupon.applicableCategories.length > 0) {
      await this._checkApplicability(coupon, params.cartItems);
    }

    const discountAmount = this._computeDiscount(coupon, params.cartSubtotal);

    return { coupon, discountAmount };
  }

  async createCoupon(params: ICreateCouponParams) {
    const exists = await this._couponRepository.codeExists(params.code);
    if (exists) throw new BadRequestError(`Coupon code '${params.code.toUpperCase()}' already exists`);

    if (params.expiresAt && params.expiresAt <= params.startsAt)
      throw new BadRequestError('expiresAt must be after startsAt');

    if (params.type === 'percent' && params.value > 100)
      throw new BadRequestError('Percent discount value cannot exceed 100');

    return this._couponRepository.create(params);
  }

  async updateCoupon(
    id: string,
    params: Partial<Omit<ICreateCouponParams, 'createdBy'>>,
  ) {
    const coupon = await this._couponRepository.findById(id);
    if (!coupon) throw new NotFoundError('Coupon not found');

    if (params.code && params.code.toUpperCase() !== coupon.code) {
      const exists = await this._couponRepository.codeExists(params.code, id);
      if (exists) throw new BadRequestError(`Coupon code '${params.code.toUpperCase()}' already exists`);
    }

    if (params.type === 'percent' && (params.value ?? coupon.value) > 100)
      throw new BadRequestError('Percent discount value cannot exceed 100');

    const startsAt = params.startsAt ?? coupon.startsAt;
    const expiresAt = params.expiresAt !== undefined ? params.expiresAt : coupon.expiresAt;
    if (expiresAt && expiresAt <= startsAt)
      throw new BadRequestError('expiresAt must be after startsAt');

    return this._couponRepository.update(id, params);
  }

  async listCoupons() {
    return this._couponRepository.findAll();
  }

  async getCouponById(id: string) {
    const coupon = await this._couponRepository.findById(id);
    if (!coupon) throw new NotFoundError('Coupon not found');
    return coupon;
  }

  async deactivateCoupon(id: string) {
    const coupon = await this._couponRepository.findById(id);
    if (!coupon) throw new NotFoundError('Coupon not found');
    return this._couponRepository.deactivate(id);
  }

  async incrementUsage(couponId: string) {
    await this._couponRepository.incrementUsage(couponId);
  }

  private _computeDiscount(coupon: ICoupon, subtotal: number): number {
    let amount: number;

    if (coupon.type === 'flat') {
      amount = coupon.value;
    } else {
      amount = Math.floor((subtotal * coupon.value) / 100);
      if (coupon.maxDiscountAmount > 0) amount = Math.min(amount, coupon.maxDiscountAmount);
    }

    return Math.min(amount, subtotal);
  }

  private async _checkApplicability(
    coupon: ICoupon,
    cartItems: { productId: string }[],
  ): Promise<void> {
    const cartProductIds = cartItems.map(i => i.productId);

    if (coupon.applicableProducts.length > 0) {
      const applicableProductIds = coupon.applicableProducts.map(id => id.toString());
      if (cartProductIds.some(id => applicableProductIds.includes(id))) return;
    }

    if (coupon.applicableCategories.length > 0) {
      const products = await this._productRepository.findByIds(cartProductIds);
      const applicableCategoryIds = coupon.applicableCategories.map(id => id.toString());
      if (products.some(p => applicableCategoryIds.includes(p.category.toString()))) return;
    }

    throw new BadRequestError('This coupon is not applicable to items in your cart');
  }
}

export default new CouponService(
  new CouponRepository(),
  new CouponUsageRepository(),
  new ProductRepository(),
);
