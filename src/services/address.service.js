const prisma = require('../config/prisma');
const ApiError = require('../utils/ApiError');

const addressSelect = {
  id: true,
  label: true,
  fullName: true,
  phone: true,
  addressLine1: true,
  addressLine2: true,
  city: true,
  state: true,
  postalCode: true,
  country: true,
  isDefault: true,
  createdAt: true,
  updatedAt: true,
};

const findOwnedOrFail = async (userId, id) => {
  const address = await prisma.address.findFirst({ where: { id, userId }, select: addressSelect });
  if (!address) throw ApiError.notFound('Address not found');
  return address;
};

const list = (userId) =>
  prisma.address.findMany({
    where: { userId },
    select: addressSelect,
    orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
  });

const get = (userId, id) => findOwnedOrFail(userId, id);

const create = async (userId, input) => {
  const existingCount = await prisma.address.count({ where: { userId } });
  const shouldBeDefault = input.isDefault || existingCount === 0;

  return prisma.$transaction(async (tx) => {
    if (shouldBeDefault) {
      await tx.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
    }
    return tx.address.create({
      data: { ...input, userId, isDefault: shouldBeDefault },
      select: addressSelect,
    });
  });
};

const update = async (userId, id, input) => {
  await findOwnedOrFail(userId, id);

  return prisma.$transaction(async (tx) => {
    if (input.isDefault === true) {
      await tx.address.updateMany({
        where: { userId, id: { not: id }, isDefault: true },
        data: { isDefault: false },
      });
    }
    return tx.address.update({
      where: { id },
      data: input,
      select: addressSelect,
    });
  });
};

const remove = async (userId, id) => {
  const existing = await findOwnedOrFail(userId, id);

  await prisma.$transaction(async (tx) => {
    await tx.address.delete({ where: { id } });
    if (existing.isDefault) {
      const nextDefault = await tx.address.findFirst({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        select: { id: true },
      });
      if (nextDefault) {
        await tx.address.update({ where: { id: nextDefault.id }, data: { isDefault: true } });
      }
    }
  });

  return { id, deleted: true };
};

module.exports = { list, get, create, update, remove };
