import quotationModel, { IQuotation, QuotationStatus } from '../models/quotation.model';

export interface IQuotationListFilter {
  status?: QuotationStatus;
  search?: string;
  fromDate?: Date;
  toDate?: Date;
  page: number;
  limit: number;
}

export class QuotationRepository {
  private _model = quotationModel;

  async create(doc: Partial<IQuotation>): Promise<IQuotation> {
    return this._model.create(doc);
  }

  async findById(id: string): Promise<IQuotation | null> {
    return this._model.findById(id);
  }

  async findByNumber(quotationNumber: string): Promise<IQuotation | null> {
    return this._model.findOne({ quotationNumber });
  }

  async findByUser(userId: string, page: number, limit: number): Promise<IQuotation[]> {
    return this._model
      .find({ user: userId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);
  }

  async countByUser(userId: string): Promise<number> {
    return this._model.countDocuments({ user: userId });
  }

  async incrementDownload(id: string): Promise<IQuotation | null> {
    return this._model.findByIdAndUpdate(
      id,
      { $inc: { downloadCount: 1 }, $set: { lastDownloadedAt: new Date() } },
      { new: true },
    );
  }

  async updateStatus(id: string, status: QuotationStatus): Promise<IQuotation | null> {
    return this._model.findByIdAndUpdate(id, { status }, { new: true });
  }

  async list(filter: IQuotationListFilter): Promise<{ items: IQuotation[]; total: number }> {
    const query: Record<string, unknown> = {};
    if (filter.status) query.status = filter.status;
    if (filter.search) query.quotationNumber = { $regex: filter.search, $options: 'i' };
    if (filter.fromDate || filter.toDate) {
      query.createdAt = {};
      if (filter.fromDate) (query.createdAt as Record<string, Date>).$gte = filter.fromDate;
      if (filter.toDate) (query.createdAt as Record<string, Date>).$lte = filter.toDate;
    }
    const [items, total] = await Promise.all([
      this._model.find(query).sort({ createdAt: -1 })
        .skip((filter.page - 1) * filter.limit).limit(filter.limit),
      this._model.countDocuments(query),
    ]);
    return { items, total };
  }

  async countByStatus(status: QuotationStatus): Promise<number> {
    return this._model.countDocuments({ status });
  }

  async totalCount(): Promise<number> {
    return this._model.countDocuments({});
  }

  async sumDownloads(): Promise<number> {
    const res = await this._model.aggregate([
      { $group: { _id: null, total: { $sum: '$downloadCount' } } },
    ]);
    return res[0]?.total ?? 0;
  }
}
