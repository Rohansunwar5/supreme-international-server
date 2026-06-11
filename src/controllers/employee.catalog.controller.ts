import { NextFunction, Request, Response } from 'express';
import employeeCatalogService from '../services/employee.catalog.service';
import recentlyViewedService from '../services/recently-viewed.service';

export const listProducts = async (req: Request, _res: Response, next: NextFunction) => {
  const response = await employeeCatalogService.listProducts(req.companyId as string, req.query as Record<string, unknown>);
  next(response);
};

export const getProduct = async (req: Request, _res: Response, next: NextFunction) => {
  const response = await employeeCatalogService.getProductBySlug(req.companyId as string, req.params.slug);
  next(response);
};

export const search = async (req: Request, _res: Response, next: NextFunction) => {
  const { q, page, limit } = req.query;
  const response = await employeeCatalogService.searchProducts(req.companyId as string, (q as string) ?? '', Number(page) || 1, Number(limit) || 12);
  next(response);
};

export const related = async (req: Request, _res: Response, next: NextFunction) => {
  const response = await employeeCatalogService.getRelated(req.companyId as string, req.params.slug);
  next(response);
};

export const trackView = async (req: Request, _res: Response, next: NextFunction) => {
  await recentlyViewedService.trackView({ userId: req.user._id, sessionId: req.sessionId }, req.params.slug);
  next({ tracked: true });
};

export const recentlyViewed = async (req: Request, _res: Response, next: NextFunction) => {
  const response = await employeeCatalogService.getRecentlyViewed(req.companyId as string, req.user._id);
  next(response);
};
