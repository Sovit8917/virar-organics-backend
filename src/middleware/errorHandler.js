const { ZodError } = require('zod');
const { Prisma } = require('@prisma/client');
const ApiError = require('../utils/ApiError');
const env = require('../config/env');

// eslint-disable-next-line no-unused-vars
module.exports = (err, req, res, next) => {
  let status = 500;
  let message = 'Internal server error';
  let details;

  if (err instanceof ApiError) {
    status = err.statusCode;
    message = err.message;
    details = err.details;
  } else if (err instanceof ZodError) {
    status = 422;
    message = 'Validation failed';
    details = err.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      status = 409;
      message = `Duplicate value for: ${(err.meta?.target || []).join(', ') || 'unique field'}`;
    } else if (err.code === 'P2025') {
      status = 404;
      message = 'Record not found';
    } else if (err.code === 'P2003') {
      status = 409;
      message = 'Operation blocked by related records';
    }
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'Malformed JSON body';
  } else if (err.type === 'entity.too.large') {
    status = 413;
    message = 'Request body too large';
  }

  if (status >= 500) console.error(err);

  const body = { success: false, error: { message } };
  if (details) body.error.details = details;
  if (!env.isProduction && status >= 500) body.error.stack = err.stack;
  res.status(status).json(body);
};
