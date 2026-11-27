const prisma = require('../config/prisma');
const ApiError = require('../utils/ApiError');
const { buildMeta } = require('../utils/pagination');
const { isUuid, slugify } = require('../utils/slug');

const productSelect = {
  id: true,
  name: true,
  slug: true,
  sku: true,
  shortDescription: true,
  description: true,
  price: true,
  compareAtPrice: true,
  unit: true,
  stock: true,
  lowStockThreshold: true,
  imageUrl: true,
  images: true,
  isActive: true,
  isFeatured: true,
  categoryId: true,
  category: { select: { id: true, name: true, slug: true, isActive: true } },
  createdAt: true,
  updatedAt: true,
};

const getStockStatus = (stock, lowStockThreshold) => {
  if (stock <= 0) return 'OUT_OF_STOCK';
  if (stock <= lowStockThreshold) return 'LOW_STOCK';
  return 'IN_STOCK';
};

const formatProduct = (product) => ({
  ...product,
  price: Number(product.price),
  compareAtPrice: product.compareAtPrice !== null ? Number(product.compareAtPrice) : null,
  inStock: product.stock > 0,
  stockStatus: getStockStatus(product.stock, product.lowStockThreshold),
});

const findOrFail = async (id) => {
  const product = await prisma.product.findUnique({ where: { id }, select: productSelect });
  if (!product) throw ApiError.notFound('Product not found');
  return product;
};

const assertCategoryExists = async (categoryId) => {
  const category = await prisma.category.findUnique({ where: { id: categoryId }, select: { id: true } });
  if (!category) {
    throw ApiError.unprocessable('Category does not exist', [{ field: 'categoryId', message: 'Unknown category' }]);
  }
};

const buildProductWhere = (query, { publicOnly }) => {
  const where = {};

  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: 'insensitive' } },
      { shortDescription: { contains: query.search, mode: 'insensitive' } },
      { description: { contains: query.search, mode: 'insensitive' } },
      { sku: { contains: query.search, mode: 'insensitive' } },
    ];
  }

  if (query.categoryId) {
    where.categoryId = query.categoryId;
  } else if (query.category) {
    if (isUuid(query.category)) where.categoryId = query.category;
    else where.category = { slug: query.category.toLowerCase() };
  }

  if (publicOnly) {
    where.isActive = true;
    where.category = { ...(where.category || {}), isActive: true };
  } else if (typeof query.isActive === 'boolean') {
    where.isActive = query.isActive;
  }

  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    where.price = {};
    if (query.minPrice !== undefined) where.price.gte = query.minPrice;
    if (query.maxPrice !== undefined) where.price.lte = query.maxPrice;
  }

  if (typeof query.inStock === 'boolean') {
    where.stock = query.inStock ? { gt: 0 } : { lte: 0 };
  }

  if (typeof query.isFeatured === 'boolean') {
    where.isFeatured = query.isFeatured;
  }

  return where;
};

const resolveOrderBy = (sortBy, sortOrder) => {
  const direction = sortOrder || (sortBy === 'createdAt' ? 'desc' : 'asc');
  return [{ [sortBy]: direction }, { id: 'asc' }];
};

const listPublic = async (query) => {
  const { page, limit, sortBy, sortOrder } = query;
  const where = buildProductWhere(query, { publicOnly: true });

  const [rows, total] = await prisma.$transaction([
    prisma.product.findMany({
      where,
      select: productSelect,
      orderBy: resolveOrderBy(sortBy, sortOrder),
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.product.count({ where }),
  ]);

  return { items: rows.map(formatProduct), meta: buildMeta(page, limit, total) };
};

const getPublic = async (idOrSlug) => {
  const where = isUuid(idOrSlug)
    ? { id: idOrSlug, isActive: true, category: { isActive: true } }
    : { slug: idOrSlug.toLowerCase(), isActive: true, category: { isActive: true } };

  const product = await prisma.product.findFirst({ where, select: productSelect });
  if (!product) throw ApiError.notFound('Product not found');
  return formatProduct(product);
};

const listAdmin = async (query) => {
  const { page, limit, sortBy, sortOrder, lowStock } = query;
  const where = buildProductWhere(query, { publicOnly: false });

  if (lowStock === true) {
    const lowStockRows = await prisma.$queryRaw`
      SELECT id FROM products WHERE stock <= "lowStockThreshold"
    `;
    const ids = lowStockRows.map((r) => r.id);
    if (ids.length === 0) {
      return { items: [], meta: buildMeta(page, limit, 0) };
    }
    where.id = { in: ids };
  }

  const [rows, total] = await prisma.$transaction([
    prisma.product.findMany({
      where,
      select: productSelect,
      orderBy: resolveOrderBy(sortBy, sortOrder),
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.product.count({ where }),
  ]);

  return { items: rows.map(formatProduct), meta: buildMeta(page, limit, total) };
};

const getAdmin = async (id) => formatProduct(await findOrFail(id));

const create = async (input) => {
  await assertCategoryExists(input.categoryId);

  const slug = input.slug || slugify(input.name);
  if (!slug) {
    throw ApiError.unprocessable('Unable to generate a valid slug from name', [
      { field: 'name', message: 'Provide alphanumeric characters or an explicit slug' },
    ]);
  }

  const product = await prisma.product.create({
    data: {
      name: input.name,
      slug,
      sku: input.sku,
      shortDescription: input.shortDescription,
      description: input.description,
      price: input.price,
      compareAtPrice: input.compareAtPrice,
      unit: input.unit,
      stock: input.stock,
      lowStockThreshold: input.lowStockThreshold,
      imageUrl: input.imageUrl,
      images: input.images,
      isActive: input.isActive,
      isFeatured: input.isFeatured,
      categoryId: input.categoryId,
    },
    select: productSelect,
  });

  return formatProduct(product);
};

const update = async (id, input) => {
  const existing = await findOrFail(id);
  if (input.categoryId !== undefined) await assertCategoryExists(input.categoryId);

  const effectivePrice = input.price !== undefined ? input.price : Number(existing.price);
  const effectiveCompareAt =
    input.compareAtPrice !== undefined
      ? input.compareAtPrice
      : existing.compareAtPrice !== null
        ? Number(existing.compareAtPrice)
        : null;

  if (effectiveCompareAt !== null && effectiveCompareAt < effectivePrice) {
    throw ApiError.unprocessable('compareAtPrice must be greater than or equal to price', [
      { field: 'compareAtPrice', message: 'compareAtPrice cannot be less than price' },
    ]);
  }

  const data = {};
  const fields = [
    'name',
    'slug',
    'sku',
    'shortDescription',
    'description',
    'price',
    'compareAtPrice',
    'unit',
    'stock',
    'lowStockThreshold',
    'imageUrl',
    'images',
    'isActive',
    'isFeatured',
    'categoryId',
  ];
  for (const field of fields) {
    if (input[field] !== undefined) data[field] = input[field];
  }

  const product = await prisma.product.update({ where: { id }, data, select: productSelect });
  return formatProduct(product);
};

const updatePrice = async (id, { price, compareAtPrice }) => {
  await findOrFail(id);
  const data = { price };
  if (compareAtPrice !== undefined) data.compareAtPrice = compareAtPrice;

  const product = await prisma.product.update({ where: { id }, data, select: productSelect });
  return formatProduct(product);
};

const adjustStock = async (id, { action, quantity }) => {
  await findOrFail(id);

  if (action === 'set') {
    const product = await prisma.product.update({
      where: { id },
      data: { stock: quantity },
      select: productSelect,
    });
    return formatProduct(product);
  }

  if (action === 'increment') {
    const product = await prisma.product.update({
      where: { id },
      data: { stock: { increment: quantity } },
      select: productSelect,
    });
    return formatProduct(product);
  }

  // Atomic decrement prevents stock from ever going negative under concurrent requests.
  const updated = await prisma.product.updateMany({
    where: { id, stock: { gte: quantity } },
    data: { stock: { decrement: quantity } },
  });

  if (updated.count === 0) {
    throw ApiError.conflict('Insufficient stock to decrement by the requested quantity');
  }

  return formatProduct(await findOrFail(id));
};

const remove = async (id) => {
  await findOrFail(id);
  await prisma.product.delete({ where: { id } });
  return { id, deleted: true };
};

module.exports = {
  getStockStatus,
  formatProduct,
  listPublic,
  getPublic,
  listAdmin,
  getAdmin,
  create,
  update,
  updatePrice,
  adjustStock,
  remove,
};
