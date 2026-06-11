import companyCatalogModel, { ICompanyCatalog } from '../models/companyCatalog.model';

export class CompanyCatalogRepository {
  private _model = companyCatalogModel;

  async findByCompanyId(companyId: string): Promise<ICompanyCatalog | null> {
    return this._model.findOne({ companyId });
  }

  async applyDeltas(
    companyId: string,
    deltas: { addProductIds?: string[]; removeProductIds?: string[]; addCategoryIds?: string[]; removeCategoryIds?: string[] },
  ): Promise<ICompanyCatalog> {
    // Ensure the doc exists.
    await this._model.updateOne(
      { companyId },
      { $setOnInsert: { companyId, productIds: [], categoryIds: [] } },
      { upsert: true },
    );

    if (deltas.addProductIds?.length) {
      await this._model.updateOne({ companyId }, { $addToSet: { productIds: { $each: deltas.addProductIds } } });
    }
    if (deltas.removeProductIds?.length) {
      await this._model.updateOne({ companyId }, { $pull: { productIds: { $in: deltas.removeProductIds } } });
    }
    if (deltas.addCategoryIds?.length) {
      await this._model.updateOne({ companyId }, { $addToSet: { categoryIds: { $each: deltas.addCategoryIds } } });
    }
    if (deltas.removeCategoryIds?.length) {
      await this._model.updateOne({ companyId }, { $pull: { categoryIds: { $in: deltas.removeCategoryIds } } });
    }

    return (await this._model.findOne({ companyId }))!;
  }
}
