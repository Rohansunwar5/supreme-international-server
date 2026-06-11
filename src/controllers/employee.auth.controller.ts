import { NextFunction, Request, Response } from 'express';
import employeeAuthService from '../services/employee.auth.service';

export const verifyInvite = async (req: Request, _res: Response, next: NextFunction) => {
  const response = await employeeAuthService.verifyInviteToken(req.params.token);
  next(response);
};

export const activateEmployee = async (req: Request, _res: Response, next: NextFunction) => {
  const { token, password } = req.body;
  const response = await employeeAuthService.activate(token, password);
  next(response);
};

export const employeeLogin = async (req: Request, _res: Response, next: NextFunction) => {
  const { email, password } = req.body;
  const response = await employeeAuthService.login(email, password);
  next(response);
};

export const employeeForgotPassword = async (req: Request, _res: Response, next: NextFunction) => {
  const response = await employeeAuthService.forgotPassword(req.body.email);
  next(response);
};

export const employeeResetPassword = async (req: Request, _res: Response, next: NextFunction) => {
  const { token, password } = req.body;
  const response = await employeeAuthService.resetPassword(token, password);
  next(response);
};
