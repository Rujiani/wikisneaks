import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';

import { Role } from '../src/generated/prisma/client.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from '../src/utils/json.token.js';
import { TokenType } from '../src/utils/token.type.js';

describe('json.token', () => {
  it('round-trips an access token', () => {
    const token = generateAccessToken(7, 'sneakerfan', Role.ADMIN);
    expect(verifyAccessToken(token)).toEqual({
      userId: 7,
      login: 'sneakerfan',
      role: Role.ADMIN,
      type: TokenType.ACCESS,
    });
  });

  it('round-trips a refresh token', () => {
    const { token, jti } = generateRefreshToken(7);
    expect(verifyRefreshToken(token)).toEqual({
      userId: 7,
      type: TokenType.REFRESH,
      jti,
    });
  });

  it('rejects a refresh token as an access token', () => {
    const { token } = generateRefreshToken(7);
    expect(() => verifyAccessToken(token)).toThrow(jwt.JsonWebTokenError);
  });

  it('rejects an access token as a refresh token', () => {
    const token = generateAccessToken(7, 'sneakerfan', Role.USER);
    expect(() => verifyRefreshToken(token)).toThrow(jwt.JsonWebTokenError);
  });

  it('rejects a token signed with the wrong secret', () => {
    const token = jwt.sign(
      {
        userId: 7,
        login: 'sneakerfan',
        role: Role.USER,
        type: TokenType.ACCESS,
      },
      'not-the-app-secret',
      { algorithm: 'HS256', expiresIn: 60 },
    );

    expect(() => verifyAccessToken(token)).toThrow(jwt.JsonWebTokenError);
  });
});
