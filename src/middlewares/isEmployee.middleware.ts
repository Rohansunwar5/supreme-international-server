import { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../errors/forbidden.error';
import { UserRepository } from '../repository/user.repository';
import { CompanyRepository } from '../repository/company.repository';

const userRepository = new UserRepository();
const companyRepository = new CompanyRepository();

const requireEmployee = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    if (!req.user?._id) return next(new ForbiddenError('EMPLOYEE_ACCESS_REQUIRED'));

    const employee = await userRepository.findEmployeeById(req.user._id);
    if (!employee || employee.accountType !== 'employee' || employee.employeeStatus !== 'active') {
      return next(new ForbiddenError('EMPLOYEE_ACCESS_REQUIRED'));
    }

    const company = await companyRepository.findById(employee.companyId as string);
    if (!company || company.status !== 'active') return next(new ForbiddenError('COMPANY_INACTIVE'));

    req.companyId = employee.companyId as string;
    return next();
  } catch (err) {
    return next(err);
  }
};

export default requireEmployee;
