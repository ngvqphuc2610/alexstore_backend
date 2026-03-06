import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrderStatus, Role, ProductStatus } from '@prisma/client';
import { bufferToUuid, uuidToBuffer } from '../common/utils/uuid-utils';

@Injectable()
export class AdminAnalyticsService {
    constructor(private prisma: PrismaService) { }

    async onModuleInit() {
        try {
            const tables = await (this.prisma as any).$queryRawUnsafe('SHOW TABLES');
            console.log('AdminAnalyticsService detected tables:', JSON.stringify(tables, null, 2));
        } catch (e) {
            console.error('AdminAnalyticsService failed to check tables:', e.message);
        }
    }

    async getOverview() {
        const [
            totalOrdersCount,
            totalUsersCount,
            totalSellersCount,
            totalProductsCount,
            ordersData
        ] = await Promise.all([
            this.prisma.order.count({ where: { isDeleted: false } }),
            this.prisma.user.count({ where: { role: Role.BUYER, isDeleted: false } }),
            this.prisma.user.count({ where: { role: Role.SELLER, isDeleted: false } }),
            this.prisma.product.count({ where: { isDeleted: false } }),
            this.prisma.order.findMany({
                where: { isDeleted: false, status: { not: OrderStatus.CANCELLED } },
                select: { totalAmount: true }
            })
        ]);

        const gmv = ordersData.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
        const totalRevenue = gmv;

        return {
            totalRevenue,
            totalOrders: totalOrdersCount,
            totalUsers: totalUsersCount,
            totalSellers: totalSellersCount,
            totalProducts: totalProductsCount,
            gmv
        };
    }

    async getRevenueAnalytics(range: string = '30d', sellerId?: string, categoryId?: string, from?: string, to?: string) {
        const { startDate, endDate, days } = this.getDateRange(range, from, to);
        const sellerBuffer = sellerId ? Buffer.from(sellerId.replace(/-/g, ''), 'hex') : null;
        const catId = categoryId ? parseInt(categoryId) : null;

        const where: any = {
            date: { gte: startDate, lte: endDate }
        };
        if (sellerBuffer) where.sellerId = sellerBuffer;
        if (catId && !isNaN(catId)) where.categoryId = catId;

        const stats = await (this.prisma as any).dailyPerformanceStats.findMany({
            where,
            orderBy: { date: 'asc' }
        });

        const revenueMap = new Map<string, number>();
        for (let i = 0; i < days; i++) {
            const d = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
            const dateStr = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
            revenueMap.set(dateStr, 0);
        }

        let totalRevenue = 0;
        for (const s of stats) {
            const dateStr = new Date(s.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
            const rev = Number(s.revenue);
            totalRevenue += rev;
            revenueMap.set(dateStr, (revenueMap.get(dateStr) || 0) + rev);
        }

        const revenueByDate = Array.from(revenueMap.entries()).map(([date, revenue]) => ({ date, revenue }));
        return { totalRevenue, revenueByDate };
    }

    async getOrdersAnalytics(range: string = '30d', sellerId?: string, categoryId?: string, from?: string, to?: string) {
        const { startDate, endDate, days } = this.getDateRange(range, from, to);
        const sellerBuffer = sellerId ? Buffer.from(sellerId.replace(/-/g, ''), 'hex') : null;
        const catId = categoryId ? parseInt(categoryId) : null;

        const where: any = {
            date: { gte: startDate, lte: endDate }
        };
        if (sellerBuffer) where.sellerId = sellerBuffer;
        if (catId && !isNaN(catId)) where.categoryId = catId;

        const stats = await (this.prisma as any).dailyPerformanceStats.findMany({
            where,
            orderBy: { date: 'asc' }
        });

        const ordersTrendMap = new Map<string, number>();
        for (let i = 0; i < days; i++) {
            const d = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
            const dateStr = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
            ordersTrendMap.set(dateStr, 0);
        }

        let totalOrders = 0;
        let completedOrders = 0;
        let cancelledOrders = 0;
        for (const s of stats) {
            const dateStr = new Date(s.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
            totalOrders += s.ordersCount;
            completedOrders += s.completedOrdersCount || 0;
            cancelledOrders += s.cancelledOrdersCount || 0;
            ordersTrendMap.set(dateStr, (ordersTrendMap.get(dateStr) || 0) + s.ordersCount);
        }

        const ordersByDate = Array.from(ordersTrendMap.entries()).map(([date, orders]) => ({ date, orders }));

        return {
            totalOrders,
            completedOrders,
            cancelledOrders,
            ordersByDate
        };
    }

    async getSellersAnalytics(range: string = '30d', sellerId?: string, categoryId?: string, from?: string, to?: string, page: number = 1, limit: number = 10) {
        const { startDate, endDate } = this.getDateRange(range, from, to);
        const sellerBuffer = sellerId ? uuidToBuffer(sellerId) : null;
        const catId = categoryId ? parseInt(categoryId) : null;

        const where: any = {
            date: { gte: startDate, lte: endDate }
        };
        if (sellerBuffer) where.sellerId = sellerBuffer;
        if (catId && !isNaN(catId)) where.categoryId = catId;

        const [totalSellers, stats] = await Promise.all([
            this.prisma.user.count({ where: { role: Role.SELLER, isDeleted: false } }),
            (this.prisma as any).dailyPerformanceStats.findMany({
                where,
                include: {
                    // This is optional if we store shop names, but for now we join
                }
            })
        ]);

        const sellerStatsMap = new Map<string, { revenue: number, orders: number, products: number }>();
        const activeSellersSet = new Set<string>();

        for (const s of stats) {
            const sid = Buffer.from(s.sellerId as any).toString('hex');
            activeSellersSet.add(sid);
            const current = sellerStatsMap.get(sid) || { revenue: 0, orders: 0, products: 0 };
            current.revenue += Number(s.revenue);
            current.orders += s.ordersCount;
            current.products += s.unitsSold;
            sellerStatsMap.set(sid, current);
        }

        const totalActiveSellers = sellerStatsMap.size;
        const totalPages = Math.ceil(totalActiveSellers / limit);

        const sortedSellers = Array.from(sellerStatsMap.entries())
            .sort((a, b) => b[1].revenue - a[1].revenue)
            .slice((page - 1) * limit, page * limit);

        const topSellers = await Promise.all(sortedSellers.map(async ([sid, stats]) => {
            const seller = await this.prisma.user.findUnique({
                where: { id: Buffer.from(sid, 'hex') },
                select: {
                    username: true,
                    sellerProfile: { select: { shopName: true } }
                }
            });
            if (!seller) {
                console.log(`[DEBUG] Seller not found for sid hex: ${sid}`);
            }
            return {
                id: bufferToUuid(Buffer.from(sid, 'hex')),
                username: seller?.sellerProfile?.shopName || seller?.username || 'Unknown',
                revenue: stats.revenue,
                totalOrders: stats.orders,
                totalProducts: stats.products
            };
        }));

        return {
            totalSellers,
            activeSellers: totalActiveSellers,
            newSellersThisMonth: 0, // Simplified for now
            topSellers,
            pagination: {
                total: totalActiveSellers,
                pages: totalPages,
                currentPage: page,
                limit
            }
        };
    }

    async getProductsAnalytics(range: string = '30d', categoryId?: string, from?: string, to?: string, page: number = 1, limit: number = 10) {
        const { startDate, endDate } = this.getDateRange(range, from, to);
        const catId = categoryId ? parseInt(categoryId) : null;

        const whereProduct: any = { isDeleted: false };
        if (catId && !isNaN(catId)) whereProduct.categoryId = catId;

        const whereStats: any = { date: { gte: startDate, lte: endDate } };
        if (catId && !isNaN(catId)) whereStats.categoryId = catId;

        const [totalProducts, activeProducts, outOfStockProducts, stats] = await Promise.all([
            this.prisma.product.count({ where: whereProduct }),
            this.prisma.product.count({ where: { ...whereProduct, status: ProductStatus.APPROVED } }),
            this.prisma.product.count({ where: { ...whereProduct, stockQuantity: 0 } }),
            (this.prisma as any).dailyPerformanceStats.findMany({ where: whereStats })
        ]);

        const productStatsMap = new Map<string, { sold: number, revenue: number }>();
        // Note: For product level pre-aggregation, we might need a separate ProductStats table
        // For now, we reuse the daily stats which are split by seller+category.
        // This won't give individual products. So for products, we actually still need the real-time query
        // OR we use the DailyPerformanceStats but we'd need productId as a dimension.

        // FOR NOW: Let's keep Product analytics real-time because products change too often
        // and usually there are many products, so a DailyProductStats table would be huge.
        // BUT we'll use the stats table for the OVERVIEW metrics if possible.

        // Actually, let's revert Products to real-time but optimize the query.
        const orderItems = await this.prisma.orderItem.findMany({
            where: {
                ...(catId && !isNaN(catId) ? { product: { categoryId: catId } } : {}),
                order: {
                    createdAt: { gte: startDate, lte: endDate },
                    status: { not: OrderStatus.CANCELLED }
                }
            },
            select: {
                productId: true,
                quantity: true,
                priceAtPurchase: true
            }
        });

        for (const item of orderItems) {
            const pid = Buffer.from(item.productId as any).toString('hex');
            const stats = productStatsMap.get(pid) || { sold: 0, revenue: 0 };
            stats.sold += item.quantity;
            stats.revenue += Number(item.priceAtPurchase) * item.quantity;
            productStatsMap.set(pid, stats);
        }

        const totalProductsWithSales = productStatsMap.size;
        const totalPages = Math.ceil(totalProductsWithSales / limit);

        const sortedProducts = Array.from(productStatsMap.entries())
            .sort((a, b) => b[1].sold - a[1].sold)
            .slice((page - 1) * limit, page * limit);

        const topProducts = await Promise.all(sortedProducts.map(async ([pid, stats]) => {
            const product = await this.prisma.product.findUnique({
                where: { id: Buffer.from(pid, 'hex') },
                select: { name: true }
            });
            return {
                id: bufferToUuid(Buffer.from(pid, 'hex')),
                name: product?.name || 'Unknown',
                sold: stats.sold,
                revenue: stats.revenue
            };
        }));

        return {
            totalProducts,
            activeProducts,
            outOfStockProducts,
            topProducts,
            pagination: {
                total: totalProductsWithSales,
                pages: totalPages,
                currentPage: page,
                limit
            }
        };
    }

    async getSellersList() {
        const sellers = await this.prisma.user.findMany({
            where: { role: Role.SELLER, isDeleted: false },
            select: {
                id: true,
                username: true,
                sellerProfile: { select: { shopName: true } }
            },
            orderBy: { username: 'asc' }
        });

        return sellers.map(s => ({
            id: bufferToUuid(s.id),
            username: s.sellerProfile?.shopName || s.username
        }));
    }

    private getDateRange(range: string, from?: string, to?: string) {
        const now = new Date();
        const endDate = new Date(now);
        endDate.setHours(23, 59, 59, 999);

        let startDate = new Date(now);
        let days = 30;

        if (range === 'today') {
            startDate.setHours(0, 0, 0, 0);
            days = 1;
        } else if (range === '7d') {
            days = 7;
            startDate = new Date(endDate.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
            startDate.setHours(0, 0, 0, 0);
        } else if (range === '30d') {
            days = 30;
            startDate = new Date(endDate.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
            startDate.setHours(0, 0, 0, 0);
        } else if (range === 'this_month') {
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            startDate.setHours(0, 0, 0, 0);
            days = Math.floor((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)) + 1;
        } else if (range === 'last_month') {
            startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            startDate.setHours(0, 0, 0, 0);
            const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 0);
            endDate.setTime(lastDayOfMonth.getTime());
            endDate.setHours(23, 59, 59, 999);
            days = Math.floor((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)) + 1;
        } else if (range === 'custom_range' && from && to) {
            startDate = new Date(from);
            startDate.setHours(0, 0, 0, 0);
            endDate.setTime(new Date(to).getTime());
            endDate.setHours(23, 59, 59, 999);
            days = Math.floor((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)) + 1;
        } else {
            // Default 30d
            days = 30;
            startDate = new Date(endDate.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
            startDate.setHours(0, 0, 0, 0);
        }

        return { startDate, endDate, days };
    }
}
