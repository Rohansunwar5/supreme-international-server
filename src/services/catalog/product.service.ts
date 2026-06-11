import { BadRequestError } from '../../errors/bad-request.error';
import { NotFoundError } from '../../errors/not-found.error';
import { ProductRepository, ICreateProductParams, IUpdateProductParams } from '../../repository/product.repository';
import { ProductVariantRepository } from '../../repository/productVariant.repository';
import { CategoryRepository } from '../../repository/category.repository';
import { productDetailCacheManager, productListCacheManager } from '../cache/entities';
import attributeService from './attribute.service';
import crypto from 'crypto';

const RESERVED_SLUGS = ['featured', 'bestsellers'];

const slugify = (text: string) =>
  text.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

const hashQuery = (obj: Record<string, unknown>) =>
  crypto.createHash('md5').update(JSON.stringify(obj)).digest('hex');

class ProductService {
  constructor(
    private readonly _productRepository: ProductRepository,
    private readonly _variantRepository: ProductVariantRepository,
    private readonly _categoryRepository: CategoryRepository,
  ) {}

  async createProduct(params: {
    name: string;
    slug?: string;
    description?: string;
    details?: string;
    materials?: string;
    shipping?: string;
    categoryId: string;
    images?: string[];
    badge?: { label: string; variant: 'primary' | 'accent' } | null;
    isFeatured?: boolean;
  }) {
    const slug = params.slug ? slugify(params.slug) : slugify(params.name);

    if (RESERVED_SLUGS.includes(slug)) throw new BadRequestError(`Slug '${slug}' is reserved`);

    const slugTaken = await this._productRepository.slugExists(slug);
    if (slugTaken) throw new BadRequestError(`Product slug '${slug}' already exists`);

    const category = await this._categoryRepository.findById(params.categoryId);
    if (!category) throw new NotFoundError('Category not found');

    const createParams: ICreateProductParams = {
      name: params.name,
      slug,
      description: params.description,
      details: params.details,
      materials: params.materials,
      shipping: params.shipping,
      category: params.categoryId,
      images: params.images,
      badge: params.badge,
      isFeatured: params.isFeatured,
    };

    const product = await this._productRepository.create(createParams);
    await this._invalidateListCache();
    return product;
  }

  async updateProduct(id: string, params: IUpdateProductParams) {
    const product = await this._productRepository.findById(id);
    if (!product) throw new NotFoundError('Product not found');

    const updated = await this._productRepository.update(id, params);

    await productDetailCacheManager.remove({ slug: product.slug });
    await this._invalidateListCache();
    return updated;
  }

  async listProducts(query: {
    category?: string;
    sort?: string;
    page?: number;
    limit?: number;
    minPrice?: number;
    maxPrice?: number;
    [key: string]: unknown;
  }) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 12));
    const skip = (page - 1) * limit;

    const cacheKey = hashQuery({ ...query, page, limit });
    const cached = await productListCacheManager.get({ queryHash: cacheKey });
    if (cached) return cached;

    const knownKeys = ['category', 'sort', 'page', 'limit', 'minPrice', 'maxPrice', 'visibility', 'ownerCompanyId'];
    const attributeFilters: Record<string, string> = {};
    for (const [k, v] of Object.entries(query)) {
      if (!knownKeys.includes(k) && typeof v === 'string') attributeFilters[k] = v;
    }

    const hasVariantFilters =
      Object.keys(attributeFilters).length > 0 ||
      query.minPrice !== undefined ||
      query.maxPrice !== undefined;

    let productIds: string[] | undefined;

    if (hasVariantFilters) {
      const valueIds = await attributeService.resolveValueIds(attributeFilters);
      productIds = await this._variantRepository.findDistinctProductIdsByFilters({
        valueIds,
        minPrice: query.minPrice ? Number(query.minPrice) : undefined,
        maxPrice: query.maxPrice ? Number(query.maxPrice) : undefined,
      });

      if (!productIds.length) {
        const result = { products: [], pagination: { total: 0, page, limit, pages: 0 } };
        await productListCacheManager.set({ queryHash: cacheKey }, result);
        return result;
      }
    }

    let categoryId: string | undefined;
    if (query.category) {
      const cat = await this._categoryRepository.findBySlug(query.category as string);
      if (cat) categoryId = cat._id.toString();
    }

    const sortField = (query.sort === 'newest') ? 'createdAt' : 'rating';
    const sortDir = (query.sort === 'rating') ? -1 : (query.sort === 'newest') ? -1 : 1;

    let priceSortDirection: 1 | -1 | null = null;
    if (query.sort === 'price_asc') priceSortDirection = 1;
    else if (query.sort === 'price_desc') priceSortDirection = -1;

    // For price sorting we must fetch all matches first, sort by price in-memory, then paginate.
    // DB-level pagination before an in-memory sort would produce wrong results across pages.
    const fetchAll = priceSortDirection !== null;

    const { docs, total } = await this._productRepository.findWithFilters({
      filter: { isActive: true, categoryId, productIds, visibility: query.visibility as 'public' | 'company' | undefined },
      sort: { field: sortField as 'rating' | 'createdAt', direction: sortDir as 1 | -1 },
      skip: fetchAll ? 0 : skip,
      limit: fetchAll ? 0 : limit,
    });

    const ids = docs.map(p => p._id.toString());
    const priceMaps = await this._variantRepository.getMinPriceByProductIds(ids);
    const priceById = new Map(priceMaps.map(p => [p._id.toString(), p]));

    let products = docs.map(p => ({
      _id: p._id,
      name: p.name,
      slug: p.slug,
      images: p.images,
      badge: p.badge,
      rating: p.rating,
      totalReviews: p.totalReviews,
      category: p.category,
      isFeatured: p.isFeatured,
      minPrice: priceById.get(p._id.toString())?.minPrice ?? 0,
      originalMinPrice: priceById.get(p._id.toString())?.originalMinPrice ?? 0,
    }));

    if (priceSortDirection !== null) {
      products.sort((a, b) =>
        priceSortDirection === 1 ? a.minPrice - b.minPrice : b.minPrice - a.minPrice,
      );
      products = products.slice(skip, skip + limit);
    }

    const effectiveTotal = fetchAll ? docs.length : total;
    const result = {
      products,
      pagination: { total: effectiveTotal, page, limit, pages: Math.ceil(effectiveTotal / limit) },
    };

    await productListCacheManager.set({ queryHash: cacheKey }, result);
    return result;
  }

  async getProductBySlug(slug: string) {
    const cached = await productDetailCacheManager.get({ slug });
    if (cached) return cached;

    const product = await this._productRepository.findBySlug(slug);
    if (!product) throw new NotFoundError('Product not found');

    const variants = await this._variantRepository.findByProductId(product._id.toString(), true);

    const result = { product, variants };
    await productDetailCacheManager.set({ slug }, result);
    return result;
  }

  async getProductBySlugAdmin(slug: string) {
    const product = await this._productRepository.findBySlugAdmin(slug);
    if (!product) throw new NotFoundError('Product not found');

    const variants = await this._variantRepository.findByProductId(product._id.toString(), false);
    return { product, variants };
  }

  async getFeaturedProducts() {
    const cached = await productListCacheManager.get({ queryHash: 'featured' });
    if (cached) return cached;

    const { docs } = await this._productRepository.findWithFilters({
      filter: { isActive: true, isFeatured: true, visibility: 'public' },
      sort: { field: 'rating', direction: -1 },
      skip: 0,
      limit: 8,
    });

    const ids = docs.map(p => p._id.toString());
    const priceMaps = await this._variantRepository.getMinPriceByProductIds(ids);
    const priceById = new Map(priceMaps.map(p => [p._id.toString(), p]));

    const products = docs.map(p => ({
      _id: p._id,
      name: p.name,
      slug: p.slug,
      images: p.images,
      badge: p.badge,
      rating: p.rating,
      totalReviews: p.totalReviews,
      minPrice: priceById.get(p._id.toString())?.minPrice ?? 0,
      originalMinPrice: priceById.get(p._id.toString())?.originalMinPrice ?? 0,
    }));

    await productListCacheManager.set({ queryHash: 'featured' }, products);
    return products;
  }

  async getBestsellers() {
    const cached = await productListCacheManager.get({ queryHash: 'bestsellers' });
    if (cached) return cached;

    const { docs } = await this._productRepository.findWithFilters({
      filter: { isActive: true, visibility: 'public' },
      sort: { field: 'rating', direction: -1 },
      skip: 0,
      limit: 8,
    });

    const ids = docs.map(p => p._id.toString());
    const priceMaps = await this._variantRepository.getMinPriceByProductIds(ids);
    const priceById = new Map(priceMaps.map(p => [p._id.toString(), p]));

    const products = docs.map(p => ({
      _id: p._id,
      name: p.name,
      slug: p.slug,
      images: p.images,
      badge: p.badge,
      rating: p.rating,
      totalReviews: p.totalReviews,
      minPrice: priceById.get(p._id.toString())?.minPrice ?? 0,
      originalMinPrice: priceById.get(p._id.toString())?.originalMinPrice ?? 0,
    }));

    await productListCacheManager.set({ queryHash: 'bestsellers' }, products);
    return products;
  }

  async searchProducts(query: string, page: number, limit: number) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(50, Math.max(1, limit));

    if (!query?.trim()) return { products: [], pagination: { total: 0, page: safePage, limit: safeLimit, pages: 0 } };

    const { docs, total } = await this._productRepository.search(query.trim(), safePage, safeLimit);

    const ids = docs.map(p => p._id.toString());
    const priceMaps = await this._variantRepository.getMinPriceByProductIds(ids);
    const priceById = new Map(priceMaps.map(p => [p._id.toString(), p]));

    const products = docs.map(p => ({
      _id: p._id,
      name: p.name,
      slug: p.slug,
      images: p.images,
      badge: p.badge,
      rating: p.rating,
      totalReviews: p.totalReviews,
      minPrice: priceById.get(p._id.toString())?.minPrice ?? 0,
      originalMinPrice: priceById.get(p._id.toString())?.originalMinPrice ?? 0,
    }));

    return { products, pagination: { total, page: safePage, limit: safeLimit, pages: Math.ceil(total / safeLimit) } };
  }

  async getRelatedProducts(slug: string, limit = 6) {
    const product = await this._productRepository.findBySlug(slug);
    if (!product) return [];

    const related = await this._productRepository.findRelated(
      product._id.toString(),
      product.category.toString(),
      limit,
    );

    const ids = related.map(p => p._id.toString());
    const priceMaps = await this._variantRepository.getMinPriceByProductIds(ids);
    const priceById = new Map(priceMaps.map(p => [p._id.toString(), p]));

    return related.map(p => ({
      _id: p._id,
      name: p.name,
      slug: p.slug,
      images: p.images,
      badge: p.badge,
      rating: p.rating,
      totalReviews: p.totalReviews,
      minPrice: priceById.get(p._id.toString())?.minPrice ?? 0,
      originalMinPrice: priceById.get(p._id.toString())?.originalMinPrice ?? 0,
    }));
  }

  async softDeleteProduct(id: string) {
    const product = await this._productRepository.findById(id);
    if (!product) throw new NotFoundError('Product not found');

    await this._productRepository.softDelete(id);
    await this._variantRepository.deleteAllByProductId(id);

    await productDetailCacheManager.remove({ slug: product.slug });
    await this._invalidateListCache();
    return true;
  }

  private async _invalidateListCache() {
    await productListCacheManager.flush();
  }
}

export default new ProductService(
  new ProductRepository(),
  new ProductVariantRepository(),
  new CategoryRepository(),
);
