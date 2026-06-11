import Quotation from '../../models/quotation.model';

describe('Quotation model', () => {
  it('builds a valid quotation with defaults', () => {
    const q = new Quotation({
      quotationNumber: 'QT-2026-ABCD1234',
      user: '507f1f77bcf86cd799439011',
      contact: { name: 'Buyer', email: 'b@x.com', phoneNumber: '900000', isdCode: '91' },
      items: [{
        variantId: '507f1f77bcf86cd799439012',
        productId: '507f1f77bcf86cd799439013',
        productName: 'Mug', sku: 'MUG-1', attributeLabels: ['Red'],
        unitPrice: 100, qty: 50, moq: 25, lineTotal: 5000,
      }],
      subtotal: 5000, total: 5000, pdfUrl: 'https://r2/x.pdf',
    });
    expect(q.status).toBe('generated');
    expect(q.downloadCount).toBe(0);
    expect(q.currency).toBe('INR');
    expect(q.source).toBe('b2b');
    expect(q.discountAmount).toBe(0);
  });
});
