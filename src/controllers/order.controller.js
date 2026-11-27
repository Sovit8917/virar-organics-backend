const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/response');
const orderService = require('../services/order.service');

exports.checkout = asyncHandler(async (req, res) =>
  created(res, await orderService.checkout(req.user.id, req.body)),
);

exports.listOwn = asyncHandler(async (req, res) => {
  const { items, meta } = await orderService.listOwn(req.user.id, req.query);
  ok(res, items, meta);
});

exports.getOwn = asyncHandler(async (req, res) =>
  ok(res, await orderService.getOwn(req.user.id, req.params.id)),
);

exports.cancelOwn = asyncHandler(async (req, res) =>
  ok(res, await orderService.cancelOwn(req.user.id, req.params.id)),
);

exports.listAdmin = asyncHandler(async (req, res) => {
  const { items, meta } = await orderService.listAdmin(req.query);
  ok(res, items, meta);
});

exports.getAdmin = asyncHandler(async (req, res) =>
  ok(res, await orderService.getAdmin(req.params.id)),
);

exports.updateStatus = asyncHandler(async (req, res) =>
  ok(res, await orderService.updateStatus(req.params.id, req.body.status)),
);

exports.retryRefund = asyncHandler(async (req, res) =>
  ok(res, await orderService.retryRefund(req.params.id)),
);
