import { Router } from 'express';
import config from '../config';
import { asyncHandler } from '../utils/asynchandler';
import getAuthMiddlewareByJWTSecret from '../middlewares/auth/verify-token.middleware';
import cartSessionMiddleware from '../middlewares/cart-session.middleware';
import isLoggedIn from '../middlewares/isLoggedIn.middleware';
import requireVerified from '../middlewares/require-verified.middleware';
import { quotationIdValidator } from '../middlewares/validators/quotation.validator';
import {
  generateQuotation,
  getMyQuotations,
  downloadQuotationPdf,
} from '../controllers/quotation.controller';

const quotationRouter = Router();
const tryAuth = getAuthMiddlewareByJWTSecret(config.JWT_SECRET);

// Generate: silent auth + session, then verification gate.
quotationRouter.post('/', tryAuth, cartSessionMiddleware, requireVerified, asyncHandler(generateQuotation));

// History + download: require a real logged-in user.
quotationRouter.get('/mine', isLoggedIn, asyncHandler(getMyQuotations));
quotationRouter.get('/:id/pdf', isLoggedIn, quotationIdValidator, asyncHandler(downloadQuotationPdf));

export default quotationRouter;
