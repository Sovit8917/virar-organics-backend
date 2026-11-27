const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/response');
const permissions = require('../services/permission.service');

exports.list = asyncHandler(async (req, res) => ok(res, await permissions.list(req.query)));
exports.get = asyncHandler(async (req, res) => ok(res, await permissions.get(req.params.id)));
exports.create = asyncHandler(async (req, res) => created(res, await permissions.create(req.body)));
exports.update = asyncHandler(async (req, res) =>
  ok(res, await permissions.update(req.params.id, req.body)));
exports.remove = asyncHandler(async (req, res) => {
  await permissions.remove(req.params.id);
  ok(res, { deleted: true });
});
