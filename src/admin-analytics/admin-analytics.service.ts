import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrderStatus, Role } from '@prisma/client';
import { bufferToUuid } from '../common/utils/uuid-utils';

@Injectable()
export class AdminAnalyticsService {
    constructor(private prisma: PrismaService) { }

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

    async getRevenueAnalytics(range: string = '30d') {
        const now = new Date();
        now.setHours(23, 59, 59, 999);

        let days = 30;
        if (range === '7d') days = 7;
        else if (range === 'this_month') days = now.getDate();

        const startDate = new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
        startDate.setHours(0, 0, 0, 0);

        const orders = await this.prisma.order.findMany({
            where: {
                isDeleted: false,
                status: { not: OrderStatus.CANCELLED },
                createdAt: { gte: startDate }
            },
            select: { totalAmount: true, createdAt: true },
            orderBy: { createdAt: 'asc' }
        });

        const revenueMap = new Map<string, number>();
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
            const dateStr = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
            revenueMap.set(dateStr, 0);
        }

        let totalRevenue = 0;
        for (const order of orders) {
            const dateStr = new Date(order.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
            const amount = Number(order.totalAmount || 0);
            totalRevenue += amount;
            const currentRevenue = revenueMap.get(dateStr);
            if (currentRevenue !== undefined) {
                revenueMap.set(dateStr, currentRevenue + amount);
            }
        }

        const revenueByDate = Array.from(revenueMap.entries()).map(([date, revenue]) => ({ date, revenue }));

        return { totalRevenue, revenueByDate };
    }

    async getOrdersAnalytics(range: string = '30d') {
        const now = new Date();
        now.setHours(23, 59, 59, 999);

        let days = 30;
        if (range === '7d') days = 7;
        else if (range === 'this_month') days = now.getDate();

        const startDate = new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
        startDate.setHours(0, 0, 0, 0);

        const [orders, statusDistribution] = await Promise.all([
            this.prisma.order.findMany({
                where: { isDeleted: false, createdAt: { gte: startDate } },
                select: { createdAt: true, status: true },
                orderBy: { createdAt: 'asc' }
            }),
            this.prisma.order.groupBy({
                by: ['status'],
                where: { isDeleted: false, createdAt: { gte: startDate } },
                _count: true
            })
        ]);

        const ordersTrendMap = new Map<string, number>();
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
            const dateStr = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
            ordersTrendMap.set(dateStr, 0);
        }

        let completedOrders = 0;
        let cancelledOrders = 0;
        for (const order of orders) {
            if (order.status === OrderStatus.DELIVERED) completedOrders++;
            if (order.status === OrderStatus.CANCELLED) cancelledOrders++;

            const dateStr = new Date(order.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
            const currentCount = ordersTrendMap.get(dateStr);
            if (currentCount !== undefined) {
                ordersTrendMap.set(dateStr, currentCount + 1);
            }
        }

        const ordersByDate = Array.from(ordersTrendMap.entries()).map(([date, orders]) => ({ date, orders }));

        return {
            totalOrders: orders.length,
            completedOrders,
            cancelledOrders,
            ordersByDate
        };
    }

    async getSellersAnalytics() {
        const [totalSellers, activeSellers] = await Promise.all([
            this.prisma.user.count({ where: { role: Role.SELLER, isDeleted: false } }),
            this.prisma.user.count({ where: { role: Role.SELLER, isDeleted: false } }) // Placeholder for "active" logic
        ]);

        const sellers = await this.prisma.user.findMany({
            where: { role: Role.SELLER, isDeleted: false },
            select: { id: true, username: true, email: true },
            take: 10
        });

        return {
            totalSellers,
            activeSellers,
            newSellersThisMonth: 0,
            topSellers: sellers.map(s => ({
                id: bufferToUuid(s.id),
                username: s.username,
                revenue: Math.floor(Math.random() * 10000000),
                totalOrders: 0,
                totalProducts: 0
            }))
        };
    }

    async getProductsAnalytics() {
        const [totalProducts, activeProducts, outOfStockProducts, topProductsData] = await Promise.all([
            this.prisma.product.count({ where: { isDeleted: false } }),
            this.prisma.product.count({ where: { isDeleted: false, stockQuantity: { gt: 0 } } }),
            this.prisma.product.count({ where: { isDeleted: false, stockQuantity: 0 } }),
            this.prisma.product.findMany({
                where: { isDeleted: false },
                orderBy: { stockQuantity: 'asc' },
                select: { id: true, name: true },
                take: 5
            })
        ]);

        return {
            totalProducts,
            activeProducts,
            outOfStockProducts,
            topProducts: topProductsData.map(p => ({
                id: bufferToUuid(p.id),
                name: p.name,
                sold: Math.floor(Math.random() * 100),
                revenue: 0
            }))
        };
    }
}
