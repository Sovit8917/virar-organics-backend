const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/response');
const auth = require('../services/auth.service');

exports.register = asyncHandler(async (req, res) => created(res, await auth.register(req.body)));
exports.login = asyncHandler(async (req, res) => ok(res, await auth.login(req.body)));
exports.me = asyncHandler(async (req, res) => ok(res, await auth.getProfile(req.user.id)));
exports.changePassword = asyncHandler(async (req, res) =>
  ok(res, await auth.changePassword(req.user.id, req.body)));
