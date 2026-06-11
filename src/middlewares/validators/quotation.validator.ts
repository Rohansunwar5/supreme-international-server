import { check } from 'express-validator';
import { validateRequest } from '.';
import { isMongoId } from '../../utils/validator.utils';

export const quotationIdValidator = [
  isMongoId('id'),
  ...validateRequest,
];

export const updateQuotationStatusValidator = [
  check('status')
    .isIn(['generated', 'sent', 'viewed', 'converted', 'archived'])
    .withMessage('Invalid quotation status'),
  ...validateRequest,
];
