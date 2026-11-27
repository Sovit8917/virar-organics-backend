const router = require('express').Router();
const authenticate = require('../middleware/authenticate');
const { requirePermissions: need } = require('../middleware/authorize');
const validate = require('../middleware/validate');
const payment = require('../controllers/payment.controller');
const pv = require('../validators/payment.validator');

router.post('/razorpay/verify', authenticate, need('orders:own'), validate({ body: pv.verifyRazorpay }), payment.verifyRazorpay);

module.exports = router;
