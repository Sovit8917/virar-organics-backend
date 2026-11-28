const prisma = require('../config/prisma');
const ApiError = require('../utils/ApiError');
const { buildMeta } = require('../utils/pagination');
const { getIstDayBounds } = require('../utils/date');

const ALLOWED_LEAD_TRANSITIONS = {
  NEW: ['CONTACTED', 'CONVERTED', 'LOST'],
  CONTACTED: ['NEW', 'CONVERTED', 'LOST'],
  CONVERTED: [],
  LOST: [],
};

const leadSummarySelect = {
  id: true,
  enquiryId: true,
  name: true,
  phone: true,
  email: true,
  productId: true,
  productName: true,
  quantity: true,
  message: true,
  status: true,
  followUpDate: true,
  assignedToId: true,
  assignedTo: { select: { id: true, name: true, email: true } },
  product: { select: { id: true, name: true, slug: true, sku: true } },
  _count: { select: { notes: true } },
  createdAt: true,
  updatedAt: true,
};

const leadDetailSelect = {
  ...leadSummarySelect,
  notes: {
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      content: true,
      createdAt: true,
      author: { select: { id: true, name: true, email: true } },
    },
  },
};

const formatLead = (lead) => {
  const { _count, ...rest } = lead;
  return {
    ...rest,
    noteCount: _count?.notes ?? (Array.isArray(rest.notes) ? rest.notes.length : 0),
  };
};

const findOrFail = async (id, select = leadDetailSelect) => {
  const lead = await prisma.lead.findUnique({ where: { id }, select });
  if (!lead) throw ApiError.notFound('Lead not found');
  return lead;
};

const assertAssigneeExists = async (assignedToId) => {
  if (!assignedToId) return;
  const user = await prisma.user.findUnique({
    where: { id: assignedToId },
    select: { id: true, isActive: true },
  });
  if (!user || !user.isActive) {
    throw ApiError.unprocessable('Assigned staff user does not exist or is inactive', [
      { field: 'assignedToId', message: 'Invalid or inactive user' },
    ]);
  }
};

const list = async ({ page, limit, status, assignedToId, search, hasFollowUp, sortBy, sortOrder }) => {
  const where = {};
  if (status) where.status = status;
  if (assignedToId) where.assignedToId = assignedToId;
  if (typeof hasFollowUp === 'boolean') {
    where.followUpDate = hasFollowUp ? { not: null } : null;
  }
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
      { productName: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [rows, total] = await prisma.$transaction([
    prisma.lead.findMany({
      where,
      select: leadSummarySelect,
      orderBy: [{ [sortBy]: sortOrder }, { createdAt: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.lead.count({ where }),
  ]);

  return { items: rows.map(formatLead), meta: buildMeta(page, limit, total) };
};

const todayFollowUps = async ({ page, limit, assignedToId, includeClosed }) => {
  const { start, end } = getIstDayBounds();

  const where = {
    followUpDate: { gte: start, lte: end },
  };
  if (assignedToId) where.assignedToId = assignedToId;
  if (!includeClosed) {
    where.status = { notIn: ['CONVERTED', 'LOST'] };
  }

  const [rows, total] = await prisma.$transaction([
    prisma.lead.findMany({
      where,
      select: leadSummarySelect,
      orderBy: [{ followUpDate: 'asc' }, { createdAt: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.lead.count({ where }),
  ]);

  return { items: rows.map(formatLead), meta: buildMeta(page, limit, total) };
};

const get = async (id) => formatLead(await findOrFail(id));

const updateStatus = async (id, nextStatus) => {
  const existing = await findOrFail(id, leadSummarySelect);
  const allowed = ALLOWED_LEAD_TRANSITIONS[existing.status] || [];
  if (!allowed.includes(nextStatus)) {
    throw ApiError.conflict(`Cannot transition lead from ${existing.status} to ${nextStatus}`);
  }

  const updated = await prisma.lead.update({
    where: { id },
    data: { status: nextStatus },
    select: leadDetailSelect,
  });
  return formatLead(updated);
};

const setFollowUp = async (id, { followUpDate, assignedToId }) => {
  await findOrFail(id, leadSummarySelect);
  if (assignedToId !== undefined) await assertAssigneeExists(assignedToId);

  const data = { followUpDate };
  if (assignedToId !== undefined) data.assignedToId = assignedToId;

  const updated = await prisma.lead.update({
    where: { id },
    data,
    select: leadDetailSelect,
  });
  return formatLead(updated);
};

const update = async (id, input) => {
  const existing = await findOrFail(id, leadSummarySelect);
  if (input.status !== undefined && input.status !== existing.status) {
    const allowed = ALLOWED_LEAD_TRANSITIONS[existing.status] || [];
    if (!allowed.includes(input.status)) {
      throw ApiError.conflict(`Cannot transition lead from ${existing.status} to ${input.status}`);
    }
  }
  if (input.assignedToId !== undefined) await assertAssigneeExists(input.assignedToId);

  const data = {};
  if (input.status !== undefined) data.status = input.status;
  if (input.followUpDate !== undefined) data.followUpDate = input.followUpDate;
  if (input.assignedToId !== undefined) data.assignedToId = input.assignedToId;

  const updated = await prisma.lead.update({
    where: { id },
    data,
    select: leadDetailSelect,
  });
  return formatLead(updated);
};

const listNotes = async (leadId) => {
  await findOrFail(leadId, { id: true });
  return prisma.leadNote.findMany({
    where: { leadId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      content: true,
      createdAt: true,
      author: { select: { id: true, name: true, email: true } },
    },
  });
};

const addNote = async (leadId, authorId, content) => {
  await findOrFail(leadId, { id: true });
  return prisma.leadNote.create({
    data: { leadId, authorId, content },
    select: {
      id: true,
      leadId: true,
      content: true,
      createdAt: true,
      author: { select: { id: true, name: true, email: true } },
    },
  });
};

const remove = async (id) => {
  await findOrFail(id, { id: true });
  await prisma.lead.delete({ where: { id } });
  return { id, deleted: true };
};

module.exports = {
  ALLOWED_LEAD_TRANSITIONS,
  list,
  todayFollowUps,
  get,
  updateStatus,
  setFollowUp,
  update,
  listNotes,
  addNote,
  remove,
};
