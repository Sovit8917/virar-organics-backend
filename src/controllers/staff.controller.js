const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/response');
const staff = require('../services/staff.service');

exports.list = asyncHandler(async (req, res) => {
  const { items, meta } = await staff.list(req.query);
  ok(res, items, meta);
});
exports.get = asyncHandler(async (req, res) => ok(res, await staff.get(req.params.id)));
exports.create = asyncHandler(async (req, res) => created(res, await staff.create(req.body)));
exports.update = asyncHandler(async (req, res) =>
  ok(res, await staff.update(req.user.id, req.params.id, req.body)));
exports.deactivate = asyncHandler(async (req, res) =>
  ok(res, await staff.deactivate(req.user.id, req.params.id)));
exports.assignRole = asyncHandler(async (req, res) =>
  ok(res, await staff.assignRole(req.user.id, req.params.id, req.body.roleId)));
exports.revokeRole = asyncHandler(async (req, res) =>
  ok(res, await staff.revokeRole(req.user.id, req.params.id)));
