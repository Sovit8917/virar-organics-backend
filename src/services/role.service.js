const prisma = require('../config/prisma');
const ApiError = require('../utils/ApiError');
const { ROLE_NAMES } = require('../utils/permissions');

const roleInclude = {
  permissions: { include: { permission: { select: { key: true, description: true, group: true } } } },
  _count: { select: { users: true } },
};

const present = (r) => ({
  id: r.id,
  name: r.name,
  description: r.description,
  isSystem: r.isSystem,
  userCount: r._count.users,
  permissions: r.permissions.map((rp) => rp.permission).sort((a, b) => a.key.localeCompare(b.key)),
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

const findOrFail = async (id, client = prisma) => {
  const role = await client.role.findUnique({ where: { id }, include: roleInclude });
  if (!role) throw ApiError.notFound('Role not found');
  return role;
};

const isAdminRole = (role) => role.isSystem && role.name === ROLE_NAMES.ADMIN;

// The Admin role always has full access; its permission set is locked.
const assertAdminUnlocked = (role) => {
  if (isAdminRole(role)) throw ApiError.forbidden('The Admin role is locked and always has full access');
};

const assertNameFree = async (name, exceptId) => {
  const clash = await prisma.role.findFirst({
    where: { name: { equals: name, mode: 'insensitive' }, ...(exceptId && { id: { not: exceptId } }) },
  });
  if (clash) throw ApiError.conflict(`A role named "${clash.name}" already exists`);
};

const resolvePermissions = async (client, keys) => {
  const unique = [...new Set(keys)];
  if (unique.length === 0) return [];
  const found = await client.permission.findMany({ where: { key: { in: unique } }, select: { id: true, key: true } });
  if (found.length !== unique.length) {
    const known = new Set(found.map((f) => f.key));
    const unknown = unique.filter((k) => !known.has(k));
    throw ApiError.unprocessable('Unknown permissions', unknown.map((k) => ({ field: 'permissions', message: `Unknown permission: ${k}` })));
  }
  return found;
};

const list = async () => {
  const roles = await prisma.role.findMany({ include: roleInclude, orderBy: { name: 'asc' } });
  return roles.map(present);
};

const get = async (id) => present(await findOrFail(id));

const create = async ({ name, description, permissions }) => {
  await assertNameFree(name);
  const id = await prisma.$transaction(async (tx) => {
    const perms = await resolvePermissions(tx, permissions);
    const role = await tx.role.create({
      data: {
        name,
        description,
        permissions: { create: perms.map((p) => ({ permissionId: p.id })) },
      },
    });
    return role.id;
  });
  return get(id);
};

const update = async (id, input) => {
  const role = await findOrFail(id);
  if (input.name !== undefined && input.name !== role.name) {
    if (role.isSystem) throw ApiError.forbidden('System roles cannot be renamed');
    await assertNameFree(input.name, id);
  }
  await prisma.role.update({ where: { id }, data: input });
  return get(id);
};

const remove = async (id) => {
  const role = await findOrFail(id);
  if (role.isSystem) throw ApiError.forbidden('System roles cannot be deleted');
  if (role._count.users > 0) {
    throw ApiError.conflict(`Role is assigned to ${role._count.users} user(s). Reassign them first.`);
  }
  await prisma.role.delete({ where: { id } });
};

// Replace the complete permission set of a role (atomic).
const setPermissions = async (id, keys) => {
  const role = await findOrFail(id);
  assertAdminUnlocked(role);
  await prisma.$transaction(async (tx) => {
    const perms = await resolvePermissions(tx, keys);
    await tx.rolePermission.deleteMany({ where: { roleId: id } });
    if (perms.length) {
      await tx.rolePermission.createMany({ data: perms.map((p) => ({ roleId: id, permissionId: p.id })) });
    }
  });
  return get(id);
};

const grantPermissions = async (id, keys) => {
  const role = await findOrFail(id);
  assertAdminUnlocked(role);
  await prisma.$transaction(async (tx) => {
    const perms = await resolvePermissions(tx, keys);
    await tx.rolePermission.createMany({
      data: perms.map((p) => ({ roleId: id, permissionId: p.id })),
      skipDuplicates: true,
    });
  });
  return get(id);
};

const revokePermission = async (id, key) => {
  const role = await findOrFail(id);
  assertAdminUnlocked(role);
  const permission = await prisma.permission.findUnique({ where: { key } });
  if (!permission) throw ApiError.notFound('Permission not found');
  await prisma.rolePermission.deleteMany({ where: { roleId: id, permissionId: permission.id } });
  return get(id);
};

module.exports = { list, get, create, update, remove, setPermissions, grantPermissions, revokePermission };
