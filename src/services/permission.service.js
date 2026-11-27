const prisma = require('../config/prisma');
const ApiError = require('../utils/ApiError');
const { ROLE_NAMES } = require('../utils/permissions');

const select = {
  id: true,
  key: true,
  description: true,
  group: true,
  isSystem: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { roles: true } },
};

const present = (p) => ({
  id: p.id,
  key: p.key,
  description: p.description,
  group: p.group,
  isSystem: p.isSystem,
  roleCount: p._count.roles,
  createdAt: p.createdAt,
  updatedAt: p.updatedAt,
});

const findOrFail = async (id) => {
  const p = await prisma.permission.findUnique({ where: { id }, select });
  if (!p) throw ApiError.notFound('Permission not found');
  return p;
};

const list = async ({ group }) => {
  const items = await prisma.permission.findMany({
    where: group ? { group } : undefined,
    select,
    orderBy: [{ group: 'asc' }, { key: 'asc' }],
  });
  return items.map(present);
};

const get = async (id) => present(await findOrFail(id));

// New permissions are automatically granted to the Admin role so Admin keeps full access.
const create = async ({ key, description, group }) => {
  const created = await prisma.$transaction(async (tx) => {
    const permission = await tx.permission.create({
      data: { key, description, group: group || key.split(':')[0] },
    });
    const admin = await tx.role.findUnique({ where: { name: ROLE_NAMES.ADMIN } });
    if (admin) {
      await tx.rolePermission.create({ data: { roleId: admin.id, permissionId: permission.id } });
    }
    return permission;
  });
  return get(created.id);
};

// The key is immutable: routes reference it in code.
const update = async (id, input) => {
  await findOrFail(id);
  await prisma.permission.update({ where: { id }, data: input });
  return get(id);
};

const remove = async (id) => {
  const p = await findOrFail(id);
  if (p.isSystem) throw ApiError.forbidden('System permissions cannot be deleted');
  await prisma.permission.delete({ where: { id } }); // role links are removed by cascade
};

module.exports = { list, get, create, update, remove };
