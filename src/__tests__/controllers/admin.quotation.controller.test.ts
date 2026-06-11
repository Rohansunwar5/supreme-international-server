const listQuotationsSvc = jest.fn();
const updateStatusSvc = jest.fn();
const analyticsSvc = jest.fn();
jest.mock('../../services/quotation.service', () => ({
  __esModule: true,
  default: {
    listQuotations: (...a: unknown[]) => listQuotationsSvc(...a),
    updateStatus: (...a: unknown[]) => updateStatusSvc(...a),
    quotationAnalytics: (...a: unknown[]) => analyticsSvc(...a),
    getQuotation: jest.fn(),
  },
}));

import { listQuotations, updateQuotationStatus, quotationAnalytics } from '../../controllers/admin.quotation.controller';

const mkRes = () => ({});
const run = (handler: (req: unknown, res: unknown, next: (p: unknown) => void) => Promise<void>, req: unknown) =>
  new Promise((resolve) => handler(req, mkRes(), (payload) => resolve(payload)));

describe('admin quotation controller', () => {
  it('listQuotations forwards filters and returns service result', async () => {
    listQuotationsSvc.mockResolvedValue({ items: [], total: 0 });
    const out = await run(listQuotations as never, { query: { status: 'generated', page: '1' } });
    expect(listQuotationsSvc).toHaveBeenCalled();
    expect(out).toEqual({ items: [], total: 0 });
  });

  it('updateQuotationStatus forwards id + status', async () => {
    updateStatusSvc.mockResolvedValue({ _id: 'q1', status: 'converted' });
    const out = await run(updateQuotationStatus as never, { params: { id: 'q1' }, body: { status: 'converted' } });
    expect(updateStatusSvc).toHaveBeenCalledWith('q1', 'converted');
    expect(out).toEqual({ _id: 'q1', status: 'converted' });
  });

  it('quotationAnalytics returns aggregates', async () => {
    analyticsSvc.mockResolvedValue({ totalQuotations: 5, totalDownloads: 9, converted: 2 });
    const out = await run(quotationAnalytics as never, {});
    expect(out).toEqual({ totalQuotations: 5, totalDownloads: 9, converted: 2 });
  });
});
