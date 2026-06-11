import mongoose from 'mongoose';
import productVariantModel, { IProductVariant } from '../models/productVariant.model';

export interface ICreateVariantParams {
  product: string;
  sku: string;
  price: number;
  originalPrice: number;
  stock: number;
  moq?: number;
  images?: string[];
  attributes: {
    attributeId: string;
    attributeName: string;
    attributeSlug: string;
    valueId: string;
    valueLabel: string;
    valueSlug: string;
    valueMeta?: Record<string, string>;
  }[];
  variantKey: string;
}

export class ProductVariantRepository {
  private _model = productVariantModel;

  async create(params: ICreateVariantParams): Promise<IProductVariant> {
    return this._model.create(params);
  }

  async bulkCreate(params: ICreateVariantParams[]): Promise<IProductVariant[]> {
    return this._model.insertMany(params) as unknown as IProductVariant[];
  }

  async findById(id: string): Promise<IProductVariant | null> {
    return this._model.findById(id);
  }

  async findByIds(ids: string[]): Promise<IProductVariant[]> {
    return this._model.find({ _id: { $in: ids } });
  }

  async findByProductId(productId: string, onlyActive = true): Promise<IProductVariant[]> {
    const filter: Record<string, unknown> = { product: productId };
    if (onlyActive) filter.isActive = true;
    return this._model.find(filter).sort({ price: 1 });
  }

  async findByVariantKey(productId: string, variantKey: string): Promise<IProductVariant | null> {
    return this._model.findOne({ product: productId, variantKey });
  }

  async variantKeyExists(productId: string, variantKey: string): Promise<boolean> {
    const doc = await this._model.findOne({ product: productId, variantKey }).select('_id');
    return !!doc;
  }

  async skuExists(sku: string): Promise<boolean> {
    const doc = await this._model.findOne({ sku }).select('_id');
    return !!doc;
  }

  async update(
    id: string,
    params: Partial<Pick<ICreateVariantParams, 'price' | 'originalPrice' | 'stock' | 'moq' | 'images' | 'sku'> & { isActive: boolean }>,
  ): Promise<IProductVariant | null> {
    return this._model.findByIdAndUpdate(id, params, { new: true });
  }

  async adjustStock(id: string, delta: number): Promise<IProductVariant | null> {
    const filter = delta < 0
      ? { _id: id, stock: { $gte: Math.abs(delta) } }
      : { _id: id };
    return this._model.findOneAndUpdate(filter, { $inc: { stock: delta } }, { new: true });
  }

  async softDelete(id: string): Promise<IProductVariant | null> {
    return this._model.findByIdAndUpdate(id, { isActive: false }, { new: true });
  }

  async getMinPriceByProductIds(
    productIds: string[],
  ): Promise<{ _id: string; minPrice: number; originalMinPrice: number }[]> {
    const now = new Date();
    return this._model.aggregate([
      { $match: { product: { $in: productIds.map(id => new mongoose.Types.ObjectId(id)) }, isActive: true } },
      {
        $addFields: {
          effectivePrice: {
            $cond: [
              { $and: [
                { $ne: ['$flashSalePrice', null] },
                { $gt: ['$flashSaleEndsAt', now] },
              ]},
              '$flashSalePrice',
              '$price',
            ],
          },
        },
      },
      {
        $group: {
          _id: '$product',
          minPrice: { $min: '$effectivePrice' },
          originalMinPrice: { $min: '$originalPrice' },
        },
      },
    ]);
  }

  async setFlashSale(id: string, flashSalePrice: number | null, flashSaleEndsAt: Date | null): Promise<IProductVariant | null> {
    return this._model.findByIdAndUpdate(id, { flashSalePrice, flashSaleEndsAt }, { new: true });
  }

  async findDistinctProductIdsByFilters(params: {
    valueIds?: string[];
    minPrice?: number;
    maxPrice?: number;
  }): Promise<string[]> {
    const match: Record<string, unknown> = { isActive: true };

    if (params.valueIds?.length) {
      match['attributes.valueId'] = {
        $all: params.valueIds.map(id => new mongoose.Types.ObjectId(id)),
      };
    }
    if (params.minPrice !== undefined || params.maxPrice !== undefined) {
      const priceRange: Record<string, number> = {};
      if (params.minPrice !== undefined) priceRange.$gte = params.minPrice;
      if (params.maxPrice !== undefined) priceRange.$lte = params.maxPrice;
      match.price = priceRange;
    }

    const results = await this._model.aggregate([
      { $match: match },
      { $group: { _id: '$product' } },
    ]);

    return results.map(r => r._id.toString());
  }

  async getLowStock(threshold: number): Promise<IProductVariant[]> {
    return this._model
      .find({ isActive: true, stock: { $lte: threshold } })
      .sort({ stock: 1 })
      .limit(100);
  }

  async deleteAllByProductId(productId: string): Promise<void> {
    await this._model.updateMany({ product: productId }, { isActive: false });
  }
}
