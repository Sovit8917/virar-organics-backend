const { Prisma } = require('@prisma/client');
const prisma = require('../config/prisma');
const ApiError = require('../utils/ApiError');
const { verifyPaymentSignature, verifyWebhookSignature } = require('../utils/razorpay');
const { formatOrder, orderSelect } = require('./order.service');
const { executeRazorpayRefund, executeDuplicateCaptureRefund } = require('./refund.service');

// Reconciles a captured Razorpay payment atomically:
// 1) If order is PENDING and unpaid, marks it PAID and records primary capture.
// 2) If order was ALREADY CANCELLED before payment arrived (race condition),
//    records razorpayPaymentId/paidAt and claims REFUND_PENDING so a refund is initiated once.
// 3) If order already has a DIFFERENT razorpayPaymentId, records the extra capture and
//    claims DUPLICATE_REFUND_PENDING so the additional capture is safely refunded.
const reconcileCapturedPayment = async (
  db,
  { orderId, razorpayOrderId = null, razorpayPaymentId, amountInPaise = null },
) => {
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
    if (razorpayPaymentId) {
      await db.paymentTransaction.upsert({
        where: { razorpayPaymentId },
        update: {},
        create: {
          orderId,
          razorpayOrderId,
          razorpayPaymentId,
          amountInPaise,
          status: 'CAPTURED',
        },
      });
    }
    const order = await db.order.findUnique({ where: { id: orderId }, select: orderSelect });
    return {
      transitionedToPaid: true,
      needsPostCancelRefund: false,
      needsDuplicateRefund: false,
      order,
    };
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

  if (lateClaim.count === 1) {
    if (razorpayPaymentId) {
      await db.paymentTransaction.upsert({
        where: { razorpayPaymentId },
        update: { status: 'REFUND_PENDING' },
        create: {
          orderId,
          razorpayOrderId,
          razorpayPaymentId,
          amountInPaise,
          status: 'REFUND_PENDING',
        },
      });
    }
    const order = await db.order.findUnique({ where: { id: orderId }, select: orderSelect });
    return {
      transitionedToPaid: false,
      needsPostCancelRefund: true,
      needsDuplicateRefund: false,
      order,
    };
  }

  const order = await db.order.findUnique({ where: { id: orderId }, select: orderSelect });
  let needsDuplicateRefund = false;

  if (order && razorpayPaymentId && order.razorpayPaymentId && order.razorpayPaymentId !== razorpayPaymentId) {
    const existingCapture = await db.paymentTransaction.findUnique({
      where: { razorpayPaymentId },
      select: { id: true, status: true },
    });

    if (!existingCapture) {
      await db.paymentTransaction.create({
        data: {
          orderId: order.id,
          razorpayOrderId: razorpayOrderId || order.razorpayOrderId,
          razorpayPaymentId,
          amountInPaise,
          status: 'DUPLICATE_REFUND_PENDING',
        },
      });
      needsDuplicateRefund = true;
    } else if (existingCapture.status === 'DUPLICATE_REFUND_FAILED') {
      const retried = await db.paymentTransaction.updateMany({
        where: { razorpayPaymentId, status: 'DUPLICATE_REFUND_FAILED' },
        data: { status: 'DUPLICATE_REFUND_PENDING' },
      });
      needsDuplicateRefund = retried.count === 1;
    }
  }

  return {
    transitionedToPaid: false,
    needsPostCancelRefund: false,
    needsDuplicateRefund,
    order,
  };
};

const verifyRazorpayPayment = async (
  userId,
  { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature },
) => {
  const order = await prisma.order.findFirst({
    where: { id: orderId, userId },
    select: { id: true, paymentMethod: true, razorpayOrderId: true, totalAmount: true },
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

  const amountInPaise = Math.round(Number(order.totalAmount) * 100);
  const result = await prisma.$transaction((tx) =>
    reconcileCapturedPayment(tx, {
      orderId: order.id,
      razorpayOrderId,
      razorpayPaymentId,
      amountInPaise,
    }),
  );

  if (result.needsPostCancelRefund) {
    await executeRazorpayRefund({
      orderId: result.order.id,
      orderNumber: result.order.orderNumber,
      razorpayPaymentId,
      amountInPaise,
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

  if (result.needsDuplicateRefund) {
    await executeDuplicateCaptureRefund({
      orderId: result.order.id,
      orderNumber: result.order.orderNumber,
      razorpayPaymentId,
      amountInPaise,
    });
    const refreshed = await prisma.order.findUnique({ where: { id: order.id }, select: orderSelect });
    return {
      verified: true,
      alreadyProcessed: true,
      duplicateCaptureRefundInitiated: true,
      order: formatOrder(refreshed),
    };
  }

  return {
    verified: true,
    alreadyProcessed: !result.transitionedToPaid,
    order: formatOrder(result.order),
  };
};

// Processes a parsed webhook payload with safe event tracking:
// - Events already marked PROCESSED are idempotent no-ops (duplicate: true).
// - Events whose order cannot yet be reconciled are saved as UNRECONCILED (never permanently consumed)
//   so subsequent webhook retries or recoverUnreconciledWebhooks() can replay them safely.
const processWebhookEvent = async ({ eventId, eventType, payload, razorpayOrderId, razorpayPaymentId, razorpayRefundId, amountInPaise }) => {
  let txResult;
  try {
    txResult = await prisma.$transaction(async (tx) => {
      const existingEvent = await tx.paymentEvent.findUnique({
        where: { eventId },
        select: { id: true, status: true },
      });

      if (existingEvent?.status === 'PROCESSED') {
        return { received: true, duplicate: true };
      }

      if (existingEvent) {
        await tx.paymentEvent.update({
          where: { id: existingEvent.id },
          data: { attempts: { increment: 1 }, lastError: null },
        });
      } else {
        await tx.paymentEvent.create({
          data: {
            provider: 'RAZORPAY',
            eventId,
            eventType,
            status: 'PROCESSED',
            razorpayOrderId,
            razorpayPaymentId,
            payload,
          },
        });
      }

      const markEventStatus = async (status, lastError = null) => {
        await tx.paymentEvent.update({
          where: { eventId },
          data: {
            status,
            lastError,
            ...(status === 'PROCESSED' ? { reconciledAt: new Date() } : {}),
          },
        });
      };

      if (eventType === 'refund.processed' || eventType === 'refund.failed') {
        const order = await tx.order.findFirst({
          where: {
            OR: [
              ...(razorpayRefundId ? [{ razorpayRefundId }] : []),
              ...(razorpayPaymentId ? [{ razorpayPaymentId }] : []),
            ],
          },
          select: { id: true },
        });

        const capture = razorpayPaymentId
          ? await tx.paymentTransaction.findUnique({
              where: { razorpayPaymentId },
              select: { id: true, status: true },
            })
          : null;

        if (!order && !capture) {
          await markEventStatus('UNRECONCILED', 'Order/capture not found for refund webhook');
          return { received: true, processed: false, unreconciled: true, reason: 'Order not found for refund webhook' };
        }

        const now = new Date();
        if (eventType === 'refund.processed') {
          if (capture && (capture.status === 'DUPLICATE_REFUND_PENDING' || capture.status === 'DUPLICATE_REFUND_FAILED')) {
            await tx.paymentTransaction.update({
              where: { id: capture.id },
              data: {
                status: 'DUPLICATE_REFUNDED',
                ...(razorpayRefundId ? { razorpayRefundId } : {}),
                refundedAt: now,
                lastError: null,
              },
            });
            await markEventStatus('PROCESSED');
            return { received: true, processed: true, duplicateCaptureRefunded: true };
          }

          if (order) {
            const updated = await tx.order.updateMany({
              where: {
                id: order.id,
                paymentStatus: { in: ['REFUND_PENDING', 'REFUND_FAILED', 'PAID'] },
              },
              data: {
                paymentStatus: 'REFUNDED',
                ...(razorpayRefundId ? { razorpayRefundId } : {}),
                refundedAt: now,
              },
            });
            if (capture) {
              await tx.paymentTransaction.update({
                where: { id: capture.id },
                data: {
                  status: 'REFUNDED',
                  ...(razorpayRefundId ? { razorpayRefundId } : {}),
                  refundedAt: now,
                  lastError: null,
                },
              });
            }
            await markEventStatus('PROCESSED');
            return { received: true, processed: true, refunded: updated.count === 1 };
          }
        }

        if (capture && capture.status === 'DUPLICATE_REFUND_PENDING') {
          await tx.paymentTransaction.update({
            where: { id: capture.id },
            data: {
              status: 'DUPLICATE_REFUND_FAILED',
              ...(razorpayRefundId ? { razorpayRefundId } : {}),
            },
          });
          await markEventStatus('PROCESSED');
          return { received: true, processed: true, duplicateRefundFailed: true };
        }

        const failed = order
          ? await tx.order.updateMany({
              where: { id: order.id, paymentStatus: 'REFUND_PENDING' },
              data: {
                paymentStatus: 'REFUND_FAILED',
                ...(razorpayRefundId ? { razorpayRefundId } : {}),
              },
            })
          : { count: 0 };
        if (capture) {
          await tx.paymentTransaction.update({
            where: { id: capture.id },
            data: {
              status: 'REFUND_FAILED',
              ...(razorpayRefundId ? { razorpayRefundId } : {}),
            },
          });
        }
        await markEventStatus('PROCESSED');
        return { received: true, processed: true, refundFailed: failed.count === 1 };
      }

      if (!razorpayOrderId) {
        await markEventStatus('UNRECONCILED', 'No razorpayOrderId in payload');
        return { received: true, processed: false, unreconciled: true, reason: 'No razorpayOrderId in payload' };
      }

      const order = await tx.order.findUnique({
        where: { razorpayOrderId },
        select: { id: true, status: true, paymentStatus: true },
      });

      if (!order) {
        await markEventStatus('UNRECONCILED', 'Order not found for razorpayOrderId');
        return { received: true, processed: false, unreconciled: true, reason: 'Order not found for razorpayOrderId' };
      }

      if (eventType === 'payment.captured' || eventType === 'order.paid') {
        const reconciled = await reconcileCapturedPayment(tx, {
          orderId: order.id,
          razorpayOrderId,
          razorpayPaymentId,
          amountInPaise,
        });
        await markEventStatus('PROCESSED');
        return {
          received: true,
          processed: true,
          orderTransitioned: reconciled.transitionedToPaid,
          needsPostCancelRefund: reconciled.needsPostCancelRefund,
          needsDuplicateRefund: reconciled.needsDuplicateRefund,
          order: reconciled.order,
        };
      }

      if (eventType === 'payment.failed') {
        const failed = await tx.order.updateMany({
          where: { id: order.id, status: 'PENDING', paymentStatus: 'PENDING' },
          data: { paymentStatus: 'FAILED' },
        });
        await markEventStatus('PROCESSED');
        return { received: true, processed: true, markedFailed: failed.count === 1 };
      }

      await markEventStatus('PROCESSED');
      return { received: true, processed: false, reason: `Ignored event ${eventType}` };
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return { received: true, duplicate: true };
    }
    throw err;
  }

  if (txResult?.needsPostCancelRefund && txResult.order) {
    const refundOutcome = await executeRazorpayRefund({
      orderId: txResult.order.id,
      orderNumber: txResult.order.orderNumber,
      razorpayPaymentId,
      amountInPaise: amountInPaise || Math.round(Number(txResult.order.totalAmount) * 100),
      reason: 'payment_captured_after_cancellation',
    });
    return {
      received: true,
      processed: true,
      orderTransitioned: false,
      postCancelRefund: refundOutcome.status,
    };
  }

  if (txResult?.needsDuplicateRefund && txResult.order) {
    const refundOutcome = await executeDuplicateCaptureRefund({
      orderId: txResult.order.id,
      orderNumber: txResult.order.orderNumber,
      razorpayPaymentId,
      amountInPaise: amountInPaise || Math.round(Number(txResult.order.totalAmount) * 100),
    });
    return {
      received: true,
      processed: true,
      orderTransitioned: false,
      duplicateCaptureRefund: refundOutcome.status,
    };
  }

  if (txResult?.order) {
    const {
      order: _omitted,
      needsPostCancelRefund: _f1,
      needsDuplicateRefund: _f2,
      ...summary
    } = txResult;
    return summary;
  }

  return txResult;
};

const extractWebhookFields = (payload, headers = {}) => {
  const eventType = payload?.event || 'unknown';
  const paymentEntity = payload?.payload?.payment?.entity;
  const orderEntity = payload?.payload?.order?.entity;
  const refundEntity = payload?.payload?.refund?.entity;

  const razorpayPaymentId = paymentEntity?.id || refundEntity?.payment_id || null;
  const razorpayOrderId = paymentEntity?.order_id || orderEntity?.id || null;
  const razorpayRefundId = refundEntity?.id || null;
  const amountInPaise = paymentEntity?.amount ?? orderEntity?.amount ?? null;
  const eventId =
    headers['x-razorpay-event-id'] ||
    `${eventType}:${razorpayRefundId || razorpayPaymentId || 'none'}:${razorpayOrderId || 'none'}`;

  return {
    eventId,
    eventType,
    payload,
    razorpayOrderId,
    razorpayPaymentId,
    razorpayRefundId,
    amountInPaise,
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

  return processWebhookEvent(extractWebhookFields(payload, headers));
};

// Replays UNRECONCILED / FAILED webhook events safely without duplicating already-processed events.
const recoverUnreconciledWebhooks = async ({ limit = 50 } = {}) => {
  const pendingEvents = await prisma.paymentEvent.findMany({
    where: { status: { in: ['UNRECONCILED', 'FAILED'] } },
    orderBy: { processedAt: 'asc' },
    take: limit,
    select: { eventId: true, payload: true },
  });

  let recovered = 0;
  let stillUnreconciled = 0;
  let failed = 0;

  for (const evt of pendingEvents) {
    try {
      const fields = extractWebhookFields(evt.payload, {});
      fields.eventId = evt.eventId;
      const res = await processWebhookEvent(fields);
      if (res?.unreconciled) stillUnreconciled += 1;
      else recovered += 1;
    } catch (err) {
      failed += 1;
      await prisma.paymentEvent.updateMany({
        where: { eventId: evt.eventId },
        data: { status: 'FAILED', lastError: err.message },
      });
    }
  }

  return { scanned: pendingEvents.length, recovered, stillUnreconciled, failed };
};

module.exports = {
  reconcileCapturedPayment,
  verifyRazorpayPayment,
  processWebhookEvent,
  handleRazorpayWebhook,
  recoverUnreconciledWebhooks,
};
