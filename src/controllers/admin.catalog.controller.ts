import { NextFunction, Request, Response } from 'express';
import attributeService from '../services/catalog/attribute.service';
import categoryService from '../services/catalog/category.service';
import productService from '../services/catalog/product.service';
import productVariantService from '../services/catalog/productVariant.service';
import { uploadToR2 } from '../utils/r2.util';

// ── Attributes ────────────────────────────────────────────────────────────────

export const createAttribute = async (req: Request, _res: Response, next: NextFunction) => {
  const { name, slug, unit } = req.body;
  const response = await attributeService.createAttribute({ name, slug, unit });
  next(response);
};

export const updateAttribute = async (req: Request, _res: Response, next: NextFunction) => {
  const { id } = req.params;
  const { name, unit } = req.body;
  const response = await attributeService.updateAttribute(id, { name, unit });
  next(response);
};

export const addAttributeValue = async (req: Request, _res: Response, next: NextFunction) => {
  const { id } = req.params;
  const { label, slug, meta, displayOrder } = req.body;
  const response = await attributeService.addValue(id, { label, slug, meta, displayOrder });
  next(response);
};

export const updateAttributeValue = async (req: Request, _res: Response, next: NextFunction) => {
  const { id, valueId } = req.params;
  const { label, slug, meta, displayOrder } = req.body;
  const response = await attributeService.updateValue(id, valueId, { label, slug, meta, displayOrder });
  next(response);
};

export const removeAttributeValue = async (req: Request, _res: Response, next: NextFunction) => {
  const { id, valueId } = req.params;
  const response = await attributeService.removeValue(id, valueId);
  next(response);
};

export const listAttributesAdmin = async (_req: Request, _res: Response, next: NextFunction) => {
  const response = await attributeService.listAttributes();
  next(response);
};

// ── Categories ────────────────────────────────────────────────────────────────

export const createCategory = async (req: Request, _res: Response, next: NextFunction) => {
  const { name, slug, description, image, attributes, displayOrder } = req.body;
  const response = await categoryService.createCategory({ name, slug, description, image, attributes, displayOrder });
  next(response);
};

export const updateCategory = async (req: Request, _res: Response, next: NextFunction) => {
  const { id } = req.params;
  const { name, description, image, attributes, displayOrder, isActive } = req.body;
  const response = await categoryService.updateCategory(id, { name, description, image, attributes, displayOrder, isActive });
  next(response);
};

export const listCategoriesAdmin = async (_req: Request, _res: Response, next: NextFunction) => {
  const response = await categoryService.listCategoriesAdmin();
  next(response);
};

// ── Products ─────────────────────────────────────────────────────────────────

export const createProduct = async (req: Request, _res: Response, next: NextFunction) => {
  const { name, slug, description, details, materials, shipping, categoryId, images, badge, isFeatured, visibility, ownerCompanyId } = req.body;
  const response = await productService.createProduct({ name, slug, description, details, materials, shipping, categoryId, images, badge, isFeatured, visibility, ownerCompanyId });
  next(response);
};

export const updateProduct = async (req: Request, _res: Response, next: NextFunction) => {
  const { id } = req.params;
  const { name, description, details, materials, shipping, images, badge, isFeatured, isActive, rating, totalReviews, totalPurchases } = req.body;
  const response = await productService.updateProduct(id, { name, description, details, materials, shipping, images, badge, isFeatured, isActive, rating, totalReviews, totalPurchases });
  next(response);
};

export const deleteProduct = async (req: Request, _res: Response, next: NextFunction) => {
  const { id } = req.params;
  const response = await productService.softDeleteProduct(id);
  next(response);
};

export const getProductAdmin = async (req: Request, _res: Response, next: NextFunction) => {
  const { slug } = req.params;
  const response = await productService.getProductBySlugAdmin(slug);
  next(response);
};

export const listProductsAdmin = async (req: Request, _res: Response, next: NextFunction) => {
  const response = await productService.listProducts(req.query as Record<string, unknown>);
  next(response);
};

// ── Variants ─────────────────────────────────────────────────────────────────

export const createVariant = async (req: Request, _res: Response, next: NextFunction) => {
  const { id: productId } = req.params;
  const { sku, price, originalPrice, stock, moq, images, attributes } = req.body;
  const response = await productVariantService.createVariant(productId, { sku, price, originalPrice, stock, moq, images, attributes });
  next(response);
};

export const bulkCreateVariants = async (req: Request, _res: Response, next: NextFunction) => {
  const { id: productId } = req.params;
  const { attributes, defaultPrice, defaultOriginalPrice, defaultStock } = req.body;
  const response = await productVariantService.bulkCreateVariants(productId, { attributes, defaultPrice, defaultOriginalPrice, defaultStock });
  next(response);
};

export const updateVariant = async (req: Request, _res: Response, next: NextFunction) => {
  const { id } = req.params;
  const { price, originalPrice, stock, moq, images, sku, isActive } = req.body;
  const response = await productVariantService.updateVariant(id, { price, originalPrice, stock, moq, images, sku, isActive });
  next(response);
};

export const adjustVariantStock = async (req: Request, _res: Response, next: NextFunction) => {
  const { id } = req.params;
  const { delta } = req.body;
  const response = await productVariantService.adjustStock(id, Number(delta));
  next(response);
};

export const deleteVariant = async (req: Request, _res: Response, next: NextFunction) => {
  const { id } = req.params;
  const response = await productVariantService.deleteVariant(id);
  next(response);
};

export const getLowStockVariants = async (_req: Request, _res: Response, next: NextFunction) => {
  const response = await productVariantService.getLowStockVariants();
  next(response);
};

export const setFlashSale = async (req: Request, _res: Response, next: NextFunction) => {
  const { id } = req.params;
  const { flashSalePrice, flashSaleEndsAt } = req.body;
  const params = flashSalePrice != null && flashSaleEndsAt != null
    ? { flashSalePrice: Number(flashSalePrice), flashSaleEndsAt: new Date(flashSaleEndsAt) }
    : null;
  const response = await productVariantService.setFlashSale(id, params);
  next(response);
};

// ── Image Upload ──────────────────────────────────────────────────────────────

export const uploadImage = async (req: Request, _res: Response, next: NextFunction) => {
  const file = req.file as Express.Multer.File;
  const { folder } = req.body;
  const allowedFolders = ['products', 'categories', 'variants', 'reviews'];
  const targetFolder = allowedFolders.includes(folder) ? folder : 'products';

  const url = await uploadToR2(file.buffer, targetFolder, file.mimetype);
  next({ url });
};
