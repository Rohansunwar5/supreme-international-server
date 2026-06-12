import { check } from 'express-validator';
import { validateRequest } from '.';
import { isMongoId } from '../../utils/validator.utils';

export const walletAmountValidator = [
  isMongoId('id'),
  check('amount').isFloat({ gt: 0 }).withMessage('amount must be greater than 0'),
  check('reason').isString().trim().notEmpty().withMessage('reason is required'),
  ...validateRequest,
];

export const employeeIdParamValidator = [
  isMongoId('id'),
  ...validateRequest,
];
