const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const prisma = require('../src/config/prisma');
const { cancelAndRestoreStock, retryRefund } = require('../src/services/order.service');
const {
  reconcileCapturedPayment,
  processWebhookEvent,
  recoverUnreconciledWebhooks,
} = require('../src/services/payment.service');
const { executeRazorpayRefund } = require('../src/services/refund.service');

describe('Audit 1 - Atomic cancellation/payment race prevents CANCELLED + PAID', () => {
  it('evaluates paymentStatus inside DB WHERE clause so a newly-PAID order transitions to REFUND_PENDING', async () => {
    const updateCalls = [];
    const fakeTx = {
      order: {
        updateMany: async (args) => {
          updateCalls.push(args);
          // First updateMany (unpaid PENDING/FAILED) matches 0 rows because payment won the race
          if (args.where.paymentStatus?.in) return { count: 0 };
          // Second updateMany (PAID Razorpay) claims REFUND_PENDING
          return { count: 1 };
        },
        findUnique: async () => ({
          id: 'ord-race-1',
          status: 'CANCELLED',
          paymentStatus: 'REFUND_PENDING',
          stockRestored: true,
          items: [{ productId: 'prod-1', quantity: 1 }],
        }),
      },
      product: { update: async () => ({}) },
    };

    const res = await cancelAndRestoreStock(fakeTx, 'ord-race-1');
    assert.equal(res.needsRefund, true);
    assert.equal(updateCalls[0].where.paymentStatus.in[0], 'PENDING');
    assert.equal(updateCalls[1].where.paymentStatus, 'PAID');
    assert.equal(updateCalls[1].data.paymentStatus, 'REFUND_PENDING');
  });
});

describe('Audit 2 - Retryable & timeout-safe Razorpay refunds', () => {
  it('allows retrying REFUND_FAILED orders that already have a razorpayRefundId', async () => {
    const origUpdateMany = prisma.order.updateMany;
    const origFindUnique = prisma.order.findUnique;
    const origFetch = global.fetch;

    // Ensure keys are set for test
    const env = require('../src/config/env');
    const origKey = env.RAZORPAY_KEY_ID;
    const origSecret = env.RAZORPAY_KEY_SECRET;
    env.RAZORPAY_KEY_ID = 'rzp_test_key';
    env.RAZORPAY_KEY_SECRET = 'rzp_test_secret';

    let claimedWhere;
    let fetchCalls = 0;
    try {
      prisma.order.updateMany = async (args) => {
        if (!claimedWhere) claimedWhere = args.where;
        return { count: 1 };
      };
      prisma.order.findUnique = async () => ({
        id: 'ord-retry-1',
        orderNumber: 'VO-RETRY-1',
        status: 'CANCELLED',
        paymentMethod: 'RAZORPAY',
        paymentStatus: 'REFUNDED',
        razorpayPaymentId: 'pay_retry_1',
        razorpayRefundId: 'rfnd_active_1',
        totalAmount: 500,
        items: [],
      });
      prisma.paymentTransaction.updateMany = async () => ({ count: 1 });

      // Simulate Razorpay already having a processed refund from an earlier timed-out call!
      global.fetch = async (url, opts) => {
        fetchCalls += 1;
        if (opts?.method === 'GET' && url.includes('/refunds')) {
          return {
            ok: true,
            json: async () => ({ items: [{ id: 'rfnd_active_1', status: 'processed' }] }),
          };
        }
        throw new Error('Should not call POST /refund when an active refund already exists');
      };

      const order = await retryRefund('ord-retry-1');
      assert.equal(claimedWhere.paymentStatus, 'REFUND_FAILED');
      assert.equal(claimedWhere.razorpayRefundId, undefined);
      assert.equal(fetchCalls, 1);
      assert.equal(order.paymentStatus, 'REFUNDED');
    } finally {
      prisma.order.updateMany = origUpdateMany;
      prisma.order.findUnique = origFindUnique;
      global.fetch = origFetch;
      env.RAZORPAY_KEY_ID = origKey;
      env.RAZORPAY_KEY_SECRET = origSecret;
    }
  });
});

describe('Audit 3 - Multiple successful payments for one order', () => {
  it('detects a second capture and claims DUPLICATE_REFUND_PENDING without overwriting primary payment', async () => {
    let createdCapture;
    const fakeDb = {
      order: {
        updateMany: async () => ({ count: 0 }),
        findUnique: async () => ({
          id: 'ord-multi-1',
          orderNumber: 'VO-MULTI-1',
          status: 'PAID',
          paymentStatus: 'PAID',
          razorpayOrderId: 'order_rzp_1',
          razorpayPaymentId: 'pay_primary_1',
          totalAmount: 400,
          items: [],
        }),
      },
      paymentTransaction: {
        findUnique: async () => null,
        create: async (args) => {
          createdCapture = args.data;
          return createdCapture;
        },
      },
    };

    const res = await reconcileCapturedPayment(fakeDb, {
      orderId: 'ord-multi-1',
      razorpayOrderId: 'order_rzp_1',
      razorpayPaymentId: 'pay_duplicate_2',
      amountInPaise: 40000,
    });

    assert.equal(res.transitionedToPaid, false);
    assert.equal(res.needsDuplicateRefund, true);
    assert.equal(createdCapture.razorpayPaymentId, 'pay_duplicate_2');
    assert.equal(createdCapture.status, 'DUPLICATE_REFUND_PENDING');
  });
});

describe('Audit 4 - Unreconciled webhooks & safe recovery', () => {
  it('stores UNRECONCILED when order is missing and allows recovery replay', async () => {
    const origTx = prisma.$transaction;
    const origFindMany = prisma.paymentEvent.findMany;
    let eventStatus = null;
    let eventStore = {
      id: 'evt-row-1',
      eventId: 'evt_unreconciled_1',
      status: 'PROCESSED',
      payload: {
        event: 'payment.captured',
        payload: { payment: { entity: { id: 'pay_1', order_id: 'order_missing', amount: 10000 } } },
      },
    };

    try {
      let orderExists = false;
      prisma.$transaction = async (fn) => {
        const tx = {
          paymentEvent: {
            findUnique: async () => (eventStatus ? { id: eventStore.id, status: eventStatus } : null),
            create: async (args) => {
              eventStatus = args.data.status;
              return eventStore;
            },
            update: async (args) => {
              if (args.data.status) eventStatus = args.data.status;
              return eventStore;
            },
          },
          order: {
            findUnique: async () =>
              orderExists
                ? { id: 'ord-1', orderNumber: 'VO-1', status: 'PENDING', paymentStatus: 'PENDING' }
                : null,
            updateMany: async () => ({ count: 1 }),
          },
          paymentTransaction: {
            upsert: async () => ({}),
          },
        };
        return fn(tx);
      };

      // 1. First delivery: order not found -> marked UNRECONCILED (not permanently consumed)
      const first = await processWebhookEvent({
        eventId: 'evt_unreconciled_1',
        eventType: 'payment.captured',
        payload: eventStore.payload,
        razorpayOrderId: 'order_missing',
        razorpayPaymentId: 'pay_1',
        razorpayRefundId: null,
        amountInPaise: 10000,
      });
      assert.equal(first.unreconciled, true);
      assert.equal(eventStatus, 'UNRECONCILED');

      // 2. Recovery replay once order exists -> reconciled & marked PROCESSED
      orderExists = true;
      prisma.paymentEvent.findMany = async () => [eventStore];
      const rec = await recoverUnreconciledWebhooks();
      assert.equal(rec.scanned, 1);
      assert.equal(rec.recovered, 1);
      assert.equal(eventStatus, 'PROCESSED');

      // 3. Subsequent duplicate delivery -> ignored as duplicate
      const dup = await processWebhookEvent({
        eventId: 'evt_unreconciled_1',
        eventType: 'payment.captured',
        payload: eventStore.payload,
        razorpayOrderId: 'order_missing',
        razorpayPaymentId: 'pay_1',
        razorpayRefundId: null,
        amountInPaise: 10000,
      });
      assert.equal(dup.duplicate, true);
    } finally {
      prisma.$transaction = origTx;
      prisma.paymentEvent.findMany = origFindMany;
    }
  });
});
