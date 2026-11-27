const { Prisma } = require('@prisma/client');
const prisma = require('../config/prisma');
const ApiError = require('../utils/ApiError');
const { verifyPaymentSignature, verifyWebhookSignature } = require('../utils/razorpay');
const { formatOrder, orderSelect } = require('./order.service');

// Atomic idempotent transition: only marks an order PAID if it is currently PENDING and not yet PAID.
const markOrderPaidIfPending = async (db, { orderId, razorpayPaymentId }) => {
  const result = await db.order.updateMany({
    where: {
      id: orderId,
      status: 'PENDING',
      paymentStatus: { not: 'PAID' },
    },
    data: {
      status: 'PAID',
      paymentStatus: 'PAID',
      razorpayPaymentId,
      paidAt: new Date(),
    },
  });

  const order = await db.order.findUnique({ where: { id: orderId }, select: orderSelect });
  return { transitioned: result.count === 1, order: formatOrder(order) };
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

  const { transitioned, order: updated } = await markOrderPaidIfPending(prisma, {
    orderId: order.id,
    razorpayPaymentId,
  });

  return { verified: true, alreadyProcessed: !transitioned, order: updated };
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

  const razorpayPaymentId = paymentEntity?.id || null;
  const razorpayOrderId = paymentEntity?.order_id || orderEntity?.id || null;
  const eventId =
    headers['x-razorpay-event-id'] ||
    `${eventType}:${razorpayPaymentId || 'none'}:${razorpayOrderId || 'none'}`;

  try {
    return await prisma.$transaction(async (tx) => {
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
        const { transitioned } = await markOrderPaidIfPending(tx, {
          orderId: order.id,
          razorpayPaymentId,
        });
        return { received: true, processed: true, orderTransitioned: transitioned };
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
};

module.exports = { markOrderPaidIfPending, verifyRazorpayPayment, handleRazorpayWebhook };
