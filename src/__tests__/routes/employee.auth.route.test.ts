const activate = jest.fn();
const login = jest.fn();
jest.mock('../../services/employee.auth.service', () => ({
  __esModule: true,
  default: {
    verifyInviteToken: jest.fn().mockResolvedValue(true),
    activate: (...a: unknown[]) => activate(...a),
    login: (...a: unknown[]) => login(...a),
    forgotPassword: jest.fn().mockResolvedValue(true),
    resetPassword: jest.fn().mockResolvedValue(true),
  },
}));

import express from 'express';
import request from 'supertest';
import employeeAuthRouter from '../../routes/employee.auth.route';
import { globalHandler } from '../../middlewares/error-handler.middleware';

const app = express();
app.use(express.json());
app.use('/auth/employee', employeeAuthRouter);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((data: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => globalHandler(data as never, req, res as never, next));

describe('employee auth routes', () => {
  beforeEach(() => jest.clearAllMocks());

  it('POST /auth/employee/login returns the access token', async () => {
    login.mockResolvedValue({ accessToken: 'jwt-token' });
    const res = await request(app).post('/auth/employee/login').send({ email: 'jo@acme.com', password: 'password123' });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBe('jwt-token');
    expect(login).toHaveBeenCalledWith('jo@acme.com', 'password123');
  });

  it('POST /auth/employee/activate activates and returns a token', async () => {
    activate.mockResolvedValue({ accessToken: 'jwt-token' });
    const res = await request(app).post('/auth/employee/activate').send({ token: 'rawtoken', password: 'password123' });
    expect(res.status).toBe(200);
    expect(activate).toHaveBeenCalledWith('rawtoken', 'password123');
  });

  it('POST /auth/employee/login validates the email', async () => {
    const res = await request(app).post('/auth/employee/login').send({ email: 'not-an-email', password: 'x' });
    expect(res.status).toBe(422);
  });
});
