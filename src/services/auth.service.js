const prisma = require('../config/prisma');
const ApiError = require('../utils/ApiError');
const { hashPassword, comparePassword, DUMMY_HASH } = require('../utils/password');
const { signToken } = require('../utils/jwt');
const { ROLE_NAMES } = require('../utils/permissions');

const userInclude = {
  role: {
    select: {
      id: true,
      name: true,
      permissions: { select: { permission: { select: { key: true } } } },
    },
  },
};

const present = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  isActive: user.isActive,
  role: { id: user.role.id, name: user.role.name },
  permissions: user.role.permissions.map((rp) => rp.permission.key).sort(),
  createdAt: user.createdAt,
});

// Public sign-up: always creates a Customer. Role can never be chosen by the caller.
const register = async ({ name, email, phone, password }) => {
  const role = await prisma.role.findUnique({ where: { name: ROLE_NAMES.CUSTOMER } });
  if (!role) throw ApiError.conflict('Customer role is not configured. Run the database seed.');

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { name, email, phone, passwordHash, roleId: role.id },
    include: userInclude,
  });
  return { user: present(user), token: signToken(user) };
};

const login = async ({ email, password }) => {
  const user = await prisma.user.findUnique({ where: { email }, include: userInclude });
  // Always run a bcrypt comparison so response time does not reveal whether the email exists.
  const valid = await comparePassword(password, user ? user.passwordHash : DUMMY_HASH);
  if (!user || !valid) throw ApiError.unauthorized('Invalid email or password');
  if (!user.isActive) throw ApiError.forbidden('Your account has been deactivated');

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return { user: present(user), token: signToken(user) };
};

const getProfile = async (userId) => {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: userInclude });
  if (!user) throw ApiError.notFound('User not found');
  return present(user);
};

const changePassword = async (userId, { currentPassword, newPassword }) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.notFound('User not found');
  if (!(await comparePassword(currentPassword, user.passwordHash))) {
    throw ApiError.badRequest('Current password is incorrect');
  }
  // Bumping tokenVersion invalidates every previously issued token.
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(newPassword), tokenVersion: { increment: 1 } },
  });
  return { token: signToken(updated) };
};

module.exports = { register, login, getProfile, changePassword };
