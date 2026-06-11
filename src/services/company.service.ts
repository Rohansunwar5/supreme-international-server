import { customAlphabet } from 'nanoid';
import { BadRequestError } from '../errors/bad-request.error';
import { NotFoundError } from '../errors/not-found.error';
import { ConflictError } from '../errors/conflict.error';
import { CompanyRepository, ICompanyListFilter } from '../repository/company.repository';
import { UserRepository } from '../repository/user.repository';
import mailService from './mail.service';
import { sha1 } from '../utils/hash.util';
import config from '../config';

const inviteToken = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', 24);

const slugify = (text: string) =>
  text.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

class CompanyService {
  constructor(
    private readonly _companyRepository: CompanyRepository,
    private readonly _userRepository: UserRepository,
  ) {}

  async createCompany(params: {
    name: string;
    primaryContact?: { name?: string; email?: string; isdCode?: string; phoneNumber?: string };
    notes?: string;
    createdBy: string;
  }) {
    const name = params.name?.trim();
    if (!name) throw new BadRequestError('Company name is required');

    const slug = await this._allocateSlug(slugify(name) || 'company');
    return this._companyRepository.create({
      name,
      slug,
      primaryContact: params.primaryContact,
      notes: params.notes,
      createdBy: params.createdBy,
    });
  }

  async listCompanies(filter: { status?: 'active' | 'inactive'; search?: string; page?: number; limit?: number }) {
    const page = Math.max(1, Number(filter.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(filter.limit) || 20));
    const repoFilter: ICompanyListFilter = { status: filter.status, search: filter.search, page, limit };
    const { items, total } = await this._companyRepository.list(repoFilter);
    return { items, pagination: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  async getCompany(id: string) {
    const company = await this._companyRepository.findById(id);
    if (!company) throw new NotFoundError('Company not found');
    return company;
  }

  async updateCompany(
    id: string,
    params: { name?: string; status?: 'active' | 'inactive'; primaryContact?: { name?: string; email?: string; isdCode?: string; phoneNumber?: string }; notes?: string },
  ) {
    const company = await this._companyRepository.findById(id);
    if (!company) throw new NotFoundError('Company not found');
    return this._companyRepository.update(id, params);
  }

  async inviteEmployee(
    companyId: string,
    params: { firstName: string; lastName?: string; isdCode?: string; phoneNumber?: string; email: string },
  ) {
    const company = await this._companyRepository.findById(companyId);
    if (!company) throw new NotFoundError('Company not found');
    if (company.status !== 'active') throw new BadRequestError('Cannot invite into an inactive company');

    const existing = await this._userRepository.getEmployeeByEmail(params.email);
    if (existing) throw new ConflictError('An employee with this email already exists');

    const rawToken = inviteToken();
    const employee = await this._userRepository.createEmployee({
      firstName: params.firstName,
      lastName: params.lastName,
      isdCode: params.isdCode,
      phoneNumber: params.phoneNumber,
      email: params.email,
      companyId,
      verificationCode: sha1(rawToken),
    });

    this._sendInviteEmail(params.email, company.name, rawToken);
    return employee;
  }

  async listEmployees(companyId: string, status?: string) {
    const company = await this._companyRepository.findById(companyId);
    if (!company) throw new NotFoundError('Company not found');
    return this._userRepository.findEmployeesByCompany(companyId, status);
  }

  async setEmployeeStatus(employeeId: string, status: 'active' | 'deactivated') {
    const employee = await this._userRepository.findEmployeeById(employeeId);
    if (!employee) throw new NotFoundError('Employee not found');
    const updated = await this._userRepository.setEmployeeStatus(employeeId, status);
    if (!updated) throw new NotFoundError('Employee not found');
    return updated;
  }

  async resendInvite(employeeId: string) {
    const employee = await this._userRepository.findEmployeeById(employeeId);
    if (!employee) throw new NotFoundError('Employee not found');
    if (employee.employeeStatus !== 'invited') throw new BadRequestError('Employee has already activated');

    const company = await this._companyRepository.findById(employee.companyId as string);
    if (!company) throw new NotFoundError('Company not found');

    const rawToken = inviteToken();
    await this._userRepository.updateEmployeeVerificationCode(employeeId, sha1(rawToken));
    this._sendInviteEmail(employee.email, company.name, rawToken);
    return true;
  }

  private _sendInviteEmail(email: string, companyName: string, rawToken: string) {
    const activationLink = `${config.FRONTEND_URL}/employee/activate?token=${rawToken}`;
    Promise.resolve(
      mailService.sendEmail(email, 'employee-invite.ejs', { companyName, activationLink }, `You're invited to ${companyName}`),
    ).catch(() => {});
  }

  private async _allocateSlug(base: string): Promise<string> {
    if (!(await this._companyRepository.slugExists(base))) return base;
    let n = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const candidate = `${base}-${n}`;
      if (!(await this._companyRepository.slugExists(candidate))) return candidate;
      n += 1;
    }
  }
}

export default new CompanyService(new CompanyRepository(), new UserRepository());
