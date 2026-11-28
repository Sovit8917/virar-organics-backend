const prisma = require('../config/prisma');
const { getIstDayBounds, getIstMonthStart } = require('../utils/date');

const getDashboardSummary = async () => {
  const now = new Date();
  const { start: startOfToday, end: endOfToday } = getIstDayBounds(now);
  const startOfMonth = getIstMonthStart(now);

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
        paymentStatus: 'PAID',
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
