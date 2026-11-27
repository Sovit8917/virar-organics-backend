const { z, password, email, name, phone } = require('./common');

const register = z.object({
  name,
  email,
  phone: phone.optional(),
  password,
});

const login = z.object({
  email,
  password: z.string().min(1, 'Password is required').max(72),
});

const changePassword = z
  .object({
    currentPassword: z.string().min(1).max(72),
    newPassword: password,
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: 'New password must differ from the current password',
    path: ['newPassword'],
  });

module.exports = { register, login, changePassword };
