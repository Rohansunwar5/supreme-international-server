import JWT from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { encodedJWTCacheManager } from '../../services/cache/entities';
import { UnauthorizedError } from '../../errors/unauthorized.error';
import { decode, encode, encryptionKey } from '../../services/crypto.service';
import config from '../../config';

interface IJWTVerifyPayload {
  _id: string;
}

const getAuthMiddlewareByJWTSecret = (jwtSecret: string) => async (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    // No credentials supplied → proceed unauthenticated (optional-auth routes
    // treat this as a guest; hard-guarded routes are rejected later by requireAuth).
    if (!token) return next();

    // A token that IS supplied but fails to verify must NOT be silently downgraded
    // to a guest — surface it so forged/expired tokens are rejected everywhere.
    let payload: IJWTVerifyPayload;
    try {
      payload = JWT.verify(token, jwtSecret) as IJWTVerifyPayload;
    } catch {
      throw new UnauthorizedError('Invalid or expired token');
    }
    const { _id } = payload;

    const key = await encryptionKey(config.JWT_CACHE_ENCRYPTION_KEY);
    const cachedJWT = await encodedJWTCacheManager.get({ userId: _id });

    if (!cachedJWT) {
      const encryptedData = await encode(token, key);
      await encodedJWTCacheManager.set({ userId: _id }, encryptedData);
    } else {
      const decodedJWT = await decode(cachedJWT, key);
      if (decodedJWT !== token) {
        throw new UnauthorizedError('Session Expired!');
      }
    }

    req.user = {
      _id,
    };
    next();
  } catch (error) {
    next(error);
  }
};
export default getAuthMiddlewareByJWTSecret;
