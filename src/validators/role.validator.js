const { z, idParam } = require('./common');

const permissionKey = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/, 'Permission key must look like "resource:action"');

const keys = z.array(permissionKey).max(200);

const roleName = z.string().trim().min(2).max(50);
const description = z.string().trim().max(255);

const create = z.object({
  name: roleName,
  description: description.optional(),
  permissions: keys.default([]),
});

const update = z
  .object({ name: roleName.optional(), description: description.nullable().optional() })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' });

const setPermissions = z.object({ permissions: keys });
const grantPermissions = z.object({ permissions: keys.min(1) });

const revokeParams = z.object({
  id: z.string().uuid('Invalid id'),
  key: permissionKey,
});

module.exports = { idParam, create, update, setPermissions, grantPermissions, revokeParams };
