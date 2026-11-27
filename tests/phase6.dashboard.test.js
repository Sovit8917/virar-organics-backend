const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { requirePermissions } = require('../src/middleware/authorize');
const { ALL_KEYS, DEFAULT_ROLES, ROLE_NAMES } = require('../src/utils/permissions');

describe('Phase 6 - Dashboard RBAC & Role Matrix', () => {
  it('allows Admin with dashboard:read and blocks Sales Executive and Customer', () => {
    const adminReq = { user: { permissions: new Set(ALL_KEYS) } };
    const salesDef = DEFAULT_ROLES.find((r) => r.name === ROLE_NAMES.SALES);
    const customerDef = DEFAULT_ROLES.find((r) => r.name === ROLE_NAMES.CUSTOMER);

    let adminErr;
    requirePermissions('dashboard:read')(adminReq, {}, (e) => {
      adminErr = e;
    });
    assert.equal(adminErr, undefined);

    for (const def of [salesDef, customerDef]) {
      const req = { user: { permissions: new Set(def.permissions) } };
      let err;
      requirePermissions('dashboard:read')(req, {}, (e) => {
        err = e;
      });
      assert.equal(err.statusCode, 403);
    }
  });
});
