const router = require('express').Router();
const authenticate = require('../middleware/authenticate');
const { requirePermissions: need } = require('../middleware/authorize');
const validate = require('../middleware/validate');
const address = require('../controllers/address.controller');
const av = require('../validators/address.validator');

router.use(authenticate, need('addresses:own'));

router.get('/', address.list);
router.post('/', validate({ body: av.create }), address.create);
router.get('/:id', validate({ params: av.idParam }), address.get);
router.patch('/:id', validate({ params: av.idParam, body: av.update }), address.update);
router.delete('/:id', validate({ params: av.idParam }), address.remove);

module.exports = router;
