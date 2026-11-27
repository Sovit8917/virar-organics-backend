const { z, idParam, name, phone } = require('./common');

const postalCode = z
  .string()
  .trim()
  .min(4, 'Postal code is too short')
  .max(12, 'Postal code is too long')
  .regex(/^[A-Za-z0-9\s-]+$/, 'Invalid postal code');

const create = z.object({
  label: z.string().trim().min(1).max(40).nullable().optional(),
  fullName: name,
  phone,
  addressLine1: z.string().trim().min(3, 'Address line 1 is too short').max(200),
  addressLine2: z.string().trim().max(200).nullable().optional(),
  city: z.string().trim().min(2, 'City is too short').max(80),
  state: z.string().trim().min(2, 'State is too short').max(80),
  postalCode,
  country: z.string().trim().min(2).max(80).default('India'),
  isDefault: z.boolean().default(false),
});

const update = z
  .object({
    label: z.string().trim().min(1).max(40).nullable().optional(),
    fullName: name.optional(),
    phone: phone.optional(),
    addressLine1: z.string().trim().min(3, 'Address line 1 is too short').max(200).optional(),
    addressLine2: z.string().trim().max(200).nullable().optional(),
    city: z.string().trim().min(2, 'City is too short').max(80).optional(),
    state: z.string().trim().min(2, 'State is too short').max(80).optional(),
    postalCode: postalCode.optional(),
    country: z.string().trim().min(2).max(80).optional(),
    isDefault: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' });

module.exports = { idParam, create, update };
