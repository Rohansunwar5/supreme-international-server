import { check } from 'express-validator';
import { validateRequest } from '.';

export const employeeCheckoutValidator = [
  check('shippingAddress.fullName').isString().trim().notEmpty().withMessage('Shipping name is required'),
  check('shippingAddress.phone').isString().trim().notEmpty().withMessage('Shipping phone is required'),
  check('shippingAddress.line1').isString().trim().notEmpty().withMessage('Address line 1 is required'),
  check('shippingAddress.city').isString().trim().notEmpty().withMessage('City is required'),
  check('shippingAddress.state').isString().trim().notEmpty().withMessage('State is required'),
  check('shippingAddress.pincode').isString().trim().notEmpty().withMessage('Pincode is required'),
  check('couponCode').optional().isString(),
  ...validateRequest,
];

export const checkoutValidator = [
  check('shippingAddress.fullName').notEmpty().withMessage('Full name is required'),
  check('shippingAddress.phone')
    .notEmpty().withMessage('Phone is required')
    .matches(/^[6-9]\d{9}$/).withMessage('Enter a valid 10-digit Indian phone number'),
  check('shippingAddress.line1').notEmpty().withMessage('Address line 1 is required'),
  check('shippingAddress.city').notEmpty().withMessage('City is required'),
  check('shippingAddress.state').notEmpty().withMessage('State is required'),
  check('shippingAddress.pincode')
    .notEmpty().withMessage('Pincode is required')
    .matches(/^\d{6}$/).withMessage('Enter a valid 6-digit pincode'),
  check('customerEmail').isEmail().withMessage('A valid customer email is required'),
  // guestInfo — if present, all three fields are mandatory
  check('guestInfo.name')
    .if((_val, { req }) => !!req.body.guestInfo)
    .notEmpty().withMessage('Guest name is required'),
  check('guestInfo.email')
    .if((_val, { req }) => !!req.body.guestInfo)
    .isEmail().withMessage('A valid guest email is required'),
  check('guestInfo.phone')
    .if((_val, { req }) => !!req.body.guestInfo)
    .matches(/^[6-9]\d{9}$/).withMessage('Enter a valid guest phone number'),
  ...validateRequest,
];

export const adminUpdateOrderStatusValidator = [
  check('status')
    .isIn(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'])
    .withMessage('Invalid order status'),
  ...validateRequest,
];
