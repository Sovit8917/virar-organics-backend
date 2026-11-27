const router = require('express').Router();
const validate = require('../middleware/validate');
const category = require('../controllers/category.controller');
const cv = require('../validators/category.validator');

router.get('/', validate({ query: cv.listPublic }), category.listPublic);
router.get('/:idOrSlug', validate({ params: cv.idOrSlugParam }), category.getPublic);

module.exports = router;
