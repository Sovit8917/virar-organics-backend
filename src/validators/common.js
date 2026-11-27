const { z } = require('zod');

const idParam = z.object({ id: z.string().uuid('Invalid id') });

const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters')
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain a number');

const email = z.string().trim().toLowerCase().email('Invalid email address').max(254);
const name = z.string().trim().min(2, 'Name is too short').max(100);
const phone = z
  .string()
  .trim()
  .regex(/^\+?[0-9\s-]{7,15}$/, 'Invalid phone number');

const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};

const boolString = z.enum(['true', 'false']).transform((v) => v === 'true');

module.exports = { z, idParam, password, email, name, phone, pagination, boolString };
