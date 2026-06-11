const findByUser = jest.fn();
const countByUser = jest.fn();
const findById = jest.fn();
const incrementDownload = jest.fn();
const updateStatus = jest.fn();
const list = jest.fn();
const totalCount = jest.fn();
const sumDownloads = jest.fn();
const countByStatus = jest.fn();

jest.mock('../../repository/quotation.repository', () => ({
  QuotationRepository: jest.fn().mockImplementation(() => ({
    findByUser, countByUser, findById, incrementDownload, updateStatus, list, totalCount, sumDownloads, countByStatus,
  })),
}));
jest.mock('../../repository/productVariant.repository', () => ({
  ProductVariantRepository: jest.fn().mockImplementation(() => ({ findByIds: jest.fn() })),
}));

// pdf.service pulls in puppeteer (ESM); mock it so Jest doesn't parse puppeteer.
jest.mock('../../services/pdf.service', () => ({ __esModule: true, default: { renderQuotationPdf: jest.fn() } }));

import quotationService from '../../services/quotation.service';

describe('quotation ops', () => {
  it('getQuotationPdf returns url + records a download for the owner', async () => {
    findById.mockResolvedValue({ _id: 'q1', user: { toString: () => 'u1' }, pdfUrl: 'https://r2/x.pdf' });
    incrementDownload.mockResolvedValue({});
    const res = await quotationService.getQuotationPdf('q1', 'u1');
    expect(res.pdfUrl).toBe('https://r2/x.pdf');
    expect(incrementDownload).toHaveBeenCalledWith('q1');
  });

  it('getQuotationPdf forbids a non-owner', async () => {
    findById.mockResolvedValue({ _id: 'q1', user: { toString: () => 'u1' }, pdfUrl: 'x' });
    await expect(quotationService.getQuotationPdf('q1', 'other')).rejects.toThrow();
  });

  it('updateStatus rejects an invalid status', async () => {
    await expect(quotationService.updateStatus('q1', 'bogus' as never)).rejects.toThrow();
  });

  it('analytics aggregates totals', async () => {
    totalCount.mockResolvedValue(10);
    sumDownloads.mockResolvedValue(42);
    countByStatus.mockResolvedValue(3);
    const res = await quotationService.quotationAnalytics();
    expect(res.totalQuotations).toBe(10);
    expect(res.totalDownloads).toBe(42);
    expect(res.converted).toBe(3);
  });
});
