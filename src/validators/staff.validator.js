const { z, idParam, password, email, name, phone, pagination, boolString } = require('./common');

const list = z.object({
  ...pagination,
  search: z.string().trim().max(100).optional(),
  roleId: z.string().uuid().optional(),
  isActive: boolString.optional(),
  includeCustomers: boolString.default('false'),
});

const create = z.object({
  name,
  email,
  phone: phone.optional(),
  password,
  roleId: z.string().uuid('Invalid roleId'),
  isActive: z.boolean().default(true),
});

const update = z
  .object({
    name: name.optional(),
    email: email.optional(),
    phone: phone.nullable().optional(),
    password: password.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' });

const assignRole = z.object({ roleId: z.string().uuid('Invalid roleId') });

module.exports = { idParam, list, create, update, assignRole };
