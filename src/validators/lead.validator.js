const { z, idParam, pagination, boolString } = require('./common');

const LEAD_STATUSES = ['NEW', 'CONTACTED', 'CONVERTED', 'LOST'];

const list = z.object({
  ...pagination,
  status: z.enum(LEAD_STATUSES).optional(),
  assignedToId: z.string().uuid('Invalid assignedToId').optional(),
  search: z.string().trim().max(100).optional(),
  hasFollowUp: boolString.optional(),
  sortBy: z.enum(['createdAt', 'followUpDate', 'status']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

const todayFollowUps = z.object({
  ...pagination,
  assignedToId: z.string().uuid('Invalid assignedToId').optional(),
  includeClosed: boolString.default('false'),
});

const updateStatus = z.object({
  status: z.enum(LEAD_STATUSES),
});

const setFollowUp = z.object({
  followUpDate: z.coerce.date({ invalid_type_error: 'Invalid followUpDate' }).nullable(),
  assignedToId: z.string().uuid('Invalid assignedToId').nullable().optional(),
});

const update = z
  .object({
    status: z.enum(LEAD_STATUSES).optional(),
    followUpDate: z.coerce.date({ invalid_type_error: 'Invalid followUpDate' }).nullable().optional(),
    assignedToId: z.string().uuid('Invalid assignedToId').nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' });

const addNote = z.object({
  content: z.string().trim().min(1, 'Note content is required').max(2000),
});

module.exports = {
  idParam,
  LEAD_STATUSES,
  list,
  todayFollowUps,
  updateStatus,
  setFollowUp,
  update,
  addNote,
};
