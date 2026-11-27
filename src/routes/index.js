const router = require('express').Router();

router.get('/health', (req, res) => res.json({ success: true, data: { status: 'ok', uptime: process.uptime() } }));
router.use('/auth', require('./auth.routes'));
router.use('/admin', require('./admin.routes'));
router.use('/categories', require('./category.routes'));
router.use('/products', require('./product.routes'));
router.use('/addresses', require('./address.routes'));
router.use('/cart', require('./cart.routes'));
router.use('/orders', require('./order.routes'));
// Phase 4: Razorpay, COD, payment webhooks, concurrency-safe inventory
// Phase 5: bulk enquiries, CRM leads, notes, follow-ups
// Phase 6: dashboard analytics

module.exports = router;
