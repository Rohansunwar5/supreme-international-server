import variantService from '../../services/catalog/productVariant.service';

describe('variant service moq passthrough', () => {
  it('rejects moq < 1 at the service boundary', () => {
    expect(() => variantService.assertMoq(0)).toThrow();
  });

  it('accepts moq >= 1', () => {
    expect(() => variantService.assertMoq(5)).not.toThrow();
  });

  it('accepts undefined moq (optional)', () => {
    expect(() => variantService.assertMoq(undefined as unknown as number)).not.toThrow();
  });
});
