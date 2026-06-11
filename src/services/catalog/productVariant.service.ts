import { BadRequestError } from '../../errors/bad-request.error';
import { NotFoundError } from '../../errors/not-found.error';
import { ProductVariantRepository, ICreateVariantParams } from '../../repository/productVariant.repository';
import { ProductRepository } from '../../repository/product.repository';
import { AttributeRepository } from '../../repository/attribute.repository';
import { productDetailCacheManager } from '../cache/entities';
import { customAlphabet } from 'nanoid';
import config from '../../config';

const nanoid = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 8);

const generateVariantKey = (attributes: { attributeSlug: string; valueSlug: string }[]): string =>
  attributes
    .map(a => `${a.attributeSlug}:${a.valueSlug}`)
    .sort()
    .join('|');

const generateSku = () => `SOV-${nanoid()}`;

class ProductVariantService {
  constructor(
    private readonly _variantRepository: ProductVariantRepository,
    private readonly _productRepository: ProductRepository,
    private readonly _attributeRepository: AttributeRepository,
  ) {}

  assertMoq(moq: number): void {
    if (moq !== undefined && (!Number.isInteger(moq) || moq < 1)) {
      throw new BadRequestError('moq must be an integer >= 1');
    }
  }

  async createVariant(
    productId: string,
    params: {
      sku?: string;
      price: number;
      originalPrice: number;
      stock: number;
      moq?: number;
      images?: string[];
      attributes: { attributeId: string; valueId: string }[];
    },
  ) {
    this.assertMoq(params.moq as number);

    const product = await this._productRepository.findById(productId);
    if (!product) throw new NotFoundError('Product not found');

    const resolvedAttributes = await this._resolveAttributes(params.attributes);

    const variantKey = generateVariantKey(
      resolvedAttributes.map(a => ({ attributeSlug: a.attributeSlug, valueSlug: a.valueSlug })),
    );

    const keyExists = await this._variantRepository.variantKeyExists(productId, variantKey);
    if (keyExists) throw new BadRequestError('A variant with this attribute combination already exists');

    const sku = await this._ensureUniqueSku(params.sku);

    const createParams: ICreateVariantParams = {
      product: productId,
      sku,
      price: params.price,
      originalPrice: params.originalPrice,
      stock: params.stock,
      moq: params.moq,
      images: params.images,
      attributes: resolvedAttributes,
      variantKey,
    };

    const variant = await this._variantRepository.create(createParams);
    await productDetailCacheManager.remove({ slug: product.slug });
    return variant;
  }

  async bulkCreateVariants(
    productId: string,
    params: {
      attributes: { attributeId: string; valueIds: string[] }[];
      defaultPrice: number;
      defaultOriginalPrice: number;
      defaultStock: number;
    },
  ) {
    const product = await this._productRepository.findById(productId);
    if (!product) throw new NotFoundError('Product not found');

    if (!params.attributes.length) throw new BadRequestError('At least one attribute is required');

    const resolvedAttributeDefs = await Promise.all(
      params.attributes.map(async a => {
        const attr = await this._attributeRepository.findById(a.attributeId);
        if (!attr) throw new NotFoundError(`Attribute ${a.attributeId} not found`);

        return a.valueIds.map(valueId => {
          const value = attr.values.find(v => v._id.toString() === valueId);
          if (!value) throw new NotFoundError(`Value ${valueId} not found on attribute ${attr.name}`);
          return {
            attributeId: attr._id.toString(),
            attributeName: attr.name,
            attributeSlug: attr.slug,
            valueId: value._id.toString(),
            valueLabel: value.label,
            valueSlug: value.slug,
            valueMeta: Object.fromEntries(value.meta || []),
          };
        });
      }),
    );

    const combinations = this._cartesianProduct(resolvedAttributeDefs);

    const toCreate: ICreateVariantParams[] = [];
    let skipped = 0;

    for (const combo of combinations) {
      const variantKey = generateVariantKey(
        combo.map(a => ({ attributeSlug: a.attributeSlug, valueSlug: a.valueSlug })),
      );

      const exists = await this._variantRepository.variantKeyExists(productId, variantKey);
      if (exists) { skipped++; continue; }

      const sku = await this._ensureUniqueSku();

      toCreate.push({
        product: productId,
        sku,
        price: params.defaultPrice,
        originalPrice: params.defaultOriginalPrice,
        stock: params.defaultStock,
        images: [],
        attributes: combo,
        variantKey,
      });
    }

    const created = toCreate.length ? await this._variantRepository.bulkCreate(toCreate) : [];
    await productDetailCacheManager.remove({ slug: product.slug });

    return { variants: created, skipped };
  }

  async updateVariant(
    id: string,
    params: {
      price?: number;
      originalPrice?: number;
      stock?: number;
      moq?: number;
      images?: string[];
      sku?: string;
      isActive?: boolean;
    },
  ) {
    this.assertMoq(params.moq as number);

    const variant = await this._variantRepository.findById(id);
    if (!variant) throw new NotFoundError('Variant not found');

    if (params.sku && params.sku !== variant.sku) {
      const skuTaken = await this._variantRepository.skuExists(params.sku);
      if (skuTaken) throw new BadRequestError('SKU already in use');
    }

    const updated = await this._variantRepository.update(id, params);

    const product = await this._productRepository.findById(variant.product.toString());
    if (product) await productDetailCacheManager.remove({ slug: product.slug });

    return updated;
  }

  async adjustStock(variantId: string, delta: number) {
    const variant = await this._variantRepository.findById(variantId);
    if (!variant) throw new NotFoundError('Variant not found');

    if (variant.stock + delta < 0) throw new BadRequestError('Insufficient stock');

    const updated = await this._variantRepository.adjustStock(variantId, delta);

    const product = await this._productRepository.findById(variant.product.toString());
    if (product) await productDetailCacheManager.remove({ slug: product.slug });

    return updated;
  }

  async deleteVariant(id: string) {
    const variant = await this._variantRepository.findById(id);
    if (!variant) throw new NotFoundError('Variant not found');

    const updated = await this._variantRepository.softDelete(id);

    const product = await this._productRepository.findById(variant.product.toString());
    if (product) await productDetailCacheManager.remove({ slug: product.slug });

    return updated;
  }

  async setFlashSale(
    id: string,
    params: { flashSalePrice: number; flashSaleEndsAt: Date } | null,
  ) {
    const variant = await this._variantRepository.findById(id);
    if (!variant) throw new NotFoundError('Variant not found');

    if (params !== null) {
      if (params.flashSalePrice >= variant.price)
        throw new BadRequestError('Flash sale price must be less than the regular price');
      if (params.flashSaleEndsAt <= new Date())
        throw new BadRequestError('flashSaleEndsAt must be a future date');
    }

    const updated = await this._variantRepository.setFlashSale(
      id,
      params?.flashSalePrice ?? null,
      params?.flashSaleEndsAt ?? null,
    );

    const product = await this._productRepository.findById(variant.product.toString());
    if (product) await productDetailCacheManager.remove({ slug: product.slug });

    return updated;
  }

  async getLowStockVariants() {
    return this._variantRepository.getLowStock(config.LOW_STOCK_THRESHOLD);
  }

  private async _resolveAttributes(
    rawAttributes: { attributeId: string; valueId: string }[],
  ) {
    return Promise.all(
      rawAttributes.map(async a => {
        const attr = await this._attributeRepository.findById(a.attributeId);
        if (!attr) throw new NotFoundError(`Attribute ${a.attributeId} not found`);

        const value = attr.values.find(v => v._id.toString() === a.valueId);
        if (!value) throw new NotFoundError(`Value ${a.valueId} not found on attribute ${attr.name}`);

        return {
          attributeId: attr._id.toString(),
          attributeName: attr.name,
          attributeSlug: attr.slug,
          valueId: value._id.toString(),
          valueLabel: value.label,
          valueSlug: value.slug,
          valueMeta: Object.fromEntries(value.meta || []),
        };
      }),
    );
  }

  private _cartesianProduct<T>(arrays: T[][]): T[][] {
    return arrays.reduce<T[][]>(
      (acc, curr) => acc.flatMap(combo => curr.map(item => [...combo, item])),
      [[]],
    );
  }

  private async _ensureUniqueSku(preferredSku?: string): Promise<string> {
    if (preferredSku) {
      const exists = await this._variantRepository.skuExists(preferredSku.toUpperCase());
      if (exists) throw new BadRequestError(`SKU '${preferredSku}' already in use`);
      return preferredSku.toUpperCase();
    }

    let sku = generateSku();
    let attempts = 0;
    while (await this._variantRepository.skuExists(sku)) {
      if (++attempts > 10) throw new NotFoundError('Could not generate unique SKU');
      sku = generateSku();
    }
    return sku;
  }
}

export default new ProductVariantService(
  new ProductVariantRepository(),
  new ProductRepository(),
  new AttributeRepository(),
);
