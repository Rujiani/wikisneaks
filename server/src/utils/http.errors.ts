import createHttpError from 'http-errors';

const notFound = (errorMsg: string): never => {
  throw createHttpError(404, errorMsg);
};

const unauthorized = (errorMsg = 'Unauthorized'): never => {
  throw createHttpError(401, errorMsg);
};

const forbidden = (errorMsg = 'Forbidden'): never => {
  throw createHttpError(403, errorMsg);
};

export { notFound, unauthorized, forbidden };
