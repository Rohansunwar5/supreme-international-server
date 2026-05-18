import blogModel from '../models/blog.model';

export interface ICreateBlogParams {
  title: string;
  slug: string;
  excerpt?: string;
  content?: string;
  coverImage?: string;
  createdBy: string;
  tags?: string[];
  isPublished?: boolean;
  publishedAt?: Date | null;
}

export interface IUpdateBlogParams {
  title?: string;
  slug?: string;
  excerpt?: string;
  content?: string;
  coverImage?: string;
  tags?: string[];
  isPublished?: boolean;
  publishedAt?: Date | null;
}

export class BlogRepository {
  private _model = blogModel;

  async create(params: ICreateBlogParams) {
    return this._model.create(params);
  }

  async findById(id: string) {
    return this._model.findById(id).populate('createdBy', 'firstName lastName email');
  }

  async findBySlug(slug: string) {
    return this._model.findOne({ slug }).populate('createdBy', 'firstName lastName email');
  }

  async findAllAdmin(page: number, limit: number) {
    const skip = (page - 1) * limit;
    const [docs, total] = await Promise.all([
      this._model
        .find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('createdBy', 'firstName lastName email'),
      this._model.countDocuments(),
    ]);
    return { docs, total };
  }

  async findAllPublished(page: number, limit: number) {
    const skip = (page - 1) * limit;
    const [docs, total] = await Promise.all([
      this._model
        .find({ isPublished: true })
        .sort({ publishedAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('createdBy', 'firstName lastName email'),
      this._model.countDocuments({ isPublished: true }),
    ]);
    return { docs, total };
  }

  async update(id: string, params: IUpdateBlogParams) {
    return this._model.findByIdAndUpdate(id, { $set: params }, { new: true, runValidators: true }).populate(
      'createdBy',
      'firstName lastName email',
    );
  }

  async delete(id: string) {
    return this._model.findByIdAndDelete(id);
  }

  async slugExists(slug: string, excludeId?: string) {
    const query: Record<string, unknown> = { slug };
    if (excludeId) query._id = { $ne: excludeId };
    const doc = await this._model.findOne(query).select('_id');
    return !!doc;
  }
}
