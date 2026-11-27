const prisma = require('../config/prisma');
const { listPaymentRefunds, createRazorpayRefund } = require('../utils/razorpay');

// Checks Razorpay for an already-created active refund (processed or pending) on this payment.
// Prevents duplicate refunds when an earlier HTTP refund request succeeded on Razorpay but timed out locally.
const findExistingActiveRefund = async (razorpayPaymentId) => {
  const refunds = await listPaymentRefunds(razorpayPaymentId);
  return refunds.find((r) => r && (r.status === 'processed' || r.status === 'pending')) || null;
};

const resolveOrCreateRefund = async ({ razorpayPaymentId, amountInPaise, notes, idempotencyKey }) => {
  const existing = await findExistingActiveRefund(razorpayPaymentId);
  if (existing) return existing;

  return createRazorpayRefund({
    razorpayPaymentId,
    amountInPaise,
    notes,
    idempotencyKey,
  });
};

// Executes the external Razorpay refund call after an order has been atomically claimed as REFUND_PENDING.
// Never marks an order REFUNDED unless Razorpay confirms status === 'processed' (otherwise waits for webhook).
const executeRazorpayRefund = async ({ orderId, orderNumber, razorpayPaymentId, amountInPaise, reason }) => {
  if (!razorpayPaymentId) {
    await prisma.order.updateMany({
      where: { id: orderId, paymentStatus: 'REFUND_PENDING' },
      data: { paymentStatus: 'REFUND_FAILED' },
    });
    return { confirmed: false, status: 'REFUND_FAILED', error: 'Missing razorpayPaymentId' };
  }

  try {
    const refund = await resolveOrCreateRefund({
      razorpayPaymentId,
      amountInPaise,
      notes: { orderId, orderNumber, ...(reason ? { reason } : {}) },
      idempotencyKey: `order-refund-${orderId}-${razorpayPaymentId}`,
    });

    const isProcessed = refund?.status === 'processed';
    const now = new Date();

    await prisma.order.updateMany({
      where: { id: orderId, paymentStatus: 'REFUND_PENDING' },
      data: {
        razorpayRefundId: refund.id,
        ...(isProcessed ? { paymentStatus: 'REFUNDED', refundedAt: now } : {}),
      },
    });

    await prisma.paymentTransaction.updateMany({
      where: { razorpayPaymentId },
      data: {
        razorpayRefundId: refund.id,
        status: isProcessed ? 'REFUNDED' : 'REFUND_PENDING',
        lastError: null,
        ...(isProcessed ? { refundedAt: now } : {}),
      },
    });

    return {
      confirmed: isProcessed,
      status: isProcessed ? 'REFUNDED' : 'REFUND_PENDING',
      razorpayRefundId: refund.id,
    };
  } catch (err) {
    await prisma.order.updateMany({
      where: { id: orderId, paymentStatus: 'REFUND_PENDING' },
      data: { paymentStatus: 'REFUND_FAILED' },
    });
    await prisma.paymentTransaction.updateMany({
      where: { razorpayPaymentId },
      data: { status: 'REFUND_FAILED', lastError: err.message },
    });
    return { confirmed: false, status: 'REFUND_FAILED', error: err.message };
  }
};

// Safely refunds an additional/duplicate Razorpay capture on an order without mutating the primary order payment.
const executeDuplicateCaptureRefund = async ({ orderId, orderNumber, razorpayPaymentId, amountInPaise }) => {
  try {
    const refund = await resolveOrCreateRefund({
      razorpayPaymentId,
      amountInPaise,
      notes: { orderId, orderNumber, reason: 'duplicate_payment_capture' },
      idempotencyKey: `dup-refund-${orderId}-${razorpayPaymentId}`,
    });

    const isProcessed = refund?.status === 'processed';
    const now = new Date();

    await prisma.paymentTransaction.updateMany({
      where: {
        razorpayPaymentId,
        status: { in: ['DUPLICATE_REFUND_PENDING', 'DUPLICATE_REFUND_FAILED'] },
      },
      data: {
        razorpayRefundId: refund.id,
        status: isProcessed ? 'DUPLICATE_REFUNDED' : 'DUPLICATE_REFUND_PENDING',
        lastError: null,
        ...(isProcessed ? { refundedAt: now } : {}),
      },
    });

    return {
      confirmed: isProcessed,
      status: isProcessed ? 'DUPLICATE_REFUNDED' : 'DUPLICATE_REFUND_PENDING',
      razorpayRefundId: refund.id,
    };
  } catch (err) {
    await prisma.paymentTransaction.updateMany({
      where: {
        razorpayPaymentId,
        status: 'DUPLICATE_REFUND_PENDING',
      },
      data: { status: 'DUPLICATE_REFUND_FAILED', lastError: err.message },
    });
    return { confirmed: false, status: 'DUPLICATE_REFUND_FAILED', error: err.message };
  }
};

module.exports = {
  findExistingActiveRefund,
  resolveOrCreateRefund,
  executeRazorpayRefund,
  executeDuplicateCaptureRefund,
};
