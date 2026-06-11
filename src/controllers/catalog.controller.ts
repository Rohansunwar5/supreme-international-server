import { NextFunction, Request, Response } from 'express';
import categoryService from '../services/catalog/category.service';
import attributeService from '../services/catalog/attribute.service';
import productService from '../services/catalog/product.service';
import recentlyViewedService from '../services/recently-viewed.service';
import { uploadToR2 } from '../utils/r2.util';

export const listCategories = async (_req: Request, _res: Response, next: NextFunction) => {
  const response = await categoryService.listCategories();
  next(response);
};

export const listAttributes = async (req: Request, _res: Response, next: NextFunction) => {
  const category = req.query.category as string | undefined;
  const response = await attributeService.listAttributes(category);
  next(response);
};

export const listProducts = async (req: Request, _res: Response, next: NextFunction) => {
  const response = await productService.listProducts({ ...(req.query as Record<string, unknown>), visibility: 'public' });
  next(response);
};

export const getFeaturedProducts = async (_req: Request, _res: Response, next: NextFunction) => {
  const response = await productService.getFeaturedProducts();
  next(response);
};

export const getBestsellers = async (_req: Request, _res: Response, next: NextFunction) => {
  const response = await productService.getBestsellers();
  next(response);
};

export const getProductBySlug = async (req: Request, _res: Response, next: NextFunction) => {
  const { slug } = req.params;
  const response = await productService.getProductBySlug(slug);
  next(response);
};

export const searchProducts = async (req: Request, _res: Response, next: NextFunction) => {
  const q = (req.query.q as string) ?? '';
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 12;
  const response = await productService.searchProducts(q, page, limit);
  next(response);
};

export const getRelatedProducts = async (req: Request, _res: Response, next: NextFunction) => {
  const { slug } = req.params;
  const response = await productService.getRelatedProducts(slug);
  next(response);
};

export const trackRecentlyViewed = async (req: Request, _res: Response, next: NextFunction) => {
  const actor = { userId: req.user?._id, sessionId: req.sessionId };
  await recentlyViewedService.trackView(actor, req.params.slug);
  next({ tracked: true });
};

export const getRecentlyViewed = async (req: Request, _res: Response, next: NextFunction) => {
  const actor = { userId: req.user?._id, sessionId: req.sessionId };
  const response = await recentlyViewedService.getRecentlyViewed(actor);
  next(response);
};

export const uploadReviewImage = async (req: Request, _res: Response, next: NextFunction) => {
  const file = req.file as Express.Multer.File;
  const url = await uploadToR2(file.buffer, 'reviews', file.mimetype);
  next({ url });
};
