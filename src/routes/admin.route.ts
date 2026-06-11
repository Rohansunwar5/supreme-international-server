import { Router } from 'express';
import { asyncHandler } from '../utils/asynchandler';
import isAdmin from '../middlewares/isAdmin.middleware';
import { upload } from '../utils/multer.util';
import adminAuthRouter from './admin.auth.route';
import {
  createAttribute,
  updateAttribute,
  addAttributeValue,
  updateAttributeValue,
  removeAttributeValue,
  listAttributesAdmin,
  createCategory,
  updateCategory,
  listCategoriesAdmin,
  createProduct,
  updateProduct,
  deleteProduct,
  getProductAdmin,
  listProductsAdmin,
  createVariant,
  bulkCreateVariants,
  updateVariant,
  adjustVariantStock,
  deleteVariant,
  getLowStockVariants,
  uploadImage,
  setFlashSale,
} from '../controllers/admin.catalog.controller';
import {
  createAttributeValidator,
  addAttributeValueValidator,
  updateAttributeValueValidator,
  createCategoryValidator,
  updateCategoryValidator,
  createProductValidator,
  updateProductValidator,
  createVariantValidator,
  bulkCreateVariantsValidator,
  updateVariantValidator,
  adjustStockValidator,
  flashSaleValidator,
} from '../middlewares/validators/catalog.validator';
import {
  createCoupon,
  updateCoupon,
  listCoupons,
  getCoupon,
  deactivateCoupon,
} from '../controllers/admin.coupon.controller';
import { createCouponValidator, updateCouponValidator } from '../middlewares/validators/coupon.validator';
import {
  adminListOrders,
  adminGetOrder,
  adminUpdateOrderStatus,
  adminInitiateRefund,
} from '../controllers/admin.order.controller';
import { adminUpdateOrderStatusValidator } from '../middlewares/validators/checkout.validator';
import { listReviewsAdmin, deleteReview, createReviewAdmin } from '../controllers/admin.review.controller';
import { createAdminReviewValidator } from '../middlewares/validators/review.validator';
import { getRevenue, getTopProducts, getOrdersByStatus } from '../controllers/admin.analytics.controller';
import {
  listBlogsAdmin,
  getBlogAdmin,
  createBlog,
  updateBlog,
  deleteBlog,
} from '../controllers/admin.blog.controller';
import { createBlogValidator, updateBlogValidator } from '../middlewares/validators/blog.validator';
import {
  listQuotations,
  getQuotation,
  updateQuotationStatus,
  quotationAnalytics,
} from '../controllers/admin.quotation.controller';
import {
  quotationIdValidator,
  updateQuotationStatusValidator,
  listQuotationsValidator,
} from '../middlewares/validators/quotation.validator';

const adminRouter = Router();

// Auth routes — public (login) and protected (profile, change-password) handled inside adminAuthRouter
adminRouter.use('/auth', adminAuthRouter);

// All routes below require a valid admin session
adminRouter.use(isAdmin);

// ── Image Upload ──────────────────────────────────────────────────────────────
adminRouter.post('/upload/image', upload.single('file'), asyncHandler(uploadImage));

// ── Attributes ────────────────────────────────────────────────────────────────
adminRouter.get('/attributes', asyncHandler(listAttributesAdmin));
adminRouter.post('/attributes', createAttributeValidator, asyncHandler(createAttribute));
adminRouter.patch('/attributes/:id', asyncHandler(updateAttribute));
adminRouter.post('/attributes/:id/values', addAttributeValueValidator, asyncHandler(addAttributeValue));
adminRouter.patch('/attributes/:id/values/:valueId', updateAttributeValueValidator, asyncHandler(updateAttributeValue));
adminRouter.delete('/attributes/:id/values/:valueId', asyncHandler(removeAttributeValue));

// ── Categories ────────────────────────────────────────────────────────────────
adminRouter.get('/categories', asyncHandler(listCategoriesAdmin));
adminRouter.post('/categories', createCategoryValidator, asyncHandler(createCategory));
adminRouter.patch('/categories/:id', updateCategoryValidator, asyncHandler(updateCategory));

// ── Products ─────────────────────────────────────────────────────────────────
adminRouter.get('/products', asyncHandler(listProductsAdmin));
adminRouter.post('/products', createProductValidator, asyncHandler(createProduct));
adminRouter.get('/products/:slug', asyncHandler(getProductAdmin));
adminRouter.patch('/products/:id', updateProductValidator, asyncHandler(updateProduct));
adminRouter.delete('/products/:id', asyncHandler(deleteProduct));

// ── Variants ─────────────────────────────────────────────────────────────────
adminRouter.post('/products/:id/variants', createVariantValidator, asyncHandler(createVariant));
adminRouter.post('/products/:id/variants/bulk', bulkCreateVariantsValidator, asyncHandler(bulkCreateVariants));
adminRouter.patch('/variants/:id', updateVariantValidator, asyncHandler(updateVariant));
adminRouter.patch('/variants/:id/stock', adjustStockValidator, asyncHandler(adjustVariantStock));
adminRouter.delete('/variants/:id', asyncHandler(deleteVariant));

adminRouter.patch('/variants/:id/flash-sale', flashSaleValidator, asyncHandler(setFlashSale));

// ── Inventory ─────────────────────────────────────────────────────────────────
adminRouter.get('/inventory/low-stock', asyncHandler(getLowStockVariants));

// ── Coupons ──────────────────────────────────────────────────────────────────
adminRouter.get('/coupons', asyncHandler(listCoupons));
adminRouter.post('/coupons', createCouponValidator, asyncHandler(createCoupon));
adminRouter.get('/coupons/:id', asyncHandler(getCoupon));
adminRouter.patch('/coupons/:id', updateCouponValidator, asyncHandler(updateCoupon));
adminRouter.delete('/coupons/:id', asyncHandler(deactivateCoupon));

// ── Orders ────────────────────────────────────────────────────────────────────
adminRouter.get('/orders', asyncHandler(adminListOrders));
adminRouter.get('/orders/:orderId', asyncHandler(adminGetOrder));
adminRouter.patch('/orders/:orderId/status', adminUpdateOrderStatusValidator, asyncHandler(adminUpdateOrderStatus));
adminRouter.post('/orders/:orderId/refund', asyncHandler(adminInitiateRefund));

// ── Reviews ───────────────────────────────────────────────────────────────────
adminRouter.get('/reviews', asyncHandler(listReviewsAdmin));
adminRouter.post('/reviews', createAdminReviewValidator, asyncHandler(createReviewAdmin));
adminRouter.delete('/reviews/:id', asyncHandler(deleteReview));

// ── Blogs ─────────────────────────────────────────────────────────────────────
adminRouter.get('/blogs', asyncHandler(listBlogsAdmin));
adminRouter.post('/blogs', createBlogValidator, asyncHandler(createBlog));
adminRouter.get('/blogs/:id', asyncHandler(getBlogAdmin));
adminRouter.patch('/blogs/:id', updateBlogValidator, asyncHandler(updateBlog));
adminRouter.delete('/blogs/:id', asyncHandler(deleteBlog));

// ── Quotations (enquiries) ────────────────────────────────────────────────────
// Register '/quotations/analytics' BEFORE '/quotations/:id' so it isn't captured as an :id.
adminRouter.get('/quotations', listQuotationsValidator, asyncHandler(listQuotations));
adminRouter.get('/quotations/analytics', asyncHandler(quotationAnalytics));
adminRouter.get('/quotations/:id', quotationIdValidator, asyncHandler(getQuotation));
adminRouter.patch('/quotations/:id/status', quotationIdValidator, updateQuotationStatusValidator, asyncHandler(updateQuotationStatus));

// ── Analytics ─────────────────────────────────────────────────────────────────
adminRouter.get('/analytics/revenue', asyncHandler(getRevenue));
adminRouter.get('/analytics/top-products', asyncHandler(getTopProducts));
adminRouter.get('/analytics/orders-by-status', asyncHandler(getOrdersByStatus));

export default adminRouter;
