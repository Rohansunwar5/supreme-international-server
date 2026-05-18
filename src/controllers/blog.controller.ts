import { NextFunction, Request, Response } from 'express';
import blogService from '../services/blog.service';

export const listPublishedBlogs = async (req: Request, _res: Response, next: NextFunction) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 12;
  const response = await blogService.listPublished(page, limit);
  next(response);
};

export const getPublishedBlog = async (req: Request, _res: Response, next: NextFunction) => {
  const response = await blogService.getBySlug(req.params.slug);
  next(response);
};
