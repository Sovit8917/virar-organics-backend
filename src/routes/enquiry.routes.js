const router = require('express').Router();
const validate = require('../middleware/validate');
const enquiry = require('../controllers/enquiry.controller');
const ev = require('../validators/enquiry.validator');

router.post('/bulk', validate({ body: ev.createBulkEnquiry }), enquiry.createBulk);

module.exports = router;
