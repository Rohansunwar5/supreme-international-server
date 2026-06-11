const companyRepo = {
  create: jest.fn(),
  findById: jest.fn(),
  slugExists: jest.fn(),
  update: jest.fn(),
  list: jest.fn(),
};
const userRepo = {
  getEmployeeByEmail: jest.fn(),
  createEmployee: jest.fn(),
  findEmployeesByCompany: jest.fn(),
  findEmployeeById: jest.fn(),
  setEmployeeStatus: jest.fn(),
  updateEmployeeVerificationCode: jest.fn(),
};
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
  default: { sendEmail: jest.fn() },
}));

import companyService from '../../services/company.service';
import { BadRequestError } from '../../errors/bad-request.error';

describe('company.service CRUD', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates a company with a unique slug derived from the name', async () => {
    companyRepo.slugExists.mockResolvedValue(false);
    companyRepo.create.mockImplementation(async (p) => ({ _id: 'c1', ...p }));
    const out = await companyService.createCompany({ name: 'Mercedes Benz', createdBy: 'a1' });
    expect(companyRepo.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Mercedes Benz', slug: 'mercedes-benz', createdBy: 'a1' }));
    expect(out._id).toBe('c1');
  });

  it('de-duplicates a taken slug with a numeric suffix', async () => {
    companyRepo.slugExists.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    companyRepo.create.mockImplementation(async (p) => ({ _id: 'c2', ...p }));
    await companyService.createCompany({ name: 'Acme', createdBy: 'a1' });
    expect(companyRepo.create).toHaveBeenCalledWith(expect.objectContaining({ slug: 'acme-1' }));
  });

  it('throws NotFound when updating a missing company', async () => {
    companyRepo.findById.mockResolvedValue(null);
    await expect(companyService.updateCompany('missing', { name: 'X' })).rejects.toThrow();
  });

  it('rejects an empty name on create', async () => {
    await expect(companyService.createCompany({ name: '   ', createdBy: 'a1' })).rejects.toBeInstanceOf(BadRequestError);
  });
});
