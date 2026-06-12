import { Router } from 'express';
import { asyncHandler } from '../utils/asynchandler';
import requireEmployee from '../middlewares/isEmployee.middleware';
import { getMyWallet, getMyLedger } from '../controllers/employee.wallet.controller';

const employeeWalletRouter = Router();

employeeWalletRouter.use(requireEmployee);

employeeWalletRouter.get('/ledger', asyncHandler(getMyLedger));
employeeWalletRouter.get('/', asyncHandler(getMyWallet));

export default employeeWalletRouter;
