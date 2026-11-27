const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const dashboardService = require('../services/dashboard.service');

exports.getSummary = asyncHandler(async (req, res) =>
  ok(res, await dashboardService.getDashboardSummary()),
);
