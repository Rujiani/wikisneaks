import type { NextFunction, Request, Response } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import type { ParsedQs } from 'qs';

/** Async `(req, res)` function — no `next`; throw on failure. */
type AsyncFn<
  P,
  ResponseBody,
  RequestBody,
  RequestQuery,
  LocalsObject extends Record<string, unknown>,
> = (
  request: Request<P, ResponseBody, RequestBody, RequestQuery, LocalsObject>,
  response: Response<ResponseBody, LocalsObject>,
) => Promise<void>;

/** Express `(req, res, next)` handler returned by the wrappers. */
type ExpressHandler<
  P,
  ResponseBody,
  RequestBody,
  RequestQuery,
  LocalsObject extends Record<string, unknown>,
> = (
  request: Request<P, ResponseBody, RequestBody, RequestQuery, LocalsObject>,
  response: Response<ResponseBody, LocalsObject>,
  next: NextFunction,
) => Promise<void>;

/**
 * Wraps an async route handler so thrown errors are passed to `next(err)`.
 * On success the chain stops — the handler must send the response.
 * Use for controllers, not for middleware that should call `next()`.
 *
 * @param function_ Async `(req, res)` handler that returns a promise.
 * @returns Express handler with automatic error forwarding.
 */
export function asyncHandler<
  P = ParamsDictionary,
  ResponseBody = unknown,
  RequestBody = unknown,
  RequestQuery = ParsedQs,
  LocalsObject extends Record<string, unknown> = Record<string, unknown>,
>(
  function_: AsyncFn<P, ResponseBody, RequestBody, RequestQuery, LocalsObject>,
): ExpressHandler<P, ResponseBody, RequestBody, RequestQuery, LocalsObject> {
  return async function (request, response, next) {
    try {
      await function_(request, response);
    } catch (error) {
      next(error);
    }
  };
}
