import { NotFoundError } from '../errors/not-found.error';
import { BadRequestError } from '../errors/bad-request.error';
import { CompanyCatalogRepository } from '../repository/companyCatalog.repository';
import { CompanyRepository } from '../repository/company.repository';
import { ProductRepository } from '../repository/product.repository';

interface IDeltas {
  addProductIds?: string[];
  removeProductIds?: string[];
  addCategoryIds?: string[];
  removeCategoryIds?: string[];
}

class CompanyCatalogService {
  constructor(
    private readonly _catalogRepository: CompanyCatalogRepository,
    private readonly _companyRepository: CompanyRepository,
    private readonly _productRepository: ProductRepository,
  ) {}

  async getCatalog(companyId: string) {
    const company = await this._companyRepository.findById(companyId);
    if (!company) throw new NotFoundError('Company not found');

    const doc = await this._catalogRepository.findByCompanyId(companyId);
    return {
      companyId,
      productIds: doc ? doc.productIds.map(id => id.toString()) : [],
      categoryIds: doc ? doc.categoryIds.map(id => id.toString()) : [],
    };
  }

  async updateCatalog(companyId: string, deltas: IDeltas) {
    const company = await this._companyRepository.findById(companyId);
    if (!company) throw new NotFoundError('Company not found');

    if (deltas.addProductIds?.length) {
      const found = await this._productRepository.findByIds(deltas.addProductIds);
      const validIds = new Set(
        found.filter(p => p.isActive && p.visibility === 'public').map(p => p._id.toString()),
      );
      const invalid = deltas.addProductIds.filter(id => !validIds.has(id));
      if (invalid.length) throw new BadRequestError(`Cannot whitelist non-public or unknown products: ${invalid.join(', ')}`);
    }

    const doc = await this._catalogRepository.applyDeltas(companyId, deltas);
    return {
      companyId,
      productIds: doc.productIds.map(id => id.toString()),
      categoryIds: doc.categoryIds.map(id => id.toString()),
    };
  }
}

export default new CompanyCatalogService(
  new CompanyCatalogRepository(),
  new CompanyRepository(),
  new ProductRepository(),
);
