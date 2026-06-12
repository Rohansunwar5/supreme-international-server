import couponModel from '../models/coupon.model';

export interface ICreateCouponParams {
  code: string;
  description?: string;
  type: 'flat' | 'percent';
  value: number;
  minOrderValue?: number;
  maxDiscountAmount?: number;
  usageLimit?: number;
  perUserLimit?: number;
  applicableCategories?: string[];
  applicableProducts?: string[];
  startsAt: Date;
  expiresAt?: Date | null;
  createdBy: string;
  companyId?: string;
}

export class CouponRepository {
  private _model = couponModel;

  async create(params: ICreateCouponParams) {
    return this._model.create({ ...params, code: params.code.toUpperCase() });
  }

  async findByCode(code: string) {
    return this._model.findOne({ code: code.toUpperCase() });
  }

  async findById(id: string) {
    return this._model.findById(id);
  }

  async findAll(filter?: { isActive?: boolean }) {
    const query: Record<string, unknown> = {};
    if (filter?.isActive !== undefined) query.isActive = filter.isActive;
    return this._model.find(query).sort({ createdAt: -1 });
  }

  async update(id: string, params: Partial<Omit<ICreateCouponParams, 'createdBy'>>) {
    const update = { ...params };
    if (update.code) update.code = update.code.toUpperCase();
    return this._model.findByIdAndUpdate(id, update, { new: true });
  }

  async incrementUsage(id: string) {
    await this._model.findByIdAndUpdate(id, { $inc: { usedCount: 1 } });
  }

  async deactivate(id: string) {
    return this._model.findByIdAndUpdate(id, { isActive: false }, { new: true });
  }

  async codeExists(code: string, excludeId?: string) {
    const query: Record<string, unknown> = { code: code.toUpperCase() };
    if (excludeId) query._id = { $ne: excludeId };
    const doc = await this._model.findOne(query).select('_id');
    return !!doc;
  }
}
