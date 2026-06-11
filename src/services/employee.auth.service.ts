import { customAlphabet } from 'nanoid';
import { BadRequestError } from '../errors/bad-request.error';
import { ForbiddenError } from '../errors/forbidden.error';
import { NotFoundError } from '../errors/not-found.error';
import { UnauthorizedError } from '../errors/unauthorized.error';
import { UserRepository } from '../repository/user.repository';
import { CompanyRepository } from '../repository/company.repository';
import authService from './auth.service';
import { sha1 } from '../utils/hash.util';

const rotateToken = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', 24);

class EmployeeAuthService {
  constructor(
    private readonly _userRepository: UserRepository,
    private readonly _companyRepository: CompanyRepository,
  ) {}

  async verifyInviteToken(rawToken: string) {
    const employee = await this._userRepository.getEmployeeWithVerificationCode(sha1(rawToken));
    if (!employee || employee.employeeStatus !== 'invited') throw new BadRequestError('Invalid or expired invite');
    return true;
  }

  async activate(rawToken: string, password: string) {
    const employee = await this._userRepository.getEmployeeWithVerificationCode(sha1(rawToken));
    if (!employee) throw new BadRequestError('Invalid or expired invite');
    if (employee.employeeStatus !== 'invited') throw new BadRequestError('This invite has already been used');

    const hashedPassword = await authService.hashPassword(password);
    const updated = await this._userRepository.activateEmployee(employee._id, hashedPassword, sha1(rotateToken()));
    if (!updated) throw new BadRequestError('Failed to activate account');

    const accessToken = await authService.generateJWTToken(employee._id);
    return { accessToken };
  }

  async login(email: string, password: string) {
    const employee = await this._userRepository.getEmployeeByEmail(email);
    if (!employee) throw new NotFoundError('Employee not found');
    if (!employee.password) throw new BadRequestError('Account not activated yet');

    const ok = await authService.verifyHashPassword(password, employee.password);
    if (!ok) throw new UnauthorizedError('Invalid Email or Password');

    if (employee.employeeStatus !== 'active') throw new ForbiddenError('Account is not active');

    const company = await this._companyRepository.findById(employee.companyId as string);
    if (!company || company.status !== 'active') throw new ForbiddenError('Company is not active');

    const accessToken = await authService.generateJWTToken(employee._id);
    return { accessToken };
  }

  async forgotPassword(email: string) {
    const employee = await this._userRepository.getEmployeeByEmail(email);
    // Do not leak existence; only act if active.
    if (employee && employee.employeeStatus === 'active') {
      await this._userRepository.updateEmployeeVerificationCode(employee._id, sha1(rotateToken()));
      // NOTE: email delivery of the reset link reuses mail.service in the controller-facing flow.
    }
    return true;
  }

  async resetPassword(rawToken: string, password: string) {
    const employee = await this._userRepository.getEmployeeWithVerificationCode(sha1(rawToken));
    if (!employee || employee.employeeStatus !== 'active') throw new BadRequestError('Invalid or expired code');

    const hashedPassword = await authService.hashPassword(password);
    const updated = await this._userRepository.activateEmployee(employee._id, hashedPassword, sha1(rotateToken()));
    if (!updated) throw new BadRequestError('Failed to reset password');
    return true;
  }
}

export default new EmployeeAuthService(new UserRepository(), new CompanyRepository());
