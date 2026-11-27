require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { PERMISSION_CATALOG, DEFAULT_ROLES, ROLE_NAMES } = require('../src/utils/permissions');

const prisma = new PrismaClient();
const isProd = process.env.NODE_ENV === 'production';
const rounds = Number(process.env.BCRYPT_SALT_ROUNDS) || 12;

const account = (prefix, defaults) => {
  const get = (k, d) => {
    const v = process.env[`SEED_${prefix}_${k}`];
    if (!v && isProd && k !== 'NAME') throw new Error(`SEED_${prefix}_${k} must be set in production`);
    return v || d;
  };
  return {
    name: get('NAME', defaults.name),
    email: get('EMAIL', defaults.email).toLowerCase(),
    password: get('PASSWORD', defaults.password),
  };
};

const SEED_USERS = [
  { roleName: ROLE_NAMES.ADMIN, ...account('ADMIN', { name: 'Virar Admin', email: 'admin@virarorganics.test', password: 'Admin@12345' }) },
  { roleName: ROLE_NAMES.SALES, ...account('SALES', { name: 'Sales Executive', email: 'sales@virarorganics.test', password: 'Sales@12345' }) },
  { roleName: ROLE_NAMES.CUSTOMER, ...account('CUSTOMER', { name: 'Demo Customer', email: 'customer@virarorganics.test', password: 'Customer@12345' }) },
];

async function main() {
  // 1. Permissions (idempotent)
  for (const perm of PERMISSION_CATALOG) {
    await prisma.permission.upsert({
      where: { key: perm.key },
      update: { description: perm.description, group: perm.group, isSystem: true },
      create: { ...perm, isSystem: true },
    });
  }
  const permissions = await prisma.permission.findMany({ select: { id: true, key: true } });
  const idByKey = new Map(permissions.map((p) => [p.key, p.id]));

  // 2. Roles. Admin is always re-synced to ALL permissions; other roles get their
  //    defaults only on first creation so changes made via the admin API survive re-seeding.
  const roleIds = {};
  for (const def of DEFAULT_ROLES) {
    const existing = await prisma.role.findUnique({ where: { name: def.name } });
    const role = existing
      ? await prisma.role.update({ where: { id: existing.id }, data: { description: def.description, isSystem: true } })
      : await prisma.role.create({ data: { name: def.name, description: def.description, isSystem: true } });
    roleIds[def.name] = role.id;

    if (!existing || def.name === ROLE_NAMES.ADMIN) {
      await prisma.rolePermission.createMany({
        data: def.permissions.map((key) => ({ roleId: role.id, permissionId: idByKey.get(key) })),
        skipDuplicates: true,
      });
    }
  }

  // 3. Users (never overwrite an existing account or password)
  for (const u of SEED_USERS) {
    const exists = await prisma.user.findUnique({ where: { email: u.email } });
    if (exists) {
      console.log(`  = ${u.roleName}: ${u.email} already exists`);
      continue;
    }
    await prisma.user.create({
      data: {
        name: u.name,
        email: u.email,
        passwordHash: await bcrypt.hash(u.password, rounds),
        roleId: roleIds[u.roleName],
      },
    });
    console.log(`  + ${u.roleName}: ${u.email}`);
  }
  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
