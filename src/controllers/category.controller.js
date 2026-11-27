const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/response');
const categoryService = require('../services/category.service');

exports.listPublic = asyncHandler(async (req, res) => {
  const { items, meta } = await categoryService.listPublic(req.query);
  ok(res, items, meta);
});

exports.getPublic = asyncHandler(async (req, res) =>
  ok(res, await categoryService.getPublic(req.params.idOrSlug)),
);

exports.listAdmin = asyncHandler(async (req, res) => {
  const { items, meta } = await categoryService.listAdmin(req.query);
  ok(res, items, meta);
});

exports.getAdmin = asyncHandler(async (req, res) =>
  ok(res, await categoryService.getAdmin(req.params.id)),
);

exports.create = asyncHandler(async (req, res) =>
  created(res, await categoryService.create(req.body)),
);

exports.update = asyncHandler(async (req, res) =>
  ok(res, await categoryService.update(req.params.id, req.body)),
);

exports.remove = asyncHandler(async (req, res) =>
  ok(res, await categoryService.remove(req.params.id)),
);
