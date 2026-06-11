import { check } from 'express-validator';
import { validateRequest } from '.';
import { isMongoId } from '../../utils/validator.utils';

export const createCompanyValidator = [
  check('name').isString().trim().notEmpty().withMessage('Company name is required'),
  check('primaryContact.email').optional().isEmail().withMessage('Invalid contact email'),
  ...validateRequest,
];

export const updateCompanyValidator = [
  check('status').optional().isIn(['active', 'inactive']).withMessage('Invalid status'),
  check('primaryContact.email').optional().isEmail().withMessage('Invalid contact email'),
  ...validateRequest,
];

export const inviteEmployeeValidator = [
  check('firstName').isString().trim().notEmpty().withMessage('First name is required'),
  check('email').isEmail().withMessage('Valid email is required'),
  ...validateRequest,
];

export const employeeStatusValidator = [
  check('status').isIn(['active', 'deactivated']).withMessage('Invalid employee status'),
  ...validateRequest,
];

export const companyIdValidator = [
  isMongoId('id'),
  ...validateRequest,
];

export const employeeActivateValidator = [
  check('token').isString().notEmpty().withMessage('Token is required'),
  check('password').isString().isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  ...validateRequest,
];

export const employeeLoginValidator = [
  check('email').isEmail().withMessage('Valid email is required'),
  check('password').isString().notEmpty().withMessage('Password is required'),
  ...validateRequest,
];

export const employeeResetPasswordValidator = [
  check('token').isString().notEmpty().withMessage('Token is required'),
  check('password').isString().isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  ...validateRequest,
];
