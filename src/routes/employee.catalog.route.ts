import { Router } from 'express';
import { asyncHandler } from '../utils/asynchandler';
import requireEmployee from '../middlewares/isEmployee.middleware';
import {
  listProducts,
  getProduct,
  search,
  related,
  trackView,
  recentlyViewed,
} from '../controllers/employee.catalog.controller';

const employeeCatalogRouter = Router();

employeeCatalogRouter.use(requireEmployee);

employeeCatalogRouter.get('/search', asyncHandler(search));
employeeCatalogRouter.get('/recently-viewed', asyncHandler(recentlyViewed));
employeeCatalogRouter.get('/products', asyncHandler(listProducts));
employeeCatalogRouter.get('/products/:slug', asyncHandler(getProduct));
employeeCatalogRouter.get('/products/:slug/related', asyncHandler(related));
employeeCatalogRouter.post('/products/:slug/view', asyncHandler(trackView));

export default employeeCatalogRouter;
