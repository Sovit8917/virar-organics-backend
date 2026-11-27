const { Prisma } = require('@prisma/client');
const prisma = require('../config/prisma');
const ApiError = require('../utils/ApiError');
const { verifyPaymentSignature, verifyWebhookSignature } = require('../utils/razorpay');
const { formatOrder, orderSelect } = require('./order.service');
const { executeRazorpayRefund } = require('./refund.service');

// Reconciles a captured Razorpay payment atomically:
// 1) If order is PENDING and unpaid, marks it PAID.
// 2) If order was ALREADY CANCELLED before payment arrived (race condition),
//    records razorpayPaymentId/paidAt and claims REFUND_PENDING so a refund is initiated once.
const reconcileCapturedPayment = async (db, { orderId, razorpayPaymentId }) => {
  const paidClaim = await db.order.updateMany({
    where: {
      id: orderId,
      status: 'PENDING',
      paymentStatus: { in: ['PENDING', 'FAILED'] },
    },
    data: {
      status: 'PAID',
      paymentStatus: 'PAID',
      razorpayPaymentId,
      paidAt: new Date(),
    },
  });

  if (paidClaim.count === 1) {
    const order = await db.order.findUnique({ where: { id: orderId }, select: orderSelect });
    return { transitionedToPaid: true, needsPostCancelRefund: false, order };
  }

  const lateClaim = await db.order.updateMany({
    where: {
      id: orderId,
      status: 'CANCELLED',
      paymentStatus: { in: ['PENDING', 'FAILED'] },
      razorpayRefundId: null,
    },
    data: {
      paymentStatus: 'REFUND_PENDING',
      razorpayPaymentId,
      paidAt: new Date(),
    },
  });

  const order = await db.order.findUnique({ where: { id: orderId }, select: orderSelect });
  return {
    transitionedToPaid: false,
    needsPostCancelRefund: lateClaim.count === 1,
    order,
  };
};

const verifyRazorpayPayment = async (
  userId,
  { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature },
) => {
  const order = await prisma.order.findFirst({
    where: { id: orderId, userId },
    select: { id: true, paymentMethod: true, razorpayOrderId: true, status: true, paymentStatus: true },
  });
  if (!order) throw ApiError.notFound('Order not found');
  if (order.paymentMethod !== 'RAZORPAY') {
    throw ApiError.badRequest('Payment verification is only valid for Razorpay orders');
  }
  if (!order.razorpayOrderId || order.razorpayOrderId !== razorpayOrderId) {
    throw ApiError.badRequest('Razorpay order ID does not match this order');
  }

  const isValid = verifyPaymentSignature({
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
  });
  if (!isValid) throw ApiError.badRequest('Invalid Razorpay payment signature');

  const result = await reconcileCapturedPayment(prisma, {
    orderId: order.id,
    razorpayPaymentId,
  });

  if (result.needsPostCancelRefund) {
    await executeRazorpayRefund({
      orderId: result.order.id,
      orderNumber: result.order.orderNumber,
      razorpayPaymentId,
      amountInPaise: Math.round(Number(result.order.totalAmount) * 100),
      reason: 'payment_captured_after_cancellation',
    });
    const refreshed = await prisma.order.findUnique({ where: { id: order.id }, select: orderSelect });
    return {
      verified: true,
      alreadyProcessed: false,
      refundInitiated: true,
      order: formatOrder(refreshed),
    };
  }

  return {
    verified: true,
    alreadyProcessed: !result.transitionedToPaid,
    order: formatOrder(result.order),
  };
};

const handleRazorpayWebhook = async (rawBody, headers) => {
  const signature = headers['x-razorpay-signature'];
  if (!verifyWebhookSignature(rawBody, signature)) {
    throw ApiError.unauthorized('Invalid Razorpay webhook signature');
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    throw ApiError.badRequest('Malformed webhook JSON payload');
  }

  const eventType = payload?.event || 'unknown';
  const paymentEntity = payload?.payload?.payment?.entity;
  const orderEntity = payload?.payload?.order?.entity;
  const refundEntity = payload?.payload?.refund?.entity;

  const razorpayPaymentId = paymentEntity?.id || refundEntity?.payment_id || null;
  const razorpayOrderId = paymentEntity?.order_id || orderEntity?.id || null;
  const razorpayRefundId = refundEntity?.id || null;
  const eventId =
    headers['x-razorpay-event-id'] ||
    `${eventType}:${razorpayRefundId || razorpayPaymentId || 'none'}:${razorpayOrderId || 'none'}`;

  let txResult;
  try {
    txResult = await prisma.$transaction(async (tx) => {
      // Unique constraint on eventId ensures each webhook delivery is processed at most once.
      await tx.paymentEvent.create({
        data: {
          provider: 'RAZORPAY',
          eventId,
          eventType,
          razorpayOrderId,
          razorpayPaymentId,
          payload,
        },
      });

      if (eventType === 'refund.processed' || eventType === 'refund.failed') {
        const order = await tx.order.findFirst({
          where: {
            OR: [
              ...(razorpayRefundId ? [{ razorpayRefundId }] : []),
              ...(razorpayPaymentId ? [{ razorpayPaymentId }] : []),
            ],
          },
          select: { id: true, paymentStatus: true },
        });

        if (!order) {
          return { received: true, processed: false, reason: 'Order not found for refund webhook' };
        }

        if (eventType === 'refund.processed') {
          const updated = await tx.order.updateMany({
            where: {
              id: order.id,
              paymentStatus: { in: ['REFUND_PENDING', 'REFUND_FAILED', 'PAID'] },
            },
            data: {
              paymentStatus: 'REFUNDED',
              ...(razorpayRefundId ? { razorpayRefundId } : {}),
              refundedAt: new Date(),
            },
          });
          return { received: true, processed: true, refunded: updated.count === 1 };
        }

        const failed = await tx.order.updateMany({
          where: { id: order.id, paymentStatus: 'REFUND_PENDING' },
          data: {
            paymentStatus: 'REFUND_FAILED',
            ...(razorpayRefundId ? { razorpayRefundId } : {}),
          },
        });
        return { received: true, processed: true, refundFailed: failed.count === 1 };
      }

      if (!razorpayOrderId) {
        return { received: true, processed: false, reason: 'No razorpayOrderId in payload' };
      }

      const order = await tx.order.findUnique({
        where: { razorpayOrderId },
        select: { id: true, status: true, paymentStatus: true },
      });

      if (!order) {
        return { received: true, processed: false, reason: 'Order not found for razorpayOrderId' };
      }

      if (eventType === 'payment.captured' || eventType === 'order.paid') {
        const reconciled = await reconcileCapturedPayment(tx, {
          orderId: order.id,
          razorpayPaymentId,
        });
        return {
          received: true,
          processed: true,
          orderTransitioned: reconciled.transitionedToPaid,
          needsPostCancelRefund: reconciled.needsPostCancelRefund,
          order: reconciled.order,
        };
      }

      if (eventType === 'payment.failed') {
        const failed = await tx.order.updateMany({
          where: { id: order.id, status: 'PENDING', paymentStatus: 'PENDING' },
          data: { paymentStatus: 'FAILED' },
        });
        return { received: true, processed: true, markedFailed: failed.count === 1 };
      }

      return { received: true, processed: false, reason: `Ignored event ${eventType}` };
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return { received: true, duplicate: true };
    }
    throw err;
  }

  // If payment arrived after order was already cancelled, initiate Razorpay refund outside the DB tx.
  if (txResult?.needsPostCancelRefund && txResult.order) {
    const refundOutcome = await executeRazorpayRefund({
      orderId: txResult.order.id,
      orderNumber: txResult.order.orderNumber,
      razorpayPaymentId,
      amountInPaise: Math.round(Number(txResult.order.totalAmount) * 100),
      reason: 'payment_captured_after_cancellation',
    });
    return {
      received: true,
      processed: true,
      orderTransitioned: false,
      postCancelRefund: refundOutcome.status,
    };
  }

  if (txResult?.order) {
    const { order: _omitted, needsPostCancelRefund: _flag, ...summary } = txResult;
    return summary;
  }

  return txResult;
};

module.exports = {
  reconcileCapturedPayment,
  verifyRazorpayPayment,
  handleRazorpayWebhook,
};
