import { Router } from 'express';
import { asyncHandler } from '../utils/asynchandler';
import { authLimiter, strictLimiter } from '../middlewares/rate-limit.middleware';
import {
  verifyInvite,
  activateEmployee,
  employeeLogin,
  employeeForgotPassword,
  employeeResetPassword,
} from '../controllers/employee.auth.controller';
import {
  employeeActivateValidator,
  employeeLoginValidator,
  employeeResetPasswordValidator,
} from '../middlewares/validators/company.validator';

const employeeAuthRouter = Router();

employeeAuthRouter.get('/activate/:token', asyncHandler(verifyInvite));
employeeAuthRouter.post('/activate', authLimiter, employeeActivateValidator, asyncHandler(activateEmployee));
employeeAuthRouter.post('/login', authLimiter, employeeLoginValidator, asyncHandler(employeeLogin));
employeeAuthRouter.post('/forgot-password', strictLimiter, asyncHandler(employeeForgotPassword));
employeeAuthRouter.post('/reset-password', strictLimiter, employeeResetPasswordValidator, asyncHandler(employeeResetPassword));

export default employeeAuthRouter;
