const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const av = require('../src/validators/address.validator');
const cartV = require('../src/validators/cart.validator');
const ov = require('../src/validators/order.validator');
const { ALLOWED_TRANSITIONS } = require('../src/services/order.service');
const { requirePermissions } = require('../src/middleware/authorize');

describe('Phase 3 - Address, Cart & Order validators', () => {
  it('validates address creation with default country', () => {
    const parsed = av.create.parse({
      fullName: 'Aarav Patil',
      phone: '+91 9876543210',
      addressLine1: '14 Green Valley Road',
      city: 'Virar',
      state: 'Maharashtra',
      postalCode: '401303',
    });
    assert.equal(parsed.country, 'India');
    assert.equal(parsed.isDefault, false);
  });

  it('rejects adding zero quantity to cart', () => {
    assert.throws(
      () =>
        cartV.addItem.parse({
          productId: '550e8400-e29b-41d4-a716-446655440000',
          quantity: 0,
        }),
      /Minimum quantity is 1/,
    );
  });

  it('validates checkout payload with paymentMethod', () => {
    const parsed = ov.checkout.parse({
      addressId: '550e8400-e29b-41d4-a716-446655440000',
      paymentMethod: 'RAZORPAY',
    });
    assert.equal(parsed.paymentMethod, 'RAZORPAY');
  });
});

describe('Phase 3 - Order status transitions & RBAC', () => {
  it('allows valid forward transitions and blocks terminal states', () => {
    assert.ok(ALLOWED_TRANSITIONS.PENDING.includes('PAID'));
    assert.ok(ALLOWED_TRANSITIONS.PAID.includes('SHIPPED'));
    assert.ok(ALLOWED_TRANSITIONS.SHIPPED.includes('DELIVERED'));
    assert.equal(ALLOWED_TRANSITIONS.DELIVERED.length, 0);
    assert.equal(ALLOWED_TRANSITIONS.CANCELLED.length, 0);
  });

  it('blocks Sales Executive from admin orders and customer cart', () => {
    const salesReq = { user: { permissions: new Set(['leads:read', 'leads:update']) } };

    let adminOrderErr;
    requirePermissions('orders:read-all')(salesReq, {}, (err) => {
      adminOrderErr = err;
    });
    assert.equal(adminOrderErr.statusCode, 403);

    let cartErr;
    requirePermissions('cart:own')(salesReq, {}, (err) => {
      cartErr = err;
    });
    assert.equal(cartErr.statusCode, 403);
  });
});
