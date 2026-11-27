const { z, idParam, pagination, boolString } = require('./common');

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, 'Slug is too short')
  .max(160)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must contain only lowercase letters, numbers, and hyphens');

const skuSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(2, 'SKU is too short')
  .max(64)
  .regex(/^[A-Z0-9._-]+$/, 'SKU may only contain letters, numbers, dots, underscores, and hyphens');

const priceSchema = z.coerce
  .number({ invalid_type_error: 'Price must be a number' })
  .positive('Price must be greater than 0')
  .max(10000000, 'Price exceeds maximum allowed');

const idOrSlugParam = z.object({
  idOrSlug: z.string().trim().min(1, 'Product id or slug is required').max(160),
});

const baseListFields = {
  ...pagination,
  search: z.string().trim().max(100).optional(),
  category: z.string().trim().min(1).max(120).optional(),
  categoryId: z.string().uuid('Invalid categoryId').optional(),
  minPrice: z.coerce.number().min(0, 'minPrice cannot be negative').optional(),
  maxPrice: z.coerce.number().min(0, 'maxPrice cannot be negative').optional(),
  inStock: boolString.optional(),
  isFeatured: boolString.optional(),
};

const priceRangeRefine = (v) =>
  v.minPrice === undefined || v.maxPrice === undefined || v.minPrice <= v.maxPrice;

const listPublic = z
  .object({
    ...baseListFields,
    sortBy: z.enum(['createdAt', 'price', 'name']).default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).optional(),
  })
  .refine(priceRangeRefine, {
    message: 'minPrice cannot be greater than maxPrice',
    path: ['minPrice'],
  });

const listAdmin = z
  .object({
    ...baseListFields,
    isActive: boolString.optional(),
    lowStock: boolString.optional(),
    sortBy: z.enum(['createdAt', 'price', 'name', 'stock']).default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).optional(),
  })
  .refine(priceRangeRefine, {
    message: 'minPrice cannot be greater than maxPrice',
    path: ['minPrice'],
  });

const create = z
  .object({
    name: z.string().trim().min(2, 'Product name is too short').max(150),
    slug: slugSchema.optional(),
    sku: skuSchema,
    shortDescription: z.string().trim().max(300).nullable().optional(),
    description: z.string().trim().max(5000).nullable().optional(),
    price: priceSchema,
    compareAtPrice: priceSchema.nullable().optional(),
    unit: z.string().trim().min(1).max(40).default('unit'),
    stock: z.coerce.number().int().min(0, 'Stock cannot be negative').default(0),
    lowStockThreshold: z.coerce.number().int().min(0).max(10000).default(5),
    imageUrl: z.string().trim().url('Invalid imageUrl').max(500).nullable().optional(),
    images: z.array(z.string().trim().url('Invalid image URL').max(500)).max(10).default([]),
    isActive: z.boolean().default(true),
    isFeatured: z.boolean().default(false),
    categoryId: z.string().uuid('Invalid categoryId'),
  })
  .refine(
    (v) => v.compareAtPrice === undefined || v.compareAtPrice === null || v.compareAtPrice >= v.price,
    { message: 'compareAtPrice must be greater than or equal to price', path: ['compareAtPrice'] },
  );

const update = z
  .object({
    name: z.string().trim().min(2, 'Product name is too short').max(150).optional(),
    slug: slugSchema.optional(),
    sku: skuSchema.optional(),
    shortDescription: z.string().trim().max(300).nullable().optional(),
    description: z.string().trim().max(5000).nullable().optional(),
    price: priceSchema.optional(),
    compareAtPrice: priceSchema.nullable().optional(),
    unit: z.string().trim().min(1).max(40).optional(),
    stock: z.coerce.number().int().min(0, 'Stock cannot be negative').optional(),
    lowStockThreshold: z.coerce.number().int().min(0).max(10000).optional(),
    imageUrl: z.string().trim().url('Invalid imageUrl').max(500).nullable().optional(),
    images: z.array(z.string().trim().url('Invalid image URL').max(500)).max(10).optional(),
    isActive: z.boolean().optional(),
    isFeatured: z.boolean().optional(),
    categoryId: z.string().uuid('Invalid categoryId').optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' })
  .refine(
    (v) =>
      v.price === undefined ||
      v.compareAtPrice === undefined ||
      v.compareAtPrice === null ||
      v.compareAtPrice >= v.price,
    { message: 'compareAtPrice must be greater than or equal to price', path: ['compareAtPrice'] },
  );

const updatePrice = z
  .object({
    price: priceSchema,
    compareAtPrice: priceSchema.nullable().optional(),
  })
  .refine(
    (v) => v.compareAtPrice === undefined || v.compareAtPrice === null || v.compareAtPrice >= v.price,
    { message: 'compareAtPrice must be greater than or equal to price', path: ['compareAtPrice'] },
  );

const adjustStock = z
  .object({
    action: z.enum(['set', 'increment', 'decrement']),
    quantity: z.coerce.number().int('Quantity must be an integer').min(0, 'Quantity cannot be negative'),
    reason: z.string().trim().max(200).optional(),
  })
  .refine((v) => v.action === 'set' || v.quantity > 0, {
    message: 'Quantity must be greater than 0 for increment or decrement',
    path: ['quantity'],
  });

module.exports = {
  idParam,
  idOrSlugParam,
  listPublic,
  listAdmin,
  create,
  update,
  updatePrice,
  adjustStock,
};
