const createCompany = jest.fn();
const inviteEmployee = jest.fn();
const setEmployeeStatus = jest.fn();
jest.mock('../../services/company.service', () => ({
  __esModule: true,
  default: {
    createCompany: (...a: unknown[]) => createCompany(...a),
    listCompanies: jest.fn(),
    getCompany: jest.fn(),
    updateCompany: jest.fn(),
    inviteEmployee: (...a: unknown[]) => inviteEmployee(...a),
    listEmployees: jest.fn(),
    resendInvite: jest.fn(),
    setEmployeeStatus: (...a: unknown[]) => setEmployeeStatus(...a),
  },
}));

import { createCompanyHandler, inviteEmployeeHandler, updateEmployeeStatusHandler } from '../../controllers/admin.company.controller';

const run = (handler: (req: unknown, res: unknown, next: (p: unknown) => void) => Promise<void>, req: unknown) =>
  new Promise((resolve) => handler(req, {}, (payload) => resolve(payload)));

describe('admin company controller', () => {
  beforeEach(() => jest.clearAllMocks());

  it('createCompanyHandler passes body + admin id as createdBy', async () => {
    createCompany.mockResolvedValue({ _id: 'c1' });
    const out = await run(createCompanyHandler as never, { body: { name: 'Acme' }, admin: { _id: 'a1' } });
    expect(createCompany).toHaveBeenCalledWith(expect.objectContaining({ name: 'Acme', createdBy: 'a1' }));
    expect(out).toEqual({ _id: 'c1' });
  });

  it('inviteEmployeeHandler passes companyId param + body', async () => {
    inviteEmployee.mockResolvedValue({ _id: 'e1' });
    await run(inviteEmployeeHandler as never, { params: { id: 'c1' }, body: { firstName: 'Jo', email: 'jo@acme.com' } });
    expect(inviteEmployee).toHaveBeenCalledWith('c1', expect.objectContaining({ email: 'jo@acme.com' }));
  });

  it('updateEmployeeStatusHandler passes employee id + status', async () => {
    setEmployeeStatus.mockResolvedValue({ _id: 'e1', employeeStatus: 'deactivated' });
    await run(updateEmployeeStatusHandler as never, { params: { id: 'e1' }, body: { status: 'deactivated' } });
    expect(setEmployeeStatus).toHaveBeenCalledWith('e1', 'deactivated');
  });
});
