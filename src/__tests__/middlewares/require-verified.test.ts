const getUserById = jest.fn();
jest.mock('../../repository/user.repository', () => ({
  UserRepository: jest.fn().mockImplementation(() => ({ getUserById })),
}));

import requireVerified from '../../middlewares/require-verified.middleware';
import { ForbiddenError } from '../../errors/forbidden.error';

const run = (req: unknown) => new Promise((resolve, reject) => {
  requireVerified(req as never, {} as never, (err?: unknown) => (err ? reject(err) : resolve('next')));
});

describe('requireVerified', () => {
  it('passes a verified user', async () => {
    getUserById.mockResolvedValue({ _id: 'u1', verified: true });
    await expect(run({ user: { _id: 'u1' } })).resolves.toBe('next');
  });
  it('blocks when no user on request', async () => {
    await expect(run({})).rejects.toBeInstanceOf(ForbiddenError);
  });
  it('blocks an unverified user', async () => {
    getUserById.mockResolvedValue({ _id: 'u1', verified: false });
    await expect(run({ user: { _id: 'u1' } })).rejects.toBeInstanceOf(ForbiddenError);
  });
});
