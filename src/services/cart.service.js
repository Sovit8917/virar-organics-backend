const prisma = require('../config/prisma');
const ApiError = require('../utils/ApiError');
const { getStockStatus } = require('./product.service');

const cartInclude = {
  items: {
    orderBy: { createdAt: 'asc' },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          slug: true,
          sku: true,
          unit: true,
          price: true,
          stock: true,
          lowStockThreshold: true,
          imageUrl: true,
          isActive: true,
          category: { select: { id: true, name: true, slug: true, isActive: true } },
        },
      },
    },
  },
};

const formatCart = (cart) => {
  const items = (cart?.items || []).map((item) => {
    const unitPrice = Number(item.product.price);
    const lineTotal = Number((unitPrice * item.quantity).toFixed(2));
    return {
      id: item.id,
      productId: item.productId,
      quantity: item.quantity,
      unitPrice,
      lineTotal,
      product: {
        id: item.product.id,
        name: item.product.name,
        slug: item.product.slug,
        sku: item.product.sku,
        unit: item.product.unit,
        price: unitPrice,
        stock: item.product.stock,
        imageUrl: item.product.imageUrl,
        isActive: item.product.isActive && item.product.category.isActive,
        inStock: item.product.stock > 0,
        stockStatus: getStockStatus(item.product.stock, item.product.lowStockThreshold),
      },
    };
  });

  const subtotal = Number(items.reduce((sum, i) => sum + i.lineTotal, 0).toFixed(2));
  const totalQuantity = items.reduce((sum, i) => sum + i.quantity, 0);

  return {
    id: cart?.id || null,
    items,
    summary: {
      itemCount: items.length,
      totalQuantity,
      subtotal,
    },
  };
};

const ensureCart = async (userId) =>
  prisma.cart.upsert({
    where: { userId },
    update: {},
    create: { userId },
    include: cartInclude,
  });

const assertProductAvailable = async (productId, requestedQty) => {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      name: true,
      stock: true,
      isActive: true,
      category: { select: { isActive: true } },
    },
  });
  if (!product || !product.isActive || !product.category.isActive) {
    throw ApiError.notFound('Product not found or unavailable');
  }
  if (product.stock < requestedQty) {
    throw ApiError.conflict(`Only ${product.stock} unit(s) of "${product.name}" available in stock`);
  }
  return product;
};

const getCart = async (userId) => formatCart(await ensureCart(userId));

const addItem = async (userId, { productId, quantity }) => {
  const cart = await ensureCart(userId);
  const existing = cart.items.find((i) => i.productId === productId);
  const nextQty = (existing?.quantity || 0) + quantity;

  await assertProductAvailable(productId, nextQty);

  await prisma.cartItem.upsert({
    where: { cartId_productId: { cartId: cart.id, productId } },
    update: { quantity: nextQty },
    create: { cartId: cart.id, productId, quantity },
  });

  const updated = await prisma.cart.findUnique({ where: { id: cart.id }, include: cartInclude });
  return formatCart(updated);
};

const updateItem = async (userId, productId, { quantity }) => {
  const cart = await ensureCart(userId);
  const existing = cart.items.find((i) => i.productId === productId);
  if (!existing) throw ApiError.notFound('Item not found in cart');

  if (quantity === 0) {
    await prisma.cartItem.delete({ where: { id: existing.id } });
  } else {
    await assertProductAvailable(productId, quantity);
    await prisma.cartItem.update({ where: { id: existing.id }, data: { quantity } });
  }

  const updated = await prisma.cart.findUnique({ where: { id: cart.id }, include: cartInclude });
  return formatCart(updated);
};

const removeItem = async (userId, productId) => {
  const cart = await ensureCart(userId);
  const existing = cart.items.find((i) => i.productId === productId);
  if (!existing) throw ApiError.notFound('Item not found in cart');

  await prisma.cartItem.delete({ where: { id: existing.id } });
  const updated = await prisma.cart.findUnique({ where: { id: cart.id }, include: cartInclude });
  return formatCart(updated);
};

const clearCart = async (userId) => {
  const cart = await ensureCart(userId);
  await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
  const updated = await prisma.cart.findUnique({ where: { id: cart.id }, include: cartInclude });
  return formatCart(updated);
};

module.exports = { getCart, addItem, updateItem, removeItem, clearCart };
