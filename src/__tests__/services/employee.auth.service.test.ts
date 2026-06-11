const userRepo = {
  getEmployeeWithVerificationCode: jest.fn(),
  activateEmployee: jest.fn(),
  getEmployeeByEmail: jest.fn(),
  updateEmployeeVerificationCode: jest.fn(),
};
const companyRepo = { findById: jest.fn() };
jest.mock('../../repository/user.repository', () => ({
  __esModule: true,
  UserRepository: jest.fn().mockImplementation(() => userRepo),
}));
jest.mock('../../repository/company.repository', () => ({
  __esModule: true,
  CompanyRepository: jest.fn().mockImplementation(() => companyRepo),
}));
jest.mock('../../services/auth.service', () => ({
  __esModule: true,
  default: {
    hashPassword: jest.fn().mockResolvedValue('hashed'),
    verifyHashPassword: jest.fn(),
    generateJWTToken: jest.fn().mockResolvedValue('jwt-token'),
  },
}));

import employeeAuthService from '../../services/employee.auth.service';
import authService from '../../services/auth.service';
import { BadRequestError } from '../../errors/bad-request.error';
import { ForbiddenError } from '../../errors/forbidden.error';

describe('employee.auth.service', () => {
  beforeEach(() => jest.clearAllMocks());

  it('activates a valid invite and returns an access token', async () => {
    userRepo.getEmployeeWithVerificationCode.mockResolvedValue({ _id: 'e1', employeeStatus: 'invited' });
    userRepo.activateEmployee.mockResolvedValue({ _id: 'e1', employeeStatus: 'active' });
    const out = await employeeAuthService.activate('rawtoken', 'password123');
    expect(authService.hashPassword).toHaveBeenCalledWith('password123');
    expect(userRepo.activateEmployee).toHaveBeenCalled();
    expect(out).toEqual({ accessToken: 'jwt-token' });
  });

  it('rejects an invalid invite token', async () => {
    userRepo.getEmployeeWithVerificationCode.mockResolvedValue(null);
    await expect(employeeAuthService.activate('bad', 'password123')).rejects.toBeInstanceOf(BadRequestError);
  });

  it('rejects activating an already-active employee', async () => {
    userRepo.getEmployeeWithVerificationCode.mockResolvedValue({ _id: 'e1', employeeStatus: 'active' });
    await expect(employeeAuthService.activate('rawtoken', 'password123')).rejects.toBeInstanceOf(BadRequestError);
  });

  it('logs in an active employee of an active company', async () => {
    userRepo.getEmployeeByEmail.mockResolvedValue({ _id: 'e1', password: 'hashed', employeeStatus: 'active', companyId: 'c1' });
    (authService.verifyHashPassword as jest.Mock).mockResolvedValue(true);
    companyRepo.findById.mockResolvedValue({ _id: 'c1', status: 'active' });
    const out = await employeeAuthService.login('jo@acme.com', 'password123');
    expect(out).toEqual({ accessToken: 'jwt-token' });
  });

  it('rejects login for a deactivated employee', async () => {
    userRepo.getEmployeeByEmail.mockResolvedValue({ _id: 'e1', password: 'hashed', employeeStatus: 'deactivated', companyId: 'c1' });
    (authService.verifyHashPassword as jest.Mock).mockResolvedValue(true);
    await expect(employeeAuthService.login('jo@acme.com', 'password123')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects login when the company is inactive', async () => {
    userRepo.getEmployeeByEmail.mockResolvedValue({ _id: 'e1', password: 'hashed', employeeStatus: 'active', companyId: 'c1' });
    (authService.verifyHashPassword as jest.Mock).mockResolvedValue(true);
    companyRepo.findById.mockResolvedValue({ _id: 'c1', status: 'inactive' });
    await expect(employeeAuthService.login('jo@acme.com', 'password123')).rejects.toBeInstanceOf(ForbiddenError);
  });
});
