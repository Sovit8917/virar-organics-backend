const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const ctrl = require('../controllers/auth.controller');
const v = require('../validators/auth.validator');
const validate = require('../middleware/validate');
const authenticate = require('../middleware/authenticate');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { message: 'Too many attempts. Please try again later.' } },
});

router.post('/register', limiter, validate({ body: v.register }), ctrl.register);
router.post('/login', limiter, validate({ body: v.login }), ctrl.login);
router.get('/me', authenticate, ctrl.me);
router.post('/change-password', authenticate, validate({ body: v.changePassword }), ctrl.changePassword);

module.exports = router;
