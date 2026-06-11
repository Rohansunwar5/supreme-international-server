import express from 'express';
import request from 'supertest';

jest.mock('../../middlewares/auth/verify-token.middleware', () => ({
  __esModule: true,
  default: () => (req: { user?: unknown }, _res: unknown, next: () => void) => { req.user = { _id: 'u1' }; next(); },
}));
jest.mock('../../middlewares/require-verified.middleware', () => ({
  __esModule: true, default: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
jest.mock('../../repository/user.repository', () => ({
  UserRepository: jest.fn().mockImplementation(() => ({
    getUserById: jest.fn().mockResolvedValue({ firstName: 'Merc', email: 'm@x.com', phoneNumber: '900', isdCode: '91' }),
  })),
}));
const generate = jest.fn();
jest.mock('../../services/quotation.service', () => ({
  __esModule: true,
  default: { generateQuotation: (...a: unknown[]) => generate(...a) },
}));

import quotationRouter from '../../routes/quotation.route';

const app = express();
app.use(express.json());
app.use((req, _res, next) => { (req as { sessionId?: string }).sessionId = 's1'; next(); });
app.use('/quotations', quotationRouter);
// minimal next(response) handler mirroring the global handler.
// 4 args are required for Express to treat this as an error/payload handler.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((payload: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(200).json(payload);
});

describe('POST /quotations', () => {
  it('returns the generation result', async () => {
    generate.mockResolvedValue({ quotationId: 'q1', quotationNumber: 'QT-2026-AB', pdfUrl: 'https://r2/x.pdf', whatsappUrl: 'https://wa.me/91?text=x' });
    const res = await request(app).post('/quotations').send({});
    expect(res.status).toBe(200);
    expect(res.body.quotationNumber).toBe('QT-2026-AB');
    expect(res.body.whatsappUrl).toContain('wa.me');
  });
});
