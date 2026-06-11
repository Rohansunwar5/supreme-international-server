// Global test setup. Keep minimal; per-suite mocks live in each test file.
process.env.NODE_ENV = 'test';
process.env.ADMIN_WHATSAPP_NUMBER = process.env.ADMIN_WHATSAPP_NUMBER || '910000000000';
