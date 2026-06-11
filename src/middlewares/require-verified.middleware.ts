import { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../errors/forbidden.error';
import { UserRepository } from '../repository/user.repository';

const userRepository = new UserRepository();

const requireVerified = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    if (!req.user?._id) {
      return next(new ForbiddenError('VERIFICATION_REQUIRED'));
    }
    const user = await userRepository.getUserById(req.user._id);
    if (!user || !user.verified) {
      return next(new ForbiddenError('VERIFICATION_REQUIRED'));
    }
    return next();
  } catch (err) {
    return next(err);
  }
};

export default requireVerified;
