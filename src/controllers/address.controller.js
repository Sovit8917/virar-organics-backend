const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/response');
const addressService = require('../services/address.service');

exports.list = asyncHandler(async (req, res) => ok(res, await addressService.list(req.user.id)));
exports.get = asyncHandler(async (req, res) =>
  ok(res, await addressService.get(req.user.id, req.params.id)),
);
exports.create = asyncHandler(async (req, res) =>
  created(res, await addressService.create(req.user.id, req.body)),
);
exports.update = asyncHandler(async (req, res) =>
  ok(res, await addressService.update(req.user.id, req.params.id, req.body)),
);
exports.remove = asyncHandler(async (req, res) =>
  ok(res, await addressService.remove(req.user.id, req.params.id)),
);
