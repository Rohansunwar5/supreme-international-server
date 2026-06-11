import productModel, { IProduct } from '../models/product.model';

export interface ICreateProductParams {
  name: string;
  slug: string;
  description?: string;
  details?: string;
  materials?: string;
  shipping?: string;
  category: string;
  images?: string[];
  badge?: { label: string; variant: 'primary' | 'accent' } | null;
  isFeatured?: boolean;
}

export interface IUpdateProductParams extends Partial<ICreateProductParams> {
  isActive?: boolean;
  rating?: number;
  totalReviews?: number;
  totalPurchases?: number;
}

export interface IProductFilter {
  categoryId?: string;
  productIds?: string[];
  isActive?: boolean;
  isFeatured?: boolean;
  visibility?: 'public' | 'company';
  ownerCompanyId?: string;
}

export interface IProductSort {
  field: 'rating' | 'createdAt';
  direction: 1 | -1;
}

export interface IEmployeeScope {
  companyId: string;
  productIds: string[];
  categoryIds: string[];
}

export class ProductRepository {
  private _model = productModel;

  async create(params: ICreateProductParams): Promise<IProduct> {
    return this._model.create(params);
  }

  async findById(id: string): Promise<IProduct | null> {
    return this._model.findById(id);
  }

  async findBySlug(slug: string): Promise<IProduct | null> {
    return this._model.findOne({ slug, isActive: true, visibility: 'public' });
  }

  async findBySlugAdmin(slug: string): Promise<IProduct | null> {
    return this._model.findOne({ slug });
  }

  async findByIds(ids: string[]) {
    return this._model.find({ _id: { $in: ids } });
  }

  async findWithFilters(params: {
    filter: IProductFilter;
    sort: IProductSort;
    skip: number;
    limit: number;
  }): Promise<{ docs: IProduct[]; total: number }> {
    const { filter, sort, skip, limit } = params;

    const query: Record<string, unknown> = {};
    if (filter.isActive !== undefined) query.isActive = filter.isActive;
    if (filter.isFeatured !== undefined) query.isFeatured = filter.isFeatured;
    if (filter.categoryId) query.category = filter.categoryId;
    if (filter.productIds?.length) query._id = { $in: filter.productIds };
    if (filter.visibility) query.visibility = filter.visibility;
    if (filter.ownerCompanyId) query.ownerCompanyId = filter.ownerCompanyId;

    const [docs, total] = await Promise.all([
      this._model
        .find(query)
        .sort({ [sort.field]: sort.direction })
        .skip(skip)
        .limit(limit),
      this._model.countDocuments(query),
    ]);

    return { docs, total };
  }

  async update(id: string, params: IUpdateProductParams): Promise<IProduct | null> {
    return this._model.findByIdAndUpdate(id, params, { new: true });
  }

  async updateRating(
    productId: string,
    rating: number,
    totalReviews: number,
  ): Promise<IProduct | null> {
    return this._model.findByIdAndUpdate(
      productId,
      { rating, totalReviews },
      { new: true },
    );
  }

  async softDelete(id: string): Promise<IProduct | null> {
    return this._model.findByIdAndUpdate(id, { isActive: false }, { new: true });
  }

  async search(query: string, page: number, limit: number): Promise<{ docs: IProduct[]; total: number }> {
    const skip = (page - 1) * limit;
    const filter = { $text: { $search: query }, isActive: true, visibility: 'public' };
    const projection = { score: { $meta: 'textScore' } };
    const [docs, total] = await Promise.all([
      this._model
        .find(filter, projection)
        .sort({ score: { $meta: 'textScore' } })
        .skip(skip)
        .limit(limit),
      this._model.countDocuments(filter),
    ]);
    return { docs, total };
  }

  async findRelated(productId: string, categoryId: string, limit: number): Promise<IProduct[]> {
    return this._model
      .find({ category: categoryId, isActive: true, visibility: 'public', _id: { $ne: productId } })
      .sort({ rating: -1 })
      .limit(limit);
  }

  private _employeePredicate(scope: IEmployeeScope): Record<string, unknown> {
    return {
      $or: [
        {
          visibility: 'public',
          $or: [{ _id: { $in: scope.productIds } }, { category: { $in: scope.categoryIds } }],
        },
        { visibility: 'company', ownerCompanyId: scope.companyId },
      ],
    };
  }

  async findEmployeeCatalog(params: {
    scope: IEmployeeScope;
    categoryId?: string;
    restrictToProductIds?: string[];
    sort: IProductSort;
    skip: number;
    limit: number;
  }): Promise<{ docs: IProduct[]; total: number }> {
    const query: Record<string, unknown> = { isActive: true, ...this._employeePredicate(params.scope) };
    if (params.categoryId) query.category = params.categoryId;
    if (params.restrictToProductIds?.length) query._id = { $in: params.restrictToProductIds };

    const [docs, total] = await Promise.all([
      this._model.find(query).sort({ [params.sort.field]: params.sort.direction }).skip(params.skip).limit(params.limit),
      this._model.countDocuments(query),
    ]);
    return { docs, total };
  }

  async findEmployeeProductBySlug(scope: IEmployeeScope, slug: string): Promise<IProduct | null> {
    return this._model.findOne({ slug, isActive: true, ...this._employeePredicate(scope) });
  }

  async searchEmployeeCatalog(scope: IEmployeeScope, query: string, skip: number, limit: number): Promise<{ docs: IProduct[]; total: number }> {
    const filter = { $text: { $search: query }, isActive: true, ...this._employeePredicate(scope) };
    const projection = { score: { $meta: 'textScore' } };
    const [docs, total] = await Promise.all([
      this._model.find(filter, projection).sort({ score: { $meta: 'textScore' } }).skip(skip).limit(limit),
      this._model.countDocuments(filter),
    ]);
    return { docs, total };
  }

  async findEmployeeRelated(scope: IEmployeeScope, productId: string, categoryId: string, limit: number): Promise<IProduct[]> {
    return this._model
      .find({ category: categoryId, isActive: true, _id: { $ne: productId }, ...this._employeePredicate(scope) })
      .sort({ rating: -1 })
      .limit(limit);
  }

  async findEmployeeByIds(scope: IEmployeeScope, ids: string[]): Promise<IProduct[]> {
    return this._model.find({ _id: { $in: ids }, isActive: true, ...this._employeePredicate(scope) });
  }

  async slugExists(slug: string): Promise<boolean> {
    const doc = await this._model.findOne({ slug }).select('_id');
    return !!doc;
  }
}
