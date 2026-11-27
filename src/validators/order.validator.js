const { z, idParam, pagination } = require('./common');

const ORDER_STATUSES = ['PENDING', 'PAID', 'SHIPPED', 'DELIVERED', 'CANCELLED'];
const PAYMENT_METHODS = ['RAZORPAY', 'COD'];
const PAYMENT_STATUSES = ['PENDING', 'PAID', 'FAILED', 'REFUNDED'];

const checkout = z.object({
  addressId: z.string().uuid('Invalid addressId'),
  paymentMethod: z.enum(PAYMENT_METHODS).default('COD'),
  notes: z.string().trim().max(500).optional(),
});

const listOwn = z.object({
  ...pagination,
  status: z.enum(ORDER_STATUSES).optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

const listAdmin = z.object({
  ...pagination,
  status: z.enum(ORDER_STATUSES).optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).optional(),
  paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
  userId: z.string().uuid('Invalid userId').optional(),
  search: z.string().trim().max(100).optional(),
  sortBy: z.enum(['createdAt', 'totalAmount', 'status']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

const updateStatus = z.object({
  status: z.enum(ORDER_STATUSES),
});

module.exports = {
  idParam,
  ORDER_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  checkout,
  listOwn,
  listAdmin,
  updateStatus,
};
