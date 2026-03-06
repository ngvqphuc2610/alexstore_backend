import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { OrderStatus } from '@prisma/client';
import { startOfDay, endOfDay, subDays } from 'date-fns';

@Injectable()
export class AnalyticsAggregationService {
    private readonly logger = new Logger(AnalyticsAggregationService.name);

    constructor(private prisma: PrismaService) { }

    // Run every hour to update today's stats
    @Cron(CronExpression.EVERY_HOUR)
    async handleHourlyAggregation() {
        this.logger.log('Starting hourly analytics aggregation...');
        const today = new Date();
        await this.aggregateDate(today);
        this.logger.log('Hourly analytics aggregation completed.');
    }

    // Run at 00:05 to finalize yesterday's stats
    @Cron('5 0 * * *')
    async handleDailyAggregation() {
        this.logger.log('Starting daily final analytics aggregation...');
        const yesterday = subDays(new Date(), 1);
        await this.aggregateDate(yesterday);
        this.logger.log('Daily final analytics aggregation completed.');
    }

    /**
     * Aggregates all orders for a specific date and updates the DailyPerformanceStats table.
     * Grain: (Date, Seller, Category)
     */
    async aggregateDate(date: Date) {
        const startDate = startOfDay(date);
        const endDate = endOfDay(date);

        // 1. Get all successful orders for this date
        const orders = await this.prisma.order.findMany({
            where: {
                createdAt: { gte: startDate, lte: endDate },
                status: { not: OrderStatus.CANCELLED },
                isDeleted: false,
            },
            include: {
                orderItems: {
                    include: {
                        product: {
                            select: { sellerId: true, categoryId: true }
                        }
                    }
                }
            }
        });

        if (orders.length === 0) {
            this.logger.debug(`No orders found for ${startDate.toDateString()}. Skipping aggregation.`);
            return;
        }

        // 2. Map-reduce to aggregate by (sellerId, categoryId)
        // We use a Map to group stats by a composite key
        const aggregationMap = new Map<string, {
            revenue: number,
            ordersCount: Set<string>,
            completedOrdersCount: Set<string>,
            cancelledOrdersCount: Set<string>,
            unitsSold: number
        }>();

        for (const order of orders) {
            const orderIdStr = (order.id as any).toString('hex');
            const isCompleted = order.status === OrderStatus.DELIVERED;
            const isCancelled = order.status === OrderStatus.CANCELLED;

            for (const item of order.orderItems) {
                const sellerIdStr = (item.product.sellerId as any).toString('hex');
                const catId = item.product.categoryId;
                const key = `${sellerIdStr}-${catId}`;

                const stats = aggregationMap.get(key) || {
                    revenue: 0,
                    ordersCount: new Set<string>(),
                    completedOrdersCount: new Set<string>(),
                    cancelledOrdersCount: new Set<string>(),
                    unitsSold: 0
                };

                stats.revenue += Number(item.priceAtPurchase) * item.quantity;
                stats.ordersCount.add(orderIdStr);
                if (isCompleted) stats.completedOrdersCount.add(orderIdStr);
                if (isCancelled) stats.cancelledOrdersCount.add(orderIdStr);
                stats.unitsSold += item.quantity;
                aggregationMap.set(key, stats);
            }
        }

        // 3. Upsert into DailyPerformanceStats
        const dbDate = startDate;

        for (const [key, stats] of aggregationMap.entries()) {
            const [sellerIdHex, catIdStr] = key.split('-');
            const sellerId = Buffer.from(sellerIdHex, 'hex');
            const categoryId = parseInt(catIdStr);

            await (this.prisma as any).dailyPerformanceStats.upsert({
                where: {
                    uq_daily_stats: {
                        date: dbDate,
                        sellerId,
                        categoryId
                    }
                },
                update: {
                    revenue: stats.revenue,
                    ordersCount: stats.ordersCount.size,
                    completedOrdersCount: stats.completedOrdersCount.size,
                    cancelledOrdersCount: stats.cancelledOrdersCount.size,
                    unitsSold: stats.unitsSold
                },
                create: {
                    date: dbDate,
                    sellerId,
                    categoryId,
                    revenue: stats.revenue,
                    ordersCount: stats.ordersCount.size,
                    completedOrdersCount: stats.completedOrdersCount.size,
                    cancelledOrdersCount: stats.cancelledOrdersCount.size,
                    unitsSold: stats.unitsSold
                }
            });
        }

        this.logger.log(`Aggregated ${orders.length} orders for ${startDate.toDateString()} into ${aggregationMap.size} stats entries.`);
    }
}
