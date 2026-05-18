import { check } from 'express-validator';
import { validateRequest } from '.';

export const createBlogValidator = [
  check('title')
    .notEmpty().withMessage('Title is required')
    .isLength({ max: 200 }).withMessage('Title must be 200 characters or fewer'),
  check('excerpt')
    .optional()
    .isLength({ max: 500 }).withMessage('Excerpt must be 500 characters or fewer'),
  check('content')
    .optional(),
  check('coverImage')
    .optional()
    .isURL().withMessage('Cover image must be a valid URL'),
  check('tags')
    .optional()
    .isArray().withMessage('Tags must be an array'),
  check('tags.*')
    .optional()
    .isString().withMessage('Each tag must be a string'),
  check('isPublished')
    .optional()
    .isBoolean().withMessage('isPublished must be a boolean'),
  ...validateRequest,
];

export const updateBlogValidator = [
  check('title')
    .optional()
    .isLength({ max: 200 }).withMessage('Title must be 200 characters or fewer'),
  check('excerpt')
    .optional()
    .isLength({ max: 500 }).withMessage('Excerpt must be 500 characters or fewer'),
  check('coverImage')
    .optional()
    .isURL().withMessage('Cover image must be a valid URL'),
  check('tags')
    .optional()
    .isArray().withMessage('Tags must be an array'),
  check('tags.*')
    .optional()
    .isString().withMessage('Each tag must be a string'),
  check('isPublished')
    .optional()
    .isBoolean().withMessage('isPublished must be a boolean'),
  ...validateRequest,
];
