const router = require('express').Router();
const validate = require('../middleware/validate');
const product = require('../controllers/product.controller');
const pv = require('../validators/product.validator');

router.get('/', validate({ query: pv.listPublic }), product.listPublic);
router.get('/:idOrSlug', validate({ params: pv.idOrSlugParam }), product.getPublic);

module.exports = router;
