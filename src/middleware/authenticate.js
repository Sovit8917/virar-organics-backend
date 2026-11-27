const prisma = require('../config/prisma');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { verifyToken } = require('../utils/jwt');

// The JWT carries identity only. Role and permissions are read from the database
// on every request, so any change made by an Admin takes effect immediately.
module.exports = asyncHandler(async (req, res, next) => {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) throw ApiError.unauthorized('Authentication required');

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    throw ApiError.unauthorized('Invalid or expired token');
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      name: true,
      email: true,
      isActive: true,
      tokenVersion: true,
      role: {
        select: {
          id: true,
          name: true,
          permissions: { select: { permission: { select: { key: true } } } },
        },
      },
    },
  });

  if (!user || user.tokenVersion !== payload.tv) {
    throw ApiError.unauthorized('Invalid or expired token');
  }
  if (!user.isActive) throw ApiError.forbidden('Your account has been deactivated');

  req.user = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: { id: user.role.id, name: user.role.name },
    permissions: new Set(user.role.permissions.map((rp) => rp.permission.key)),
  };
  next();
});
