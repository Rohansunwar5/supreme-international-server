import { NextFunction, Request, Response } from 'express';
import employeeCheckoutService from '../services/employee.checkout.service';

export const employeeCheckout = async (req: Request, _res: Response, next: NextFunction) => {
  const { shippingAddress, couponCode } = req.body;
  const response = await employeeCheckoutService.checkout(req.user._id, req.companyId as string, { shippingAddress, couponCode });
  next(response);
};
