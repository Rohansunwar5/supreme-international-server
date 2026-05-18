import slugify from 'slugify';
import { nanoid } from 'nanoid';
import { NotFoundError } from '../errors/not-found.error';
import { BlogRepository, IUpdateBlogParams } from '../repository/blog.repository';

class BlogService {
  constructor(private readonly _blogRepository: BlogRepository) { }

  async listPublished(page: number, limit: number) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(50, Math.max(1, limit));
    const { docs, total } = await this._blogRepository.findAllPublished(safePage, safeLimit);
    return {
      blogs: docs,
      pagination: { total, page: safePage, limit: safeLimit, pages: Math.ceil(total / safeLimit) },
    };
  }

  async getBySlug(slug: string) {
    const blog = await this._blogRepository.findBySlug(slug);
    if (!blog || !blog.isPublished) throw new NotFoundError('Blog not found');
    return blog;
  }

  async adminList(page: number, limit: number) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(50, Math.max(1, limit));
    const { docs, total } = await this._blogRepository.findAllAdmin(safePage, safeLimit);
    return {
      blogs: docs,
      pagination: { total, page: safePage, limit: safeLimit, pages: Math.ceil(total / safeLimit) },
    };
  }

  async adminGetById(id: string) {
    const blog = await this._blogRepository.findById(id);
    if (!blog) throw new NotFoundError('Blog not found');
    return blog;
  }

  async adminCreate(params: {
    title: string;
    excerpt?: string;
    content?: string;
    coverImage?: string;
    createdBy: string;
    tags?: string[];
    isPublished?: boolean;
  }) {
    let slug = this._generateSlug(params.title);
    if (await this._blogRepository.slugExists(slug)) {
      slug = `${slug}-${nanoid(6)}`;
    }

    return this._blogRepository.create({
      ...params,
      slug,
      isPublished: params.isPublished || false,
      publishedAt: params.isPublished ? new Date() : null,
    });
  }

  async adminUpdate(
    id: string,
    params: {
      title?: string;
      excerpt?: string;
      content?: string;
      coverImage?: string;
      tags?: string[];
      isPublished?: boolean;
    },
  ) {
    const blog = await this._blogRepository.findById(id);
    if (!blog) throw new NotFoundError('Blog not found');

    const updateData: Record<string, unknown> = { ...params };

    if (params.title) {
      let slug = this._generateSlug(params.title);
      if (slug !== blog.slug) {
        if (await this._blogRepository.slugExists(slug, id)) {
          slug = `${slug}-${nanoid(6)}`;
        }
        updateData.slug = slug;
      }
    }

    if (params.isPublished === true && !blog.isPublished) {
      updateData.publishedAt = new Date();
    } else if (params.isPublished === false) {
      updateData.publishedAt = null;
    }

    return this._blogRepository.update(id, updateData as unknown as IUpdateBlogParams);
  }

  async adminDelete(id: string) {
    const blog = await this._blogRepository.findById(id);
    if (!blog) throw new NotFoundError('Blog not found');
    return this._blogRepository.delete(id);
  }

  private _generateSlug(title: string): string {
    return slugify(title, { lower: true, strict: true, trim: true }) || 'untitled';
  }
}

export default new BlogService(new BlogRepository());
