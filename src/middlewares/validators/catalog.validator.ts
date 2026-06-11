import { validateRequest } from '.';
import { isRequired, isMongoId, isGreaterThanZero, isArray } from '../../utils/validator.utils';
import { check } from 'express-validator';

// ── Attributes ────────────────────────────────────────────────────────────────

export const createAttributeValidator = [
  isRequired('name'),
  ...validateRequest,
];

export const addAttributeValueValidator = [
  isRequired('label'),
  ...validateRequest,
];

export const updateAttributeValueValidator = [
  check('label').optional().trim().notEmpty().withMessage('label cannot be empty'),
  ...validateRequest,
];

// ── Categories ────────────────────────────────────────────────────────────────

export const createCategoryValidator = [
  isRequired('name'),
  check('attributes').optional().isArray().withMessage('attributes must be an array'),
  check('attributes.*.attributeId').optional().isMongoId().withMessage('Invalid attributeId'),
  check('attributes.*.displayOrder').optional().isNumeric().withMessage('displayOrder must be numeric'),
  ...validateRequest,
];

export const updateCategoryValidator = [
  check('name').optional().trim().notEmpty().withMessage('name cannot be empty'),
  check('attributes').optional().isArray().withMessage('attributes must be an array'),
  check('isActive').optional().isBoolean().withMessage('isActive must be boolean'),
  ...validateRequest,
];

// ── Products ─────────────────────────────────────────────────────────────────

export const createProductValidator = [
  isRequired('name'),
  isMongoId('categoryId'),
  isArray('images', true),
  check('badge').optional({ nullable: true }),
  check('badge.label').if(check('badge').exists({ checkNull: false })).notEmpty().withMessage('badge.label is required'),
  check('badge.variant').if(check('badge').exists({ checkNull: false })).isIn(['primary', 'accent']).withMessage('badge.variant must be primary or accent'),
  check('isFeatured').optional().isBoolean().withMessage('isFeatured must be boolean'),
  check('visibility').optional().isIn(['public', 'company']).withMessage('Invalid visibility'),
  check('ownerCompanyId').if(check('visibility').equals('company')).isMongoId().withMessage('ownerCompanyId must be a valid id for a company-private product'),
  ...validateRequest,
];

export const updateProductValidator = [
  check('name').optional().trim().notEmpty().withMessage('name cannot be empty'),
  isArray('images', true),
  check('isFeatured').optional().isBoolean().withMessage('isFeatured must be boolean'),
  check('isActive').optional().isBoolean().withMessage('isActive must be boolean'),
  check('badge.variant').optional().isIn(['primary', 'accent']).withMessage('badge.variant must be primary or accent'),
  ...validateRequest,
];

// ── Variants ─────────────────────────────────────────────────────────────────

export const createVariantValidator = [
  isGreaterThanZero({ key: 'price' }),
  isGreaterThanZero({ key: 'originalPrice' }),
  isGreaterThanZero({ key: 'stock', allowZero: true }),
  check('moq').optional().isInt({ min: 1 }).withMessage('moq must be an integer >= 1'),
  isArray('attributes'),
  check('attributes').isArray({ min: 1 }).withMessage('attributes must have at least one entry'),
  check('attributes.*.attributeId').isMongoId().withMessage('Invalid attributeId in attributes'),
  check('attributes.*.valueId').isMongoId().withMessage('Invalid valueId in attributes'),
  ...validateRequest,
];

export const bulkCreateVariantsValidator = [
  isArray('attributes'),
  check('attributes').isArray({ min: 1 }).withMessage('attributes must have at least one entry'),
  check('attributes.*.attributeId').isMongoId().withMessage('Invalid attributeId'),
  check('attributes.*.valueIds').isArray({ min: 1 }).withMessage('valueIds must be a non-empty array'),
  isGreaterThanZero({ key: 'defaultPrice' }),
  isGreaterThanZero({ key: 'defaultOriginalPrice' }),
  isGreaterThanZero({ key: 'defaultStock', allowZero: true }),
  ...validateRequest,
];

export const updateVariantValidator = [
  check('price').optional().isNumeric().withMessage('price must be numeric'),
  check('originalPrice').optional().isNumeric().withMessage('originalPrice must be numeric'),
  check('stock').optional().isNumeric().withMessage('stock must be numeric'),
  check('moq').optional().isInt({ min: 1 }).withMessage('moq must be an integer >= 1'),
  check('isActive').optional().isBoolean().withMessage('isActive must be boolean'),
  ...validateRequest,
];

export const adjustStockValidator = [
  check('delta')
    .notEmpty()
    .withMessage('delta is required')
    .isNumeric()
    .withMessage('delta must be a number'),
  ...validateRequest,
];

export const flashSaleValidator = [
  check('flashSalePrice')
    .optional({ nullable: true })
    .isFloat({ min: 0 }).withMessage('flashSalePrice must be a non-negative number'),
  check('flashSaleEndsAt')
    .optional({ nullable: true })
    .isISO8601().withMessage('flashSaleEndsAt must be a valid ISO 8601 date'),
  ...validateRequest,
];
