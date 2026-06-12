import { Router } from 'express';
import { country, health, helloWorld } from '../controllers/health.controller';
import { asyncHandler } from '../utils/asynchandler';
import { generalLimiter } from '../middlewares/rate-limit.middleware';
import authRouter from './auth.route';
import contactRouter from './contact.route';
import catalogRouter from './catalog.route';
import cartRouter from './cart.route';
import adminRouter from './admin.route';
import checkoutRouter from './checkout.route';
import paymentRouter from './payment.route';
import orderRouter from './order.route';
import userRouter from './user.route';
import blogRouter from './blog.route';
import quotationRouter from './quotation.route';
import employeeAuthRouter from './employee.auth.route';
import employeeCatalogRouter from './employee.catalog.route';
import employeeWalletRouter from './employee.wallet.route';
import employeeCheckoutRouter from './employee.checkout.route';

const v1Router = Router();

v1Router.use(generalLimiter);

v1Router.get('/', asyncHandler(helloWorld));
v1Router.get('/health', asyncHandler(health));
v1Router.use('/auth/employee', employeeAuthRouter);
v1Router.use('/employee/catalog', employeeCatalogRouter);
v1Router.use('/employee/wallet', employeeWalletRouter);
v1Router.use('/employee/checkout', employeeCheckoutRouter);
v1Router.use('/auth', authRouter);
v1Router.use('/contact', contactRouter);
v1Router.use('/catalog', catalogRouter);
v1Router.use('/cart', cartRouter);
v1Router.use('/quotations', quotationRouter);
v1Router.use('/admin', adminRouter);
v1Router.use('/checkout', checkoutRouter);
v1Router.use('/payments', paymentRouter);
v1Router.use('/orders', orderRouter);
v1Router.use('/user', userRouter);
v1Router.use('/blogs', blogRouter);
v1Router.get('/country', asyncHandler(country));

export default v1Router;
