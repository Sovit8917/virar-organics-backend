const prisma = require('../config/prisma');
const ApiError = require('../utils/ApiError');

const createBulkEnquiry = async ({ name, phone, email, productId, product, quantity, message }) => {
  return prisma.$transaction(async (tx) => {
    let resolvedProductName = product;

    if (productId) {
      const existingProduct = await tx.product.findUnique({
        where: { id: productId },
        select: { id: true, name: true },
      });
      if (!existingProduct) {
        throw ApiError.unprocessable('Product does not exist', [
          { field: 'productId', message: 'Unknown product' },
        ]);
      }
      resolvedProductName = existingProduct.name;
    }

    const enquiry = await tx.bulkEnquiry.create({
      data: {
        name,
        phone,
        email,
        productId: productId || null,
        productName: resolvedProductName,
        quantity,
        message,
      },
    });

    // Every Bulk Order Enquiry automatically creates a CRM Lead in NEW status.
    const lead = await tx.lead.create({
      data: {
        enquiryId: enquiry.id,
        name,
        phone,
        email,
        productId: productId || null,
        productName: resolvedProductName,
        quantity,
        message,
        status: 'NEW',
      },
      select: {
        id: true,
        enquiryId: true,
        status: true,
        productName: true,
        quantity: true,
        createdAt: true,
      },
    });

    return { enquiry, lead };
  });
};

module.exports = { createBulkEnquiry };
