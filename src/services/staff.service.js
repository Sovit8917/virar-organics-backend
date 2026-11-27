const prisma = require('../config/prisma');
const ApiError = require('../utils/ApiError');
const { hashPassword } = require('../utils/password');
const { buildMeta } = require('../utils/pagination');
const { ROLE_NAMES } = require('../utils/permissions');

const userSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  role: { select: { id: true, name: true } },
};

const findOrFail = async (id) => {
  const user = await prisma.user.findUnique({ where: { id }, select: userSelect });
  if (!user) throw ApiError.notFound('User not found');
  return user;
};

const isAdmin = (user) => user.role.name === ROLE_NAMES.ADMIN;

// The system must always keep at least one active Admin.
const assertNotLastActiveAdmin = async (userId) => {
  const others = await prisma.user.count({
    where: { id: { not: userId }, isActive: true, role: { name: ROLE_NAMES.ADMIN } },
  });
  if (others === 0) throw ApiError.conflict('Operation blocked: this is the last active Admin');
};

const list = async ({ page, limit, search, roleId, isActive, includeCustomers }) => {
  const where = {};
  if (roleId) where.roleId = roleId;
  else if (!includeCustomers) where.role = { name: { not: ROLE_NAMES.CUSTOMER } };
  if (typeof isActive === 'boolean') where.isActive = isActive;
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ];
  }
  const [items, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      select: userSelect,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);
  return { items, meta: buildMeta(page, limit, total) };
};

const get = (id) => findOrFail(id);

const create = async ({ name, email, phone, password, roleId, isActive }) => {
  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) throw ApiError.unprocessable('Role does not exist', [{ field: 'roleId', message: 'Unknown role' }]);
  return prisma.user.create({
    data: { name, email, phone, isActive, roleId, passwordHash: await hashPassword(password) },
    select: userSelect,
  });
};

const update = async (actorId, id, input) => {
  const target = await findOrFail(id);
  const data = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.email !== undefined) data.email = input.email;
  if (input.phone !== undefined) data.phone = input.phone;

  if (input.isActive !== undefined && input.isActive !== target.isActive) {
    if (input.isActive === false) {
      if (id === actorId) throw ApiError.conflict('You cannot deactivate your own account');
      if (isAdmin(target)) await assertNotLastActiveAdmin(id);
      data.tokenVersion = { increment: 1 };
    }
    data.isActive = input.isActive;
  }
  if (input.password !== undefined) {
    data.passwordHash = await hashPassword(input.password);
    data.tokenVersion = { increment: 1 };
  }
  return prisma.user.update({ where: { id }, data, select: userSelect });
};

// "Delete" is a soft delete (deactivation) so historical orders and leads keep their owner.
const deactivate = async (actorId, id) => {
  const target = await findOrFail(id);
  if (id === actorId) throw ApiError.conflict('You cannot deactivate your own account');
  if (isAdmin(target)) await assertNotLastActiveAdmin(id);
  return prisma.user.update({
    where: { id },
    data: { isActive: false, tokenVersion: { increment: 1 } },
    select: userSelect,
  });
};

const assignRole = async (actorId, id, roleId) => {
  const [target, role] = await Promise.all([findOrFail(id), prisma.role.findUnique({ where: { id: roleId } })]);
  if (!role) throw ApiError.unprocessable('Role does not exist', [{ field: 'roleId', message: 'Unknown role' }]);

  const losingAdmin = isAdmin(target) && role.name !== ROLE_NAMES.ADMIN;
  if (losingAdmin) {
    if (id === actorId) throw ApiError.conflict('You cannot remove your own Admin role');
    if (target.isActive) await assertNotLastActiveAdmin(id);
  }
  return prisma.user.update({ where: { id }, data: { roleId }, select: userSelect });
};

// Revoking a role drops the user back to the default Customer role (store access only).
const revokeRole = async (actorId, id) => {
  const customer = await prisma.role.findUnique({ where: { name: ROLE_NAMES.CUSTOMER } });
  if (!customer) throw ApiError.conflict('Customer role is not configured. Run the database seed.');
  return assignRole(actorId, id, customer.id);
};

module.exports = { list, get, create, update, deactivate, assignRole, revokeRole };
