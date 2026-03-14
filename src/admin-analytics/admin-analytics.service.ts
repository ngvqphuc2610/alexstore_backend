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
        const sellerBuffer = sellerId ? uuidToBuffer(sellerId) : null;
        const catId = categoryId ? parseInt(categoryId) : null;

        const where: any = {
            createdAt: { gte: startDate, lte: endDate },
            status: { not: OrderStatus.CANCELLED },
            isDeleted: false,
        };

        if (sellerBuffer || (catId !== null && !isNaN(catId))) {
            where.orderItems = {
                some: {
                    product: {
                        ...(sellerBuffer ? { sellerId: sellerBuffer } : {}),
                        ...(catId !== null && !isNaN(catId) ? { categoryId: catId } : {})
                    }
                }
            };
        }

        const orders = await this.prisma.order.findMany({
            where,
            include: {
                orderItems: { include: { product: { select: { sellerId: true, categoryId: true } } } }
            }
        });

        const revenueMap = new Map<string, number>();
        for (let i = 0; i < days; i++) {
            const d = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
            const dateStr = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
            revenueMap.set(dateStr, 0);
        }

        let totalRevenue = 0;
        for (const order of orders) {
            const dateStr = new Date(order.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
            
            let orderRevenue = 0;
            for (const item of order.orderItems) {
                // Apply filters per item if needed
                const itemSellerId = bufferToUuid(item.product.sellerId);
                if (sellerId && itemSellerId !== sellerId) continue;
                if (catId !== null && !isNaN(catId) && item.product.categoryId !== catId) continue;

                orderRevenue += Number(item.priceAtPurchase) * item.quantity;
            }

            if (orderRevenue > 0) {
                totalRevenue += orderRevenue;
                if (revenueMap.has(dateStr)) {
                    revenueMap.set(dateStr, revenueMap.get(dateStr)! + orderRevenue);
                }
            }
        }

        const revenueByDate = Array.from(revenueMap.entries()).map(([date, revenue]) => ({ date, revenue }));
        return { totalRevenue, revenueByDate };
    }

    async getOrdersAnalytics(range: string = '30d', sellerId?: string, categoryId?: string, from?: string, to?: string) {
        const { startDate, endDate, days } = this.getDateRange(range, from, to);
        const sellerBuffer = sellerId ? uuidToBuffer(sellerId) : null;
        const catId = categoryId ? parseInt(categoryId) : null;

        const where: any = {
            createdAt: { gte: startDate, lte: endDate },
            isDeleted: false,
        };

        if (sellerBuffer || (catId !== null && !isNaN(catId))) {
            where.orderItems = {
                some: {
                    product: {
                        ...(sellerBuffer ? { sellerId: sellerBuffer } : {}),
                        ...(catId !== null && !isNaN(catId) ? { categoryId: catId } : {})
                    }
                }
            };
        }

        const orders = await this.prisma.order.findMany({
            where,
            include: {
                orderItems: { include: { product: { select: { sellerId: true, categoryId: true } } } }
            }
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

        for (const order of orders) {
            // Check if order has valid items for the filter
            let isValid = true;
            if (sellerId || (catId !== null && !isNaN(catId))) {
                isValid = order.orderItems.some(item => {
                    const itemSellerId = bufferToUuid(item.product.sellerId);
                    if (sellerId && itemSellerId !== sellerId) return false;
                    if (catId !== null && !isNaN(catId) && item.product.categoryId !== catId) return false;
                    return true;
                });
            }

            if (!isValid) continue;

            totalOrders++;
            if (order.status === OrderStatus.DELIVERED) completedOrders++;
            if (order.status === OrderStatus.CANCELLED) cancelledOrders++;

            const dateStr = new Date(order.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
            if (ordersTrendMap.has(dateStr)) {
                ordersTrendMap.set(dateStr, ordersTrendMap.get(dateStr)! + 1);
            }
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
            createdAt: { gte: startDate, lte: endDate },
            status: { not: OrderStatus.CANCELLED },
            isDeleted: false,
        };

        if (sellerBuffer || (catId !== null && !isNaN(catId))) {
            where.orderItems = {
                some: {
                    product: {
                        ...(sellerBuffer ? { sellerId: sellerBuffer } : {}),
                        ...(catId !== null && !isNaN(catId) ? { categoryId: catId } : {})
                    }
                }
            };
        }

        const [totalSellers, orders] = await Promise.all([
            this.prisma.user.count({ where: { role: Role.SELLER, isDeleted: false } }),
            this.prisma.order.findMany({
                where,
                include: {
                    orderItems: { include: { product: { select: { sellerId: true, categoryId: true } } } }
                }
            })
        ]);

        const sellerStatsMap = new Map<string, { revenue: number, orders: Set<string>, products: number }>();

        for (const order of orders) {
            const orderIdStr = bufferToUuid(order.id);
            for (const item of order.orderItems) {
                const itemSellerId = bufferToUuid(item.product.sellerId);
                
                if (sellerId && itemSellerId !== sellerId) continue;
                if (catId !== null && !isNaN(catId) && item.product.categoryId !== catId) continue;

                const current = sellerStatsMap.get(itemSellerId) || { revenue: 0, orders: new Set<string>(), products: 0 };
                current.revenue += Number(item.priceAtPurchase) * item.quantity;
                current.orders.add(orderIdStr);
                current.products += item.quantity;
                sellerStatsMap.set(itemSellerId, current);
            }
        }

        const totalActiveSellers = sellerStatsMap.size;
        const totalPages = Math.ceil(totalActiveSellers / limit);

        const sortedSellers = Array.from(sellerStatsMap.entries())
            .sort((a, b) => b[1].revenue - a[1].revenue)
            .slice((page - 1) * limit, page * limit);

        const topSellers = await Promise.all(sortedSellers.map(async ([sid, stats]) => {
            const seller = await this.prisma.user.findUnique({
                where: { id: uuidToBuffer(sid) as any },
                select: {
                    username: true,
                    sellerProfile: { select: { shopName: true } }
                }
            });
            return {
                id: sid,
                username: (seller as any)?.sellerProfile?.shopName || seller?.username || 'Unknown',
                revenue: stats.revenue,
                totalOrders: stats.orders.size,
                totalProducts: stats.products
            };
        }));

        return {
            totalSellers,
            activeSellers: totalActiveSellers,
            newSellersThisMonth: 0,
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

        const [totalProducts, activeProducts, outOfStockProducts, orderItems] = await Promise.all([
            this.prisma.product.count({ where: whereProduct }),
            this.prisma.product.count({ where: { ...whereProduct, status: ProductStatus.APPROVED } }),
            this.prisma.product.count({ where: { ...whereProduct, stockQuantity: 0 } }),
            this.prisma.orderItem.findMany({
                where: {
                    ...(catId && !isNaN(catId) ? { product: { categoryId: catId } } : {}),
                    order: {
                        createdAt: { gte: startDate, lte: endDate },
                        status: { not: OrderStatus.CANCELLED },
                        isDeleted: false
                    }
                },
                select: {
                    productId: true,
                    quantity: true,
                    priceAtPurchase: true
                }
            })
        ]);

        const productStatsMap = new Map<string, { sold: number, revenue: number }>();

        for (const item of orderItems) {
            const pid = bufferToUuid(item.productId);
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
                where: { id: uuidToBuffer(pid) as any },
                select: { name: true }
            });
            return {
                id: pid,
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
