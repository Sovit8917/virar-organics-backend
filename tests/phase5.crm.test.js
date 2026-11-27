const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const ev = require('../src/validators/enquiry.validator');
const lv = require('../src/validators/lead.validator');
const { ALLOWED_LEAD_TRANSITIONS } = require('../src/services/lead.service');
const { requirePermissions } = require('../src/middleware/authorize');

describe('Phase 5 - Bulk Enquiry & Lead validators', () => {
  it('validates bulk enquiry with product name', () => {
    const parsed = ev.createBulkEnquiry.parse({
      name: 'Meera Deshmukh',
      phone: '+91 9820012345',
      email: 'meera@organichub.in',
      product: 'Cold-Pressed Coconut Oil 1L',
      quantity: 50,
      message: 'Need wholesale pricing for monthly supply',
    });
    assert.equal(parsed.quantity, 50);
    assert.equal(parsed.product, 'Cold-Pressed Coconut Oil 1L');
  });

  it('rejects bulk enquiry when neither productId nor product is provided', () => {
    assert.throws(
      () =>
        ev.createBulkEnquiry.parse({
          name: 'Meera Deshmukh',
          phone: '+91 9820012345',
          email: 'meera@organichub.in',
          quantity: 20,
        }),
      /Either productId or product name is required/,
    );
  });

  it('validates follow-up date coercion and nullable clearing', () => {
    const setParsed = lv.setFollowUp.parse({ followUpDate: '2026-11-28T10:30:00Z' });
    assert.ok(setParsed.followUpDate instanceof Date);
    const cleared = lv.setFollowUp.parse({ followUpDate: null });
    assert.equal(cleared.followUpDate, null);
  });
});

describe('Phase 5 - Lead transitions & Sales Executive RBAC', () => {
  it('enforces valid lead status transitions', () => {
    assert.ok(ALLOWED_LEAD_TRANSITIONS.NEW.includes('CONTACTED'));
    assert.ok(ALLOWED_LEAD_TRANSITIONS.CONTACTED.includes('CONVERTED'));
    assert.ok(ALLOWED_LEAD_TRANSITIONS.CONTACTED.includes('LOST'));
    assert.equal(ALLOWED_LEAD_TRANSITIONS.CONVERTED.length, 0);
    assert.equal(ALLOWED_LEAD_TRANSITIONS.LOST.length, 0);
  });

  it('allows Sales Executive on leads:read/update/followups but blocks leads:delete and products/orders', () => {
    const salesReq = { user: { permissions: new Set(['leads:read', 'leads:update', 'leads:followups']) } };

    for (const perm of ['leads:read', 'leads:update', 'leads:followups']) {
      let err;
      requirePermissions(perm)(salesReq, {}, (e) => {
        err = e;
      });
      assert.equal(err, undefined);
    }

    for (const denied of ['leads:delete', 'products:create', 'orders:read-all']) {
      let err;
      requirePermissions(denied)(salesReq, {}, (e) => {
        err = e;
      });
      assert.equal(err.statusCode, 403);
    }
  });
});
