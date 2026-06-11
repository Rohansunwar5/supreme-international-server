import { buildQuotationWhatsappUrl } from '../../utils/whatsapp.util';

describe('buildQuotationWhatsappUrl', () => {
  it('builds a wa.me url with an encoded prefilled message', () => {
    const url = buildQuotationWhatsappUrl({
      adminNumber: '919876543210',
      quotationNumber: 'QT-2026-ABCD1234',
      total: 5000,
      currency: 'INR',
      pdfUrl: 'https://r2.example/quotations/abc.pdf',
    });
    expect(url.startsWith('https://wa.me/919876543210?text=')).toBe(true);
    const text = decodeURIComponent(url.split('text=')[1]);
    expect(text).toContain('QT-2026-ABCD1234');
    expect(text).toContain('5000');
    expect(text).toContain('https://r2.example/quotations/abc.pdf');
  });

  it('strips non-digits from the admin number', () => {
    const url = buildQuotationWhatsappUrl({
      adminNumber: '+91 98765-43210',
      quotationNumber: 'QT-1', total: 1, currency: 'INR', pdfUrl: 'https://x/y.pdf',
    });
    expect(url.startsWith('https://wa.me/919876543210?text=')).toBe(true);
  });
});
