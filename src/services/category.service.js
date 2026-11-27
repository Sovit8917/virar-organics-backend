const prisma = require('../config/prisma');
const ApiError = require('../utils/ApiError');
const { buildMeta } = require('../utils/pagination');
const { isUuid, slugify } = require('../utils/slug');

const publicSelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  imageUrl: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
};

const adminSelect = {
  ...publicSelect,
  isActive: true,
};

const formatCategory = (cat) => {
  const { _count, ...rest } = cat;
  return { ...rest, productCount: _count?.products ?? 0 };
};

const findOrFail = async (id) => {
  const category = await prisma.category.findUnique({
    where: { id },
    select: { ...adminSelect, _count: { select: { products: true } } },
  });
  if (!category) throw ApiError.notFound('Category not found');
  return category;
};

const listPublic = async ({ page, limit, search }) => {
  const where = { isActive: true };
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [rows, total] = await prisma.$transaction([
    prisma.category.findMany({
      where,
      select: { ...publicSelect, _count: { select: { products: { where: { isActive: true } } } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.category.count({ where }),
  ]);

  return { items: rows.map(formatCategory), meta: buildMeta(page, limit, total) };
};

const getPublic = async (idOrSlug) => {
  const where = isUuid(idOrSlug)
    ? { id: idOrSlug, isActive: true }
    : { slug: idOrSlug.toLowerCase(), isActive: true };

  const category = await prisma.category.findFirst({
    where,
    select: { ...publicSelect, _count: { select: { products: { where: { isActive: true } } } } },
  });
  if (!category) throw ApiError.notFound('Category not found');
  return formatCategory(category);
};

const listAdmin = async ({ page, limit, search, isActive, sortBy, sortOrder }) => {
  const where = {};
  if (typeof isActive === 'boolean') where.isActive = isActive;
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { slug: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [rows, total] = await prisma.$transaction([
    prisma.category.findMany({
      where,
      select: { ...adminSelect, _count: { select: { products: true } } },
      orderBy: [{ [sortBy]: sortOrder }, { name: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.category.count({ where }),
  ]);

  return { items: rows.map(formatCategory), meta: buildMeta(page, limit, total) };
};

const getAdmin = async (id) => formatCategory(await findOrFail(id));

const create = async (input) => {
  const slug = input.slug || slugify(input.name);
  if (!slug) {
    throw ApiError.unprocessable('Unable to generate a valid slug from name', [
      { field: 'name', message: 'Provide alphanumeric characters or an explicit slug' },
    ]);
  }

  const category = await prisma.category.create({
    data: {
      name: input.name,
      slug,
      description: input.description,
      imageUrl: input.imageUrl,
      isActive: input.isActive,
      sortOrder: input.sortOrder,
    },
    select: { ...adminSelect, _count: { select: { products: true } } },
  });

  return formatCategory(category);
};

const update = async (id, input) => {
  await findOrFail(id);
  const data = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.slug !== undefined) data.slug = input.slug;
  if (input.description !== undefined) data.description = input.description;
  if (input.imageUrl !== undefined) data.imageUrl = input.imageUrl;
  if (input.isActive !== undefined) data.isActive = input.isActive;
  if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;

  const category = await prisma.category.update({
    where: { id },
    data,
    select: { ...adminSelect, _count: { select: { products: true } } },
  });

  return formatCategory(category);
};

const remove = async (id) => {
  await findOrFail(id);
  const productCount = await prisma.product.count({ where: { categoryId: id } });
  if (productCount > 0) {
    throw ApiError.conflict('Cannot delete category with existing products');
  }
  await prisma.category.delete({ where: { id } });
  return { id, deleted: true };
};

module.exports = { listPublic, getPublic, listAdmin, getAdmin, create, update, remove };
