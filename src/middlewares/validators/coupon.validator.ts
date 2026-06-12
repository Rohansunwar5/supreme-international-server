import { check } from 'express-validator';
import { validateRequest } from '.';

export const applyCouponValidator = [
  check('code').notEmpty().withMessage('code is required').isString().trim(),
  ...validateRequest,
];

export const createCouponValidator = [
  check('code').notEmpty().withMessage('code is required').isString().trim(),
  check('type').isIn(['flat', 'percent']).withMessage('type must be flat or percent'),
  check('value').isFloat({ min: 0 }).withMessage('value must be a positive number'),
  check('startsAt').isISO8601().withMessage('startsAt must be a valid ISO date'),
  check('expiresAt').optional({ nullable: true }).isISO8601().withMessage('expiresAt must be a valid ISO date'),
  check('minOrderValue').optional().isFloat({ min: 0 }).withMessage('minOrderValue must be non-negative'),
  check('maxDiscountAmount').optional().isFloat({ min: 0 }).withMessage('maxDiscountAmount must be non-negative'),
  check('usageLimit').optional().isInt({ min: 0 }).withMessage('usageLimit must be a non-negative integer'),
  check('perUserLimit').optional().isInt({ min: 0 }).withMessage('perUserLimit must be a non-negative integer'),
  check('applicableCategories').optional().isArray().withMessage('applicableCategories must be an array'),
  check('applicableProducts').optional().isArray().withMessage('applicableProducts must be an array'),
  check('companyId').optional().isMongoId().withMessage('companyId must be a valid id'),
  ...validateRequest,
];

export const updateCouponValidator = [
  check('type').optional().isIn(['flat', 'percent']).withMessage('type must be flat or percent'),
  check('value').optional().isFloat({ min: 0 }).withMessage('value must be a positive number'),
  check('startsAt').optional().isISO8601().withMessage('startsAt must be a valid ISO date'),
  check('expiresAt').optional({ nullable: true }).isISO8601().withMessage('expiresAt must be a valid ISO date'),
  check('minOrderValue').optional().isFloat({ min: 0 }).withMessage('minOrderValue must be non-negative'),
  check('maxDiscountAmount').optional().isFloat({ min: 0 }).withMessage('maxDiscountAmount must be non-negative'),
  check('usageLimit').optional().isInt({ min: 0 }).withMessage('usageLimit must be a non-negative integer'),
  check('perUserLimit').optional().isInt({ min: 0 }).withMessage('perUserLimit must be a non-negative integer'),
  check('companyId').optional().isMongoId().withMessage('companyId must be a valid id'),
  ...validateRequest,
];
