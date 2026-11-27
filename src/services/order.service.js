const crypto = require('crypto');
const prisma = require('../config/prisma');
const ApiError = require('../utils/ApiError');
const { buildMeta } = require('../utils/pagination');

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

const checkout = async (userId, { addressId, paymentMethod, notes }) => {
  const order = await prisma.$transaction(async (tx) => {
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
          orderBy: { createdAt: 'asc' },
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

    for (const item of cart.items) {
      const { product } = item;
      if (!product.isActive || !product.category.isActive) {
        throw ApiError.conflict(`Product "${product.name}" is no longer available`);
      }
      if (product.stock < item.quantity) {
        throw ApiError.conflict(
          `Insufficient stock for "${product.name}": requested ${item.quantity}, available ${product.stock}`,
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

    // NOTE (Phase 4): Concurrency-safe atomic stock deduction, Razorpay order creation,
    // and webhook payment reconciliation will be layered into this checkout flow.
    const createdOrder = await tx.order.create({
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

    return createdOrder;
  });

  return formatOrder(order);
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

  const data = { status: nextStatus };
  if (nextStatus === 'PAID' && existing.paymentStatus === 'PENDING') {
    data.paymentStatus = 'PAID';
  }

  // NOTE (Phase 4): Cancelling an order will restore deducted product stock atomically.
  const updated = await prisma.order.update({ where: { id }, data, select: adminOrderSelect });
  return formatOrder(updated);
};

module.exports = {
  ALLOWED_TRANSITIONS,
  checkout,
  listOwn,
  getOwn,
  listAdmin,
  getAdmin,
  updateStatus,
};
