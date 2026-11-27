const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const { safeEqualHex } = require('../src/utils/razorpay');
const pv = require('../src/validators/payment.validator');

describe('Phase 4 - Razorpay signature & validator helpers', () => {
  it('compares matching and mismatched HMAC hex digests safely', () => {
    const digest = crypto.createHmac('sha256', 'test_secret').update('order_1|pay_1').digest('hex');
    assert.equal(safeEqualHex(digest, digest), true);
    assert.equal(safeEqualHex(digest, `${digest.slice(0, -1)}0`), false);
    assert.equal(safeEqualHex(digest, 'short'), false);
  });

  it('validates Razorpay verification payload', () => {
    const parsed = pv.verifyRazorpay.parse({
      orderId: '550e8400-e29b-41d4-a716-446655440000',
      razorpayOrderId: 'order_Test123',
      razorpayPaymentId: 'pay_Test456',
      razorpaySignature: 'abcdef123456',
    });
    assert.equal(parsed.razorpayOrderId, 'order_Test123');
  });

  it('rejects invalid orderId UUID in payment verification', () => {
    assert.throws(
      () =>
        pv.verifyRazorpay.parse({
          orderId: 'not-a-uuid',
          razorpayOrderId: 'order_Test123',
          razorpayPaymentId: 'pay_Test456',
          razorpaySignature: 'abcdef123456',
        }),
      /Invalid orderId/,
    );
  });
});
