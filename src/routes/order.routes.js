const router = require('express').Router();
const authenticate = require('../middleware/authenticate');
const { requirePermissions: need } = require('../middleware/authorize');
const validate = require('../middleware/validate');
const order = require('../controllers/order.controller');
const ov = require('../validators/order.validator');

router.use(authenticate, need('orders:own'));

router.post('/checkout', validate({ body: ov.checkout }), order.checkout);
router.get('/', validate({ query: ov.listOwn }), order.listOwn);
router.get('/:id', validate({ params: ov.idParam }), order.getOwn);
router.post('/:id/cancel', validate({ params: ov.idParam }), order.cancelOwn);

module.exports = router;
