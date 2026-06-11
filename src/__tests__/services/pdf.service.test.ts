jest.mock('puppeteer', () => {
  const page = {
    setContent: jest.fn().mockResolvedValue(undefined),
    pdf: jest.fn().mockResolvedValue(Buffer.from('PDFDATA')),
    close: jest.fn().mockResolvedValue(undefined),
  };
  const browser = { newPage: jest.fn().mockResolvedValue(page), close: jest.fn(), connected: true };
  return { __esModule: true, default: { launch: jest.fn().mockResolvedValue(browser) } };
});
jest.mock('../../utils/r2.util', () => ({
  uploadToR2: jest.fn().mockResolvedValue('https://r2.example/quotations/abc.pdf'),
}));

import pdfService from '../../services/pdf.service';
import { uploadToR2 } from '../../utils/r2.util';

describe('pdf.service', () => {
  it('renders a quotation to a PDF and uploads it to R2', async () => {
    const url = await pdfService.renderQuotationPdf({
      quotationNumber: 'QT-1', createdAt: new Date(),
      contact: { name: 'B', email: 'b@x.com', phoneNumber: '', isdCode: '', company: '' },
      items: [{ productName: 'Mug', sku: 'M1', attributeLabels: ['Red'], qty: 50, unitPrice: 100, lineTotal: 5000 }],
      subtotal: 5000, discountAmount: 0, couponCode: null, total: 5000, currency: 'INR',
    } as never);
    expect(url).toBe('https://r2.example/quotations/abc.pdf');
    expect(uploadToR2).toHaveBeenCalledWith(expect.any(Buffer), 'quotations', 'application/pdf');
  });
});
