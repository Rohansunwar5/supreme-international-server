import { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../errors/forbidden.error';
import { UserRepository } from '../repository/user.repository';

const userRepository = new UserRepository();

/**
 * Rejects employee accounts on standard (non-company-scoped) flows such as the
 * public checkout. Employees carry an ordinary user JWT, so without this guard an
 * employee could check out any public product at full price via /checkout —
 * escaping their company catalog scope and skipping wallet redemption entirely.
 * They must use /employee/checkout instead.
 */
const blockEmployee = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    if (req.user?._id) {
      const employee = await userRepository.findEmployeeById(req.user._id);
      if (employee) return next(new ForbiddenError('Employees must use the company checkout'));
    }
    return next();
  } catch (err) {
    return next(err);
  }
};

export default blockEmployee;
