const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const paymentService = require('../services/payment.service');

exports.verifyRazorpay = asyncHandler(async (req, res) =>
  ok(res, await paymentService.verifyRazorpayPayment(req.user.id, req.body)),
);

exports.razorpayWebhook = asyncHandler(async (req, res) =>
  ok(res, await paymentService.handleRazorpayWebhook(req.body, req.headers)),
);
