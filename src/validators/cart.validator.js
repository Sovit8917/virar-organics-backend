const { z } = require('./common');

const productIdParam = z.object({ productId: z.string().uuid('Invalid productId') });

const addItem = z.object({
  productId: z.string().uuid('Invalid productId'),
  quantity: z.coerce.number().int('Quantity must be an integer').min(1, 'Minimum quantity is 1').max(100),
});

const updateItem = z.object({
  quantity: z.coerce.number().int('Quantity must be an integer').min(0, 'Quantity cannot be negative').max(100),
});

module.exports = { productIdParam, addItem, updateItem };
