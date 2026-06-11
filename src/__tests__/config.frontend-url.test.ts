import config from '../config';

describe('config FRONTEND_URL', () => {
  it('exposes a non-empty frontend base url for invite links', () => {
    expect(typeof config.FRONTEND_URL).toBe('string');
    expect(config.FRONTEND_URL.length).toBeGreaterThan(0);
  });
});
