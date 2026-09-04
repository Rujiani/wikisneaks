import { type Request, type Response } from 'express';
import * as authService from '../services/auth.service.js';
import {
  registerBodySchema,
  loginBodySchema,
} from '../schemas/auth.schemas.js';
import {
  MAX_AGE_ACCESS_TOKEN_MILLISECONDS,
  MAX_AGE_REFRESH_TOKEN_MILLISECONDS,
} from '../utils/json.token.js';
import { unauthorized } from '../utils/http.errors.js';

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
};

const refreshCookiePath = '/api/auth';

const setAuthCookies = (
  res: Response,
  accessToken: string,
  refreshToken: string,
) => {
  return res
    .cookie('accessToken', accessToken, {
      ...cookieOptions,
      maxAge: MAX_AGE_ACCESS_TOKEN_MILLISECONDS,
    })
    .cookie('refreshToken', refreshToken, {
      ...cookieOptions,
      maxAge: MAX_AGE_REFRESH_TOKEN_MILLISECONDS,
      path: refreshCookiePath,
    });
};

const clearAuthCookies = (res: Response) => {
  return res
    .clearCookie('accessToken', cookieOptions)
    .clearCookie('refreshToken', {
      ...cookieOptions,
      path: refreshCookiePath,
    });
};

const register = async (req: Request, res: Response) => {
  const body = await registerBodySchema.parseAsync(req.body);

  const { accessToken, refreshToken } = await authService.register(
    body.login,
    body.password,
  );

  setAuthCookies(res, accessToken, refreshToken)
    .status(201)
    .json({ message: 'Registration successful' });
};

const login = async (req: Request, res: Response) => {
  const body = await loginBodySchema.parseAsync(req.body);
  const { accessToken, refreshToken } = await authService.login(
    body.login,
    body.password,
  );
  setAuthCookies(res, accessToken, refreshToken)
    .status(200)
    .json({ message: 'Login successful' });
};

const refresh = async (req: Request, res: Response) => {
  const refreshToken = req.cookies.refreshToken;

  if (!refreshToken) {
    throw unauthorized('No refresh token provided');
  }

  const { newAccessToken, newRefreshToken } =
    await authService.refresh(refreshToken);
  setAuthCookies(res, newAccessToken, newRefreshToken)
    .status(200)
    .json({ message: 'Refresh successful' });
};

const logout = async (req: Request, res: Response) => {
  const refreshToken = req.cookies.refreshToken;
  if (refreshToken) {
    await authService.logout(refreshToken);
  }
  clearAuthCookies(res).status(200).json({ message: 'Logout successful' });
};

export { register, login, refresh, logout };
