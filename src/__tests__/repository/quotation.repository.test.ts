import { QuotationRepository } from '../../repository/quotation.repository';
import quotationModel from '../../models/quotation.model';

jest.mock('../../models/quotation.model');

describe('QuotationRepository', () => {
  const repo = new QuotationRepository();

  it('create delegates to model.create', async () => {
    (quotationModel.create as jest.Mock).mockResolvedValue({ _id: 'q1' });
    const res = await repo.create({ quotationNumber: 'QT-1' } as never);
    expect(quotationModel.create).toHaveBeenCalledWith({ quotationNumber: 'QT-1' });
    expect(res).toEqual({ _id: 'q1' });
  });

  it('incrementDownload uses findByIdAndUpdate with $inc', async () => {
    (quotationModel.findByIdAndUpdate as jest.Mock).mockResolvedValue({ _id: 'q1', downloadCount: 1 });
    await repo.incrementDownload('q1');
    expect(quotationModel.findByIdAndUpdate).toHaveBeenCalledWith(
      'q1',
      { $inc: { downloadCount: 1 }, $set: expect.any(Object) },
      { new: true },
    );
  });
});
