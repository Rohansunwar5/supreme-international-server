const getCart = jest.fn();
jest.mock('../../services/cart.service', () => ({ __esModule: true, default: { getCart: (...a: unknown[]) => getCart(...a) } }));

const findByIds = jest.fn();
jest.mock('../../repository/productVariant.repository', () => ({
  ProductVariantRepository: jest.fn().mockImplementation(() => ({ findByIds })),
}));

const create = jest.fn();
jest.mock('../../repository/quotation.repository', () => ({
  QuotationRepository: jest.fn().mockImplementation(() => ({ create })),
}));

const renderQuotationPdf = jest.fn();
jest.mock('../../services/pdf.service', () => ({ __esModule: true, default: { renderQuotationPdf: (...a: unknown[]) => renderQuotationPdf(...a) } }));

import quotationService from '../../services/quotation.service';

const verifiedUser = { _id: '507f1f77bcf86cd799439011', firstName: 'Merc', lastName: 'Edes', email: 'm@x.com', phoneNumber: '900', isdCode: '91', verified: true };

const baseCart = {
  sessionId: 's1',
  items: [{ variantId: '507f1f77bcf86cd799439021', productId: '507f1f77bcf86cd799439031', productName: 'Mug', sku: 'M1', attributeLabels: ['Red'], priceSnapshot: 100, qty: 50 }],
  subtotal: 5000, coupon: null, total: 5000, itemCount: 50, hasPriceChanges: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  getCart.mockResolvedValue(baseCart);
  findByIds.mockResolvedValue([{ _id: '507f1f77bcf86cd799439021', isActive: true, moq: 25 }]);
  renderQuotationPdf.mockResolvedValue('https://r2/x.pdf');
  create.mockImplementation(async (doc: { quotationNumber: string }) => ({ _id: { toString: () => 'q1' }, ...doc }));
});

describe('quotationService.generateQuotation', () => {
  it('generates a quotation for a valid verified cart', async () => {
    const res = await quotationService.generateQuotation({ user: verifiedUser, sessionId: 's1' });
    expect(res.pdfUrl).toBe('https://r2/x.pdf');
    expect(res.whatsappUrl).toContain('https://wa.me/');
    expect(res.quotationNumber).toMatch(/^QT-\d{4}-/);
    expect(create).toHaveBeenCalled();
  });

  it('rejects an empty cart', async () => {
    getCart.mockResolvedValue({ ...baseCart, items: [] });
    await expect(quotationService.generateQuotation({ user: verifiedUser, sessionId: 's1' }))
      .rejects.toThrow();
  });

  it('rejects when a line is below MOQ', async () => {
    findByIds.mockResolvedValue([{ _id: '507f1f77bcf86cd799439021', isActive: true, moq: 100 }]); // qty 50 < 100
    await expect(quotationService.generateQuotation({ user: verifiedUser, sessionId: 's1' }))
      .rejects.toThrow();
  });

  it('blocks generation if a variant is inactive', async () => {
    findByIds.mockResolvedValue([{ _id: '507f1f77bcf86cd799439021', isActive: false, moq: 25 }]);
    await expect(quotationService.generateQuotation({ user: verifiedUser, sessionId: 's1' }))
      .rejects.toThrow();
  });

  it('does NOT persist a quotation if PDF generation fails', async () => {
    renderQuotationPdf.mockRejectedValue(new Error('boom'));
    await expect(quotationService.generateQuotation({ user: verifiedUser, sessionId: 's1' }))
      .rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
  });
});
