const findEmployeeById = jest.fn();
const companyFindById = jest.fn();
jest.mock('../../repository/user.repository', () => ({
  __esModule: true,
  UserRepository: jest.fn().mockImplementation(() => ({ findEmployeeById })),
}));
jest.mock('../../repository/company.repository', () => ({
  __esModule: true,
  CompanyRepository: jest.fn().mockImplementation(() => ({ findById: companyFindById })),
}));

import requireEmployee from '../../middlewares/isEmployee.middleware';
import { ForbiddenError } from '../../errors/forbidden.error';

const run = (req: unknown) =>
  new Promise((resolve) => requireEmployee(req as never, {} as never, (err?: unknown) => resolve(err)));

describe('isEmployee middleware', () => {
  beforeEach(() => jest.clearAllMocks());

  it('passes for an active employee of an active company', async () => {
    findEmployeeById.mockResolvedValue({ _id: 'e1', accountType: 'employee', employeeStatus: 'active', companyId: 'c1' });
    companyFindById.mockResolvedValue({ _id: 'c1', status: 'active' });
    const err = await run({ user: { _id: 'e1' } });
    expect(err).toBeUndefined();
  });

  it('rejects when there is no user', async () => {
    const err = await run({});
    expect(err).toBeInstanceOf(ForbiddenError);
  });

  it('rejects a deactivated employee', async () => {
    findEmployeeById.mockResolvedValue({ _id: 'e1', accountType: 'employee', employeeStatus: 'deactivated', companyId: 'c1' });
    const err = await run({ user: { _id: 'e1' } });
    expect(err).toBeInstanceOf(ForbiddenError);
  });

  it('rejects when the company is inactive', async () => {
    findEmployeeById.mockResolvedValue({ _id: 'e1', accountType: 'employee', employeeStatus: 'active', companyId: 'c1' });
    companyFindById.mockResolvedValue({ _id: 'c1', status: 'inactive' });
    const err = await run({ user: { _id: 'e1' } });
    expect(err).toBeInstanceOf(ForbiddenError);
  });
});
