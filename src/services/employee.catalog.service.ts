import { NotFoundError } from '../errors/not-found.error';
import { CompanyCatalogRepository } from '../repository/companyCatalog.repository';
import { ProductRepository, IEmployeeScope, IProductSort } from '../repository/product.repository';
import { ProductVariantRepository } from '../repository/productVariant.repository';

const summarize = (p: { _id: unknown; name: string; slug: string; images: string[]; badge: unknown; rating: number; totalReviews: number }, price?: { minPrice: number; originalMinPrice: number }) => ({
  _id: p._id,
  name: p.name,
  slug: p.slug,
  images: p.images,
  badge: p.badge,
  rating: p.rating,
  totalReviews: p.totalReviews,
  minPrice: price?.minPrice ?? 0,
  originalMinPrice: price?.originalMinPrice ?? 0,
});

class EmployeeCatalogService {
  constructor(
    private readonly _catalogRepository: CompanyCatalogRepository,
    private readonly _productRepository: ProductRepository,
    private readonly _variantRepository: ProductVariantRepository,
  ) {}

  private async _scope(companyId: string): Promise<IEmployeeScope> {
    const doc = await this._catalogRepository.findByCompanyId(companyId);
    return {
      companyId,
      productIds: doc ? doc.productIds.map(id => id.toString()) : [],
      categoryIds: doc ? doc.categoryIds.map(id => id.toString()) : [],
    };
  }

  private async _withPrices<T extends { _id: { toString(): string }; name: string; slug: string; images: string[]; badge: unknown; rating: number; totalReviews: number }>(docs: T[]) {
    const ids = docs.map(d => d._id.toString());
    const priceMaps = await this._variantRepository.getMinPriceByProductIds(ids);
    const priceById = new Map(priceMaps.map(p => [p._id.toString(), p]));
    return docs.map(d => summarize(d, priceById.get(d._id.toString())));
  }

  async listProducts(companyId: string, query: { category?: string; sort?: string; page?: number; limit?: number }) {
    const scope = await this._scope(companyId);
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 12));

    const sort: IProductSort =
      query.sort === 'newest' ? { field: 'createdAt', direction: -1 } : { field: 'rating', direction: -1 };

    const { docs, total } = await this._productRepository.findEmployeeCatalog({
      scope,
      categoryId: query.category,
      sort,
      skip: (page - 1) * limit,
      limit,
    });

    const products = await this._withPrices(docs);
    return { products, pagination: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  async getProductBySlug(companyId: string, slug: string) {
    const scope = await this._scope(companyId);
    const product = await this._productRepository.findEmployeeProductBySlug(scope, slug);
    if (!product) throw new NotFoundError('Product not found');

    const variants = await this._variantRepository.findByProductId(product._id.toString(), true);
    return { product, variants };
  }
}

export default new EmployeeCatalogService(
  new CompanyCatalogRepository(),
  new ProductRepository(),
  new ProductVariantRepository(),
);
