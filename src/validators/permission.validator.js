const { z, idParam } = require('./common');

const key = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/, 'Permission key must look like "resource:action"')
  .max(100);

const list = z.object({ group: z.string().trim().max(50).optional() });

const create = z.object({
  key,
  description: z.string().trim().max(255).optional(),
  group: z.string().trim().min(1).max(50).optional(),
});

const update = z
  .object({
    description: z.string().trim().max(255).nullable().optional(),
    group: z.string().trim().min(1).max(50).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' });

module.exports = { idParam, list, create, update };
