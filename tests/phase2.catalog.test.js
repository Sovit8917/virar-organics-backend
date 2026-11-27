const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { slugify, isUuid } = require('../src/utils/slug');
const cv = require('../src/validators/category.validator');
const pv = require('../src/validators/product.validator');
const { requirePermissions, requireAnyPermission } = require('../src/middleware/authorize');

describe('Phase 2 - Slug & UUID helpers', () => {
  it('slugifies product and category names cleanly', () => {
    assert.equal(slugify('Organic A2 Gir Cow Ghee (500ml)'), 'organic-a2-gir-cow-ghee-500ml');
    assert.equal(slugify('  Cold-Pressed   Coconut Oil!  '), 'cold-pressed-coconut-oil');
  });

  it('validates UUIDs accurately', () => {
    assert.equal(isUuid('550e8400-e29b-41d4-a716-446655440000'), true);
    assert.equal(isUuid('organic-ghee'), false);
  });
});

describe('Phase 2 - Category & Product validators', () => {
  it('validates category creation defaults', () => {
    const parsed = cv.create.parse({ name: 'Cold Pressed Oils' });
    assert.equal(parsed.name, 'Cold Pressed Oils');
    assert.equal(parsed.isActive, true);
    assert.equal(parsed.sortOrder, 0);
  });

  it('rejects product creation when compareAtPrice < price', () => {
    assert.throws(
      () =>
        pv.create.parse({
          name: 'Organic Turmeric Powder',
          sku: 'VO-TUR-250',
          price: 250,
          compareAtPrice: 200,
          categoryId: '550e8400-e29b-41d4-a716-446655440000',
        }),
      /compareAtPrice must be greater than or equal to price/,
    );
  });

  it('rejects invalid price ranges in product listing', () => {
    assert.throws(
      () => pv.listPublic.parse({ minPrice: 500, maxPrice: 100 }),
      /minPrice cannot be greater than maxPrice/,
    );
  });

  it('rejects zero quantity for increment/decrement stock adjustments', () => {
    assert.throws(
      () => pv.adjustStock.parse({ action: 'decrement', quantity: 0 }),
      /Quantity must be greater than 0/,
    );
  });
});

describe('Phase 2 - RBAC middleware checks', () => {
  it('denies Sales Executive or Customer lacking products:create', () => {
    const req = { user: { permissions: new Set(['leads:read', 'store:access']) } };
    let capturedErr;
    requirePermissions('products:create')(req, {}, (err) => {
      capturedErr = err;
    });
    assert.equal(capturedErr.statusCode, 403);
  });

  it('allows Admin with inventory:read on requireAnyPermission', () => {
    const req = { user: { permissions: new Set(['inventory:read']) } };
    let capturedErr;
    requireAnyPermission('products:create', 'inventory:read')(req, {}, (err) => {
      capturedErr = err;
    });
    assert.equal(capturedErr, undefined);
  });
});
