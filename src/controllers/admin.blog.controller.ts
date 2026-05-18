import { NextFunction, Request, Response } from 'express';
import blogService from '../services/blog.service';

export const listBlogsAdmin = async (req: Request, _res: Response, next: NextFunction) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  const response = await blogService.adminList(page, limit);
  next(response);
};

export const getBlogAdmin = async (req: Request, _res: Response, next: NextFunction) => {
  const response = await blogService.adminGetById(req.params.id);
  next(response);
};

export const createBlog = async (req: Request, _res: Response, next: NextFunction) => {
  const { title, excerpt, content, coverImage, tags, isPublished } = req.body;
  const response = await blogService.adminCreate({
    title,
    excerpt,
    content,
    coverImage,
    tags,
    isPublished: isPublished === true,
    createdBy: req.admin._id,
  });
  next(response);
};

export const updateBlog = async (req: Request, _res: Response, next: NextFunction) => {
  const { title, excerpt, content, coverImage, tags, isPublished } = req.body;
  const response = await blogService.adminUpdate(req.params.id, {
    title,
    excerpt,
    content,
    coverImage,
    tags,
    isPublished: isPublished !== undefined ? isPublished === true : undefined,
  });
  next(response);
};

export const deleteBlog = async (req: Request, _res: Response, next: NextFunction) => {
  const response = await blogService.adminDelete(req.params.id);
  next(response);
};
