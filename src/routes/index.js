const router = require('express').Router();

router.get('/health', (req, res) => res.json({ success: true, data: { status: 'ok', uptime: process.uptime() } }));
router.use('/auth', require('./auth.routes'));
router.use('/admin', require('./admin.routes'));
router.use('/categories', require('./category.routes'));
router.use('/products', require('./product.routes'));
router.use('/addresses', require('./address.routes'));
router.use('/cart', require('./cart.routes'));
router.use('/orders', require('./order.routes'));
router.use('/payments', require('./payment.routes'));
router.use('/enquiries', require('./enquiry.routes'));
// Phase 6: dashboard analytics

module.exports = router;
