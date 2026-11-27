const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/response');
const roles = require('../services/role.service');

exports.list = asyncHandler(async (req, res) => ok(res, await roles.list()));
exports.get = asyncHandler(async (req, res) => ok(res, await roles.get(req.params.id)));
exports.create = asyncHandler(async (req, res) => created(res, await roles.create(req.body)));
exports.update = asyncHandler(async (req, res) => ok(res, await roles.update(req.params.id, req.body)));
exports.remove = asyncHandler(async (req, res) => {
  await roles.remove(req.params.id);
  ok(res, { deleted: true });
});
exports.setPermissions = asyncHandler(async (req, res) =>
  ok(res, await roles.setPermissions(req.params.id, req.body.permissions)));
exports.grantPermissions = asyncHandler(async (req, res) =>
  ok(res, await roles.grantPermissions(req.params.id, req.body.permissions)));
exports.revokePermission = asyncHandler(async (req, res) =>
  ok(res, await roles.revokePermission(req.params.id, req.params.key)));
