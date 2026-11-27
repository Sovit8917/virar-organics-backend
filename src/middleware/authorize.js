const ApiError = require('../utils/ApiError');

// Requires the user to hold EVERY listed permission.
const requirePermissions = (...keys) => (req, res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  const missing = keys.filter((k) => !req.user.permissions.has(k));
  if (missing.length) return next(ApiError.forbidden(`Missing permission: ${missing.join(', ')}`));
  next();
};

// Requires the user to hold AT LEAST ONE of the listed permissions.
const requireAnyPermission = (...keys) => (req, res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (!keys.some((k) => req.user.permissions.has(k))) {
    return next(ApiError.forbidden(`Requires one of: ${keys.join(', ')}`));
  }
  next();
};

module.exports = { requirePermissions, requireAnyPermission };
