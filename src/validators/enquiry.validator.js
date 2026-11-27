const { z, name, email, phone } = require('./common');

const createBulkEnquiry = z
  .object({
    name,
    phone,
    email,
    productId: z.string().uuid('Invalid productId').optional(),
    product: z.string().trim().min(2, 'Product name is too short').max(150).optional(),
    quantity: z.coerce.number().int('Quantity must be an integer').min(1, 'Minimum quantity is 1').max(100000),
    message: z.string().trim().max(2000).optional(),
  })
  .refine((v) => Boolean(v.productId || v.product), {
    message: 'Either productId or product name is required',
    path: ['product'],
  });

module.exports = { createBulkEnquiry };
