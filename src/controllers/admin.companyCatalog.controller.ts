import { NextFunction, Request, Response } from 'express';
import companyCatalogService from '../services/companyCatalog.service';
import productService from '../services/catalog/product.service';

export const getCatalogHandler = async (req: Request, _res: Response, next: NextFunction) => {
  const response = await companyCatalogService.getCatalog(req.params.id);
  next(response);
};

export const updateCatalogHandler = async (req: Request, _res: Response, next: NextFunction) => {
  const { addProductIds, removeProductIds, addCategoryIds, removeCategoryIds } = req.body;
  const response = await companyCatalogService.updateCatalog(req.params.id, { addProductIds, removeProductIds, addCategoryIds, removeCategoryIds });
  next(response);
};

export const listCompanyProductsHandler = async (req: Request, _res: Response, next: NextFunction) => {
  const response = await productService.listProducts({ ...(req.query as Record<string, unknown>), visibility: 'company', ownerCompanyId: req.params.id });
  next(response);
};
