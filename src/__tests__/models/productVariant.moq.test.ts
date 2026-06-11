import ProductVariant from '../../models/productVariant.model';

describe('ProductVariant MOQ', () => {
  it('defaults moq to 1 when not provided', () => {
    const v = new ProductVariant({
      product: '507f1f77bcf86cd799439011',
      sku: 'TEST-SKU-1',
      price: 100,
      originalPrice: 120,
      stock: 50,
      variantKey: 'default',
    });
    expect(v.moq).toBe(1);
  });

  it('accepts an explicit moq', () => {
    const v = new ProductVariant({
      product: '507f1f77bcf86cd799439011',
      sku: 'TEST-SKU-2',
      price: 100,
      originalPrice: 120,
      stock: 50,
      variantKey: 'default',
      moq: 25,
    });
    expect(v.moq).toBe(25);
  });
});
