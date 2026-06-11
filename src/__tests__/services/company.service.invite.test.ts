const companyRepo = { findById: jest.fn() };
const userRepo = {
  getEmployeeByEmail: jest.fn(),
  createEmployee: jest.fn(),
  findEmployeesByCompany: jest.fn(),
  findEmployeeById: jest.fn(),
  setEmployeeStatus: jest.fn(),
  updateEmployeeVerificationCode: jest.fn(),
};
const sendEmail = jest.fn();
jest.mock('../../repository/company.repository', () => ({
  __esModule: true,
  CompanyRepository: jest.fn().mockImplementation(() => companyRepo),
}));
jest.mock('../../repository/user.repository', () => ({
  __esModule: true,
  UserRepository: jest.fn().mockImplementation(() => userRepo),
}));
jest.mock('../../services/mail.service', () => ({
  __esModule: true,
  default: { sendEmail: (...a: unknown[]) => sendEmail(...a) },
}));

import companyService from '../../services/company.service';
import { ConflictError } from '../../errors/conflict.error';
import { BadRequestError } from '../../errors/bad-request.error';

describe('company.service invite', () => {
  beforeEach(() => jest.clearAllMocks());

  it('invites an employee into an active company and emails the link', async () => {
    companyRepo.findById.mockResolvedValue({ _id: 'c1', name: 'Acme', status: 'active' });
    userRepo.getEmployeeByEmail.mockResolvedValue(null);
    userRepo.createEmployee.mockImplementation(async (p) => ({ _id: 'e1', ...p }));

    const out = await companyService.inviteEmployee('c1', { firstName: 'Jo', email: 'jo@acme.com' });

    expect(userRepo.createEmployee).toHaveBeenCalledWith(expect.objectContaining({ email: 'jo@acme.com', companyId: 'c1' }));
    expect(sendEmail).toHaveBeenCalledWith('jo@acme.com', 'employee-invite.ejs', expect.objectContaining({ companyName: 'Acme' }), expect.any(String));
    expect(out._id).toBe('e1');
  });

  it('blocks inviting an email that is already an employee', async () => {
    companyRepo.findById.mockResolvedValue({ _id: 'c1', name: 'Acme', status: 'active' });
    userRepo.getEmployeeByEmail.mockResolvedValue({ _id: 'existing' });
    await expect(companyService.inviteEmployee('c1', { firstName: 'Jo', email: 'jo@acme.com' }))
      .rejects.toBeInstanceOf(ConflictError);
  });

  it('blocks inviting into an inactive company', async () => {
    companyRepo.findById.mockResolvedValue({ _id: 'c1', name: 'Acme', status: 'inactive' });
    await expect(companyService.inviteEmployee('c1', { firstName: 'Jo', email: 'jo@acme.com' }))
      .rejects.toBeInstanceOf(BadRequestError);
  });

  it('deactivates an employee', async () => {
    userRepo.findEmployeeById.mockResolvedValue({ _id: 'e1', employeeStatus: 'active' });
    userRepo.setEmployeeStatus.mockResolvedValue({ _id: 'e1', employeeStatus: 'deactivated' });
    const out = await companyService.setEmployeeStatus('e1', 'deactivated');
    expect(userRepo.setEmployeeStatus).toHaveBeenCalledWith('e1', 'deactivated');
    expect(out.employeeStatus).toBe('deactivated');
  });

  it('resend-invite rotates the token only while invited', async () => {
    userRepo.findEmployeeById.mockResolvedValue({ _id: 'e1', email: 'jo@acme.com', employeeStatus: 'invited', companyId: 'c1' });
    companyRepo.findById.mockResolvedValue({ _id: 'c1', name: 'Acme', status: 'active' });
    userRepo.updateEmployeeVerificationCode.mockResolvedValue({ _id: 'e1' });
    await companyService.resendInvite('e1');
    expect(userRepo.updateEmployeeVerificationCode).toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalled();
  });
});
