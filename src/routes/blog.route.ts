import { Router } from 'express';
import { asyncHandler } from '../utils/asynchandler';
import { listPublishedBlogs, getPublishedBlog } from '../controllers/blog.controller';

const blogRouter = Router();

blogRouter.get('/', asyncHandler(listPublishedBlogs));
blogRouter.get('/:slug', asyncHandler(getPublishedBlog));

export default blogRouter;
