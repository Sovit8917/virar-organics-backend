const crypto = require('crypto');
const prisma = require('../config/prisma');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const { buildMeta } = require('../utils/pagination');
const { createRazorpayOrder } = require('../utils/razorpay');
const { executeRazorpayRefund } = require('./refund.service');

const ALLOWED_TRANSITIONS = {
  PENDING: ['PAID', 'SHIPPED', 'CANCELLED'],
  PAID: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED', 'CANCELLED'],
  DELIVERED: [],
  CANCELLED: [],
};

const orderSelect = {
  id: true,
  orderNumber: true,
  userId: true,
  status: true,
  paymentMethod: true,
  paymentStatus: true,
  subtotal: true,
  totalAmount: true,
  shippingAddress: true,
  notes: true,
  razorpayOrderId: true,
  razorpayPaymentId: true,
  razorpayRefundId: true,
  paidAt: true,
  cancelledAt: true,
  refundedAt: true,
  stockRestored: true,
  createdAt: true,
  updatedAt: true,
  items: {
    select: {
      id: true,
      productId: true,
      productName: true,
      sku: true,
      unit: true,
      unitPrice: true,
      quantity: true,
      lineTotal: true,
    },
  },
};

const adminOrderSelect = {
  ...orderSelect,
  user: { select: { id: true, name: true, email: true, phone: true } },
};

const generateOrderNumber = () => {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `VO-${date}-${suffix}`;
};

const formatOrder = (order) => ({
  ...order,
  subtotal: Number(order.subtotal),
  totalAmount: Number(order.totalAmount),
  items: (order.items || []).map((item) => ({
    ...item,
    unitPrice: Number(item.unitPrice),
    lineTotal: Number(item.lineTotal),
  })),
});

// Atomically transitions an order to CANCELLED and restores product stock at most once.
// For PAID Razorpay orders, marks REFUND_PENDING (never REFUNDED until Razorpay confirms).
const cancelAndRestoreStock = async (tx, order, { select = orderSelect } = {}) => {
  const shouldRefund =
    order.paymentMethod === 'RAZORPAY' &&
    order.paymentStatus === 'PAID' &&
    !order.razorpayRefundId;

  const claimed = await tx.order.updateMany({
    where: {
      id: order.id,
      status: { not: 'CANCELLED' },
      stockRestored: false,
    },
    data: {
      status: 'CANCELLED',
      stockRestored: true,
      cancelledAt: new Date(),
      ...(shouldRefund ? { paymentStatus: 'REFUND_PENDING' } : {}),
    },
  });

  if (claimed.count === 0) {
    throw ApiError.conflict('Order is already cancelled or stock has already been restored');
  }

  const sortedItems = [...order.items].sort((a, b) => a.productId.localeCompare(b.productId));
  for (const item of sortedItems) {
    await tx.product.update({
      where: { id: item.productId },
      data: { stock: { increment: item.quantity } },
    });
  }

  const updated = await tx.order.findUnique({ where: { id: order.id }, select });
  return { order: updated, needsRefund: shouldRefund };
};

const checkout = async (userId, { addressId, paymentMethod, notes }) => {
  const createdOrder = await prisma.$transaction(async (tx) => {
    const address = await tx.address.findFirst({
      where: { id: addressId, userId },
      select: {
        label: true,
        fullName: true,
        phone: true,
        addressLine1: true,
        addressLine2: true,
        city: true,
        state: true,
        postalCode: true,
        country: true,
      },
    });
    if (!address) throw ApiError.notFound('Delivery address not found');

    const cart = await tx.cart.findUnique({
      where: { userId },
      include: {
        items: {
          orderBy: { productId: 'asc' },
          include: {
            product: {
              select: {
                id: true,
                name: true,
                sku: true,
                unit: true,
                price: true,
                stock: true,
                isActive: true,
                category: { select: { isActive: true } },
              },
            },
          },
        },
      },
    });

    if (!cart || cart.items.length === 0) {
      throw ApiError.badRequest('Your cart is empty');
    }

    const orderItemsData = [];
    let subtotal = 0;

    // Lock products in deterministic productId order and decrement stock atomically.
    for (const item of cart.items) {
      const { product } = item;
      const decremented = await tx.product.updateMany({
        where: {
          id: product.id,
          isActive: true,
          category: { isActive: true },
          stock: { gte: item.quantity },
        },
        data: { stock: { decrement: item.quantity } },
      });

      if (decremented.count === 0) {
        const latest = await tx.product.findUnique({
          where: { id: product.id },
          select: { name: true, stock: true, isActive: true, category: { select: { isActive: true } } },
        });
        if (!latest || !latest.isActive || !latest.category.isActive) {
          throw ApiError.conflict(`Product "${product.name}" is no longer available`);
        }
        throw ApiError.conflict(
          `Insufficient stock for "${latest.name}": requested ${item.quantity}, available ${latest.stock}`,
        );
      }

      const unitPrice = Number(product.price);
      const lineTotal = Number((unitPrice * item.quantity).toFixed(2));
      subtotal = Number((subtotal + lineTotal).toFixed(2));

      orderItemsData.push({
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        unit: product.unit,
        unitPrice,
        quantity: item.quantity,
        lineTotal,
      });
    }

    const order = await tx.order.create({
      data: {
        orderNumber: generateOrderNumber(),
        userId,
        status: 'PENDING',
        paymentMethod,
        paymentStatus: 'PENDING',
        subtotal,
        totalAmount: subtotal,
        shippingAddress: address,
        notes,
        items: { create: orderItemsData },
      },
      select: orderSelect,
    });

    await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
    return order;
  });

  if (paymentMethod === 'COD') {
    return { order: formatOrder(createdOrder) };
  }

  // Create Razorpay order; if gateway call fails, cancel and restore stock so inventory is never leaked.
  let razorpayOrder;
  try {
    razorpayOrder = await createRazorpayOrder({
      amountInPaise: Math.round(Number(createdOrder.totalAmount) * 100),
      receipt: createdOrder.orderNumber,
      notes: { orderId: createdOrder.id, userId },
    });
  } catch (err) {
    await prisma.$transaction((tx) => cancelAndRestoreStock(tx, createdOrder));
    throw err;
  }

  const updatedOrder = await prisma.order.update({
    where: { id: createdOrder.id },
    data: { razorpayOrderId: razorpayOrder.id },
    select: orderSelect,
  });

  return {
    order: formatOrder(updatedOrder),
    razorpay: {
      orderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      keyId: env.RAZORPAY_KEY_ID,
    },
  };
};

const listOwn = async (userId, { page, limit, status, sortOrder }) => {
  const where = { userId };
  if (status) where.status = status;

  const [rows, total] = await prisma.$transaction([
    prisma.order.findMany({
      where,
      select: orderSelect,
      orderBy: { createdAt: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.order.count({ where }),
  ]);

  return { items: rows.map(formatOrder), meta: buildMeta(page, limit, total) };
};

const getOwn = async (userId, id) => {
  const order = await prisma.order.findFirst({ where: { id, userId }, select: orderSelect });
  if (!order) throw ApiError.notFound('Order not found');
  return formatOrder(order);
};

const cancelOwn = async (userId, id) => {
  const order = await prisma.order.findFirst({ where: { id, userId }, select: orderSelect });
  if (!order) throw ApiError.notFound('Order not found');
  if (order.status !== 'PENDING') {
    throw ApiError.conflict(`Only PENDING orders can be cancelled by customer (current: ${order.status})`);
  }

  const { order: cancelled } = await prisma.$transaction((tx) => cancelAndRestoreStock(tx, order));
  return formatOrder(cancelled);
};

const listAdmin = async ({ page, limit, status, paymentMethod, paymentStatus, userId, search, sortBy, sortOrder }) => {
  const where = {};
  if (status) where.status = status;
  if (paymentMethod) where.paymentMethod = paymentMethod;
  if (paymentStatus) where.paymentStatus = paymentStatus;
  if (userId) where.userId = userId;
  if (search) {
    where.OR = [
      { orderNumber: { contains: search, mode: 'insensitive' } },
      { user: { name: { contains: search, mode: 'insensitive' } } },
      { user: { email: { contains: search, mode: 'insensitive' } } },
    ];
  }

  const [rows, total] = await prisma.$transaction([
    prisma.order.findMany({
      where,
      select: adminOrderSelect,
      orderBy: [{ [sortBy]: sortOrder }, { id: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.order.count({ where }),
  ]);

  return { items: rows.map(formatOrder), meta: buildMeta(page, limit, total) };
};

const getAdmin = async (id) => {
  const order = await prisma.order.findUnique({ where: { id }, select: adminOrderSelect });
  if (!order) throw ApiError.notFound('Order not found');
  return formatOrder(order);
};

const updateStatus = async (id, nextStatus) => {
  const existing = await prisma.order.findUnique({ where: { id }, select: adminOrderSelect });
  if (!existing) throw ApiError.notFound('Order not found');

  const allowed = ALLOWED_TRANSITIONS[existing.status] || [];
  if (!allowed.includes(nextStatus)) {
    throw ApiError.conflict(`Cannot transition order from ${existing.status} to ${nextStatus}`);
  }

  if (nextStatus === 'CANCELLED') {
    const { order: cancelled, needsRefund } = await prisma.$transaction((tx) =>
      cancelAndRestoreStock(tx, existing, { select: adminOrderSelect }),
    );

    if (needsRefund) {
      await executeRazorpayRefund({
        orderId: cancelled.id,
        orderNumber: cancelled.orderNumber,
        razorpayPaymentId: cancelled.razorpayPaymentId,
        amountInPaise: Math.round(Number(cancelled.totalAmount) * 100),
        reason: 'admin_order_cancelled',
      });
      const refreshed = await prisma.order.findUnique({
        where: { id: cancelled.id },
        select: adminOrderSelect,
      });
      return formatOrder(refreshed);
    }

    return formatOrder(cancelled);
  }

  const data = { status: nextStatus };
  if (nextStatus === 'PAID' && existing.paymentStatus === 'PENDING') {
    data.paymentStatus = 'PAID';
    data.paidAt = new Date();
  }

  const updated = await prisma.order.update({ where: { id }, data, select: adminOrderSelect });
  return formatOrder(updated);
};

// Retries a failed refund for an already-cancelled Razorpay order without risking duplicate refunds.
const retryRefund = async (id) => {
  const claimed = await prisma.order.updateMany({
    where: {
      id,
      status: 'CANCELLED',
      paymentMethod: 'RAZORPAY',
      paymentStatus: 'REFUND_FAILED',
      razorpayRefundId: null,
    },
    data: { paymentStatus: 'REFUND_PENDING' },
  });

  if (claimed.count === 0) {
    const existing = await prisma.order.findUnique({ where: { id }, select: { id: true, paymentStatus: true, razorpayRefundId: true } });
    if (!existing) throw ApiError.notFound('Order not found');
    throw ApiError.conflict(`Order is not eligible for refund retry (paymentStatus: ${existing.paymentStatus})`);
  }

  const order = await prisma.order.findUnique({ where: { id }, select: adminOrderSelect });
  await executeRazorpayRefund({
    orderId: order.id,
    orderNumber: order.orderNumber,
    razorpayPaymentId: order.razorpayPaymentId,
    amountInPaise: Math.round(Number(order.totalAmount) * 100),
    reason: 'admin_refund_retry',
  });

  const refreshed = await prisma.order.findUnique({ where: { id }, select: adminOrderSelect });
  return formatOrder(refreshed);
};

module.exports = {
  ALLOWED_TRANSITIONS,
  orderSelect,
  formatOrder,
  cancelAndRestoreStock,
  checkout,
  listOwn,
  getOwn,
  cancelOwn,
  listAdmin,
  getAdmin,
  updateStatus,
  retryRefund,
};
