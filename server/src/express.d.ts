import type { AccessTokenPayload } from './utils/json.token.js';

declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

export {};
