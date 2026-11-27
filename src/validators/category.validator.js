const { z, idParam, pagination, boolString } = require('./common');

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, 'Slug is too short')
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must contain only lowercase letters, numbers, and hyphens');

const idOrSlugParam = z.object({
  idOrSlug: z.string().trim().min(1, 'Category id or slug is required').max(120),
});

const listPublic = z.object({
  ...pagination,
  search: z.string().trim().max(100).optional(),
});

const listAdmin = z.object({
  ...pagination,
  search: z.string().trim().max(100).optional(),
  isActive: boolString.optional(),
  sortBy: z.enum(['sortOrder', 'name', 'createdAt']).default('sortOrder'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

const create = z.object({
  name: z.string().trim().min(2, 'Category name is too short').max(100),
  slug: slugSchema.optional(),
  description: z.string().trim().max(500).nullable().optional(),
  imageUrl: z.string().trim().url('Invalid imageUrl').max(500).nullable().optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(10000).default(0),
});

const update = z
  .object({
    name: z.string().trim().min(2, 'Category name is too short').max(100).optional(),
    slug: slugSchema.optional(),
    description: z.string().trim().max(500).nullable().optional(),
    imageUrl: z.string().trim().url('Invalid imageUrl').max(500).nullable().optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.coerce.number().int().min(0).max(10000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' });

module.exports = { idParam, idOrSlugParam, listPublic, listAdmin, create, update };
