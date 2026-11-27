const prisma = require('../config/prisma');

const getDashboardSummary = async () => {
  const now = new Date();

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);

  const [
    totalOrdersToday,
    monthlyRevenueAgg,
    newLeadsCount,
    todaysFollowUpsCount,
    lowStockRows,
  ] = await Promise.all([
    prisma.order.count({
      where: {
        createdAt: { gte: startOfToday, lte: endOfToday },
      },
    }),
    prisma.order.aggregate({
      _sum: { totalAmount: true },
      where: {
        createdAt: { gte: startOfMonth, lte: now },
        status: { not: 'CANCELLED' },
        OR: [{ paymentStatus: 'PAID' }, { status: { in: ['PAID', 'SHIPPED', 'DELIVERED'] } }],
      },
    }),
    prisma.lead.count({
      where: { status: 'NEW' },
    }),
    prisma.lead.count({
      where: {
        followUpDate: { gte: startOfToday, lte: endOfToday },
        status: { notIn: ['CONVERTED', 'LOST'] },
      },
    }),
    prisma.$queryRaw`
      SELECT COUNT(*)::int AS count
      FROM products
      WHERE "isActive" = true AND stock <= "lowStockThreshold"
    `,
  ]);

  return {
    totalOrdersToday,
    revenueThisMonth: Number(monthlyRevenueAgg._sum.totalAmount || 0),
    newLeadsCount,
    todaysFollowUpsCount,
    lowStockProductsCount: lowStockRows?.[0]?.count ?? 0,
    generatedAt: now.toISOString(),
  };
};

module.exports = { getDashboardSummary };
