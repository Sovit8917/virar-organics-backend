const prisma = require('../config/prisma');
const { createRazorpayRefund } = require('../utils/razorpay');

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
    const refund = await createRazorpayRefund({
      razorpayPaymentId,
      amountInPaise,
      notes: { orderId, orderNumber, ...(reason ? { reason } : {}) },
    });

    const isProcessed = refund?.status === 'processed';
    await prisma.order.updateMany({
      where: { id: orderId, paymentStatus: 'REFUND_PENDING' },
      data: {
        razorpayRefundId: refund.id,
        ...(isProcessed ? { paymentStatus: 'REFUNDED', refundedAt: new Date() } : {}),
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
    return { confirmed: false, status: 'REFUND_FAILED', error: err.message };
  }
};

module.exports = { executeRazorpayRefund };
