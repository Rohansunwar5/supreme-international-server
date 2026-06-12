import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError } from '../../errors/unauthorized.error';
import adminAuthService from '../../services/admin.auth.service';
import { decode, encode, encryptionKey } from '../../services/crypto.service';
import config from '../../config';

const verifyAdminToken = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    // No credentials → leave req.admin unset; requireAdminAuth rejects the request.
    if (!token) return next();

    // A supplied-but-invalid/expired token must be surfaced, not swallowed into a
    // request that silently proceeds without admin identity.
    const adminId = await adminAuthService.verifyTokenAndGetId(token);

    const key = await encryptionKey(config.JWT_CACHE_ENCRYPTION_KEY);
    const cached = await adminAuthService.getCachedToken(adminId);

    if (!cached) {
      await adminAuthService.setCachedToken(adminId, await encode(token, key));
    } else {
      const decoded = await decode(cached, key);
      if (decoded !== token) throw new UnauthorizedError('Session expired');
    }

    req.admin = { _id: adminId };
    next();
  } catch (error) {
    next(error);
  }
};

export default verifyAdminToken;
