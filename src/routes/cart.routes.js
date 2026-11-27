const router = require('express').Router();
const authenticate = require('../middleware/authenticate');
const { requirePermissions: need } = require('../middleware/authorize');
const validate = require('../middleware/validate');
const cart = require('../controllers/cart.controller');
const cv = require('../validators/cart.validator');

router.use(authenticate, need('cart:own'));

router.get('/', cart.getCart);
router.delete('/', cart.clearCart);
router.post('/items', validate({ body: cv.addItem }), cart.addItem);
router.patch('/items/:productId', validate({ params: cv.productIdParam, body: cv.updateItem }), cart.updateItem);
router.delete('/items/:productId', validate({ params: cv.productIdParam }), cart.removeItem);

module.exports = router;
