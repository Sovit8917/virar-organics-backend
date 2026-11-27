const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/response');
const productService = require('../services/product.service');

exports.listPublic = asyncHandler(async (req, res) => {
  const { items, meta } = await productService.listPublic(req.query);
  ok(res, items, meta);
});

exports.getPublic = asyncHandler(async (req, res) =>
  ok(res, await productService.getPublic(req.params.idOrSlug)),
);

exports.listAdmin = asyncHandler(async (req, res) => {
  const { items, meta } = await productService.listAdmin(req.query);
  ok(res, items, meta);
});

exports.getAdmin = asyncHandler(async (req, res) =>
  ok(res, await productService.getAdmin(req.params.id)),
);

exports.create = asyncHandler(async (req, res) =>
  created(res, await productService.create(req.body)),
);

exports.update = asyncHandler(async (req, res) =>
  ok(res, await productService.update(req.params.id, req.body)),
);

exports.updatePrice = asyncHandler(async (req, res) =>
  ok(res, await productService.updatePrice(req.params.id, req.body)),
);

exports.adjustStock = asyncHandler(async (req, res) =>
  ok(res, await productService.adjustStock(req.params.id, req.body)),
);

exports.remove = asyncHandler(async (req, res) =>
  ok(res, await productService.remove(req.params.id)),
);
