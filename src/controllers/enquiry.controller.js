const asyncHandler = require('../utils/asyncHandler');
const { created } = require('../utils/response');
const enquiryService = require('../services/enquiry.service');

exports.createBulk = asyncHandler(async (req, res) =>
  created(res, await enquiryService.createBulkEnquiry(req.body)),
);
