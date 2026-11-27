const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/response');
const leadService = require('../services/lead.service');

exports.list = asyncHandler(async (req, res) => {
  const { items, meta } = await leadService.list(req.query);
  ok(res, items, meta);
});

exports.todayFollowUps = asyncHandler(async (req, res) => {
  const { items, meta } = await leadService.todayFollowUps(req.query);
  ok(res, items, meta);
});

exports.get = asyncHandler(async (req, res) => ok(res, await leadService.get(req.params.id)));

exports.updateStatus = asyncHandler(async (req, res) =>
  ok(res, await leadService.updateStatus(req.params.id, req.body.status)),
);

exports.setFollowUp = asyncHandler(async (req, res) =>
  ok(res, await leadService.setFollowUp(req.params.id, req.body)),
);

exports.update = asyncHandler(async (req, res) =>
  ok(res, await leadService.update(req.params.id, req.body)),
);

exports.listNotes = asyncHandler(async (req, res) =>
  ok(res, await leadService.listNotes(req.params.id)),
);

exports.addNote = asyncHandler(async (req, res) =>
  created(res, await leadService.addNote(req.params.id, req.user.id, req.body.content)),
);

exports.remove = asyncHandler(async (req, res) =>
  ok(res, await leadService.remove(req.params.id)),
);
