import jwt from 'jsonwebtoken';

export interface TokenService {
  sign: (userId: string) => string;
  /** Returns the user id for a valid, unexpired token; otherwise `undefined`. */
  verify: (token: string) => string | undefined;
}

const ALGORITHM = 'HS256';

export const createTokenService = (secret: string, ttlSeconds: number): TokenService => ({
  sign: (userId) =>
    jwt.sign({}, secret, { subject: userId, expiresIn: ttlSeconds, algorithm: ALGORITHM }),
  verify: (token) => {
    try {
      const payload = jwt.verify(token, secret, { algorithms: [ALGORITHM] });
      return typeof payload === 'object' && payload.sub ? payload.sub : undefined;
    } catch {
      return undefined;
    }
  },
});
