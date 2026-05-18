import mongoose from 'mongoose';

export interface IBlog extends mongoose.Document {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  coverImage: string;
  createdBy: mongoose.Types.ObjectId;
  tags: string[];
  isPublished: boolean;
  publishedAt: Date | null;
}

const blogSchema = new mongoose.Schema<IBlog>(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    slug: { type: String, required: true, unique: true, lowercase: true },
    excerpt: { type: String, trim: true, maxlength: 500, default: '' },
    content: { type: String, default: '' },
    coverImage: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
    tags: { type: [String], default: [] },
    isPublished: { type: Boolean, default: false },
    publishedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

blogSchema.index({ slug: 1 });
blogSchema.index({ isPublished: 1, publishedAt: -1 });

export default mongoose.model<IBlog>('Blog', blogSchema);
