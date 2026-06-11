import companyModel, { ICompany } from '../models/company.model';

export interface ICreateCompanyParams {
  name: string;
  slug: string;
  primaryContact?: { name?: string; email?: string; isdCode?: string; phoneNumber?: string };
  notes?: string;
  createdBy: string;
}

export interface IUpdateCompanyParams {
  name?: string;
  status?: 'active' | 'inactive';
  primaryContact?: { name?: string; email?: string; isdCode?: string; phoneNumber?: string };
  notes?: string;
}

export interface ICompanyListFilter {
  status?: 'active' | 'inactive';
  search?: string;
  page: number;
  limit: number;
}

export class CompanyRepository {
  private _model = companyModel;

  async create(params: ICreateCompanyParams): Promise<ICompany> {
    return this._model.create(params);
  }

  async findById(id: string): Promise<ICompany | null> {
    return this._model.findById(id);
  }

  async slugExists(slug: string): Promise<boolean> {
    const doc = await this._model.findOne({ slug }).select('_id');
    return !!doc;
  }

  async update(id: string, params: IUpdateCompanyParams): Promise<ICompany | null> {
    return this._model.findByIdAndUpdate(id, params, { new: true });
  }

  async list(filter: ICompanyListFilter): Promise<{ items: ICompany[]; total: number }> {
    const query: Record<string, unknown> = {};
    if (filter.status) query.status = filter.status;
    if (filter.search) query.name = { $regex: filter.search, $options: 'i' };

    const skip = (filter.page - 1) * filter.limit;
    const [items, total] = await Promise.all([
      this._model.find(query).sort({ createdAt: -1 }).skip(skip).limit(filter.limit),
      this._model.countDocuments(query),
    ]);
    return { items, total };
  }
}
