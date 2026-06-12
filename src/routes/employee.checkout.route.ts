import { Router } from 'express';
import { asyncHandler } from '../utils/asynchandler';
import requireEmployee from '../middlewares/isEmployee.middleware';
import { employeeCheckout } from '../controllers/employee.checkout.controller';
import { employeeCheckoutValidator } from '../middlewares/validators/checkout.validator';

const employeeCheckoutRouter = Router();

employeeCheckoutRouter.post('/', requireEmployee, employeeCheckoutValidator, asyncHandler(employeeCheckout));

export default employeeCheckoutRouter;
