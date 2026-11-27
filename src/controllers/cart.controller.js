const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const cartService = require('../services/cart.service');

exports.getCart = asyncHandler(async (req, res) => ok(res, await cartService.getCart(req.user.id)));
exports.addItem = asyncHandler(async (req, res) =>
  ok(res, await cartService.addItem(req.user.id, req.body)),
);
exports.updateItem = asyncHandler(async (req, res) =>
  ok(res, await cartService.updateItem(req.user.id, req.params.productId, req.body)),
);
exports.removeItem = asyncHandler(async (req, res) =>
  ok(res, await cartService.removeItem(req.user.id, req.params.productId)),
);
exports.clearCart = asyncHandler(async (req, res) =>
  ok(res, await cartService.clearCart(req.user.id)),
);
