import { PrismaClient } from '@prisma/client';
import { startOfDay, subDays } from 'date-fns';

const prisma = new PrismaClient();

async function aggregateDate(date: Date) {
    const startDate = startOfDay(date);
    const endDate = new Date(startDate);
    endDate.setHours(23, 59, 59, 999);

    console.log(`Aggregating data for ${startDate.toISOString()}...`);

    // 1. Fetch all non-cancelled orders for this date
    const orders = await prisma.order.findMany({
        where: {
            createdAt: { gte: startDate, lte: endDate },
            isDeleted: false,
            // We want to capture all states, but completed/cancelled separately
        },
        include: {
            orderItems: {
                include: { product: true }
            }
        }
    });

    if (orders.length === 0) {
        console.log(`No orders found for ${startDate.toDateString()}.`);
        return;
    }

    // 2. Aggregate logic
    const aggregationMap = new Map<string, {
        revenue: number,
        ordersCount: Set<string>,
        completedOrdersCount: Set<string>,
        cancelledOrdersCount: Set<string>,
        unitsSold: number
    }>();

    for (const order of orders) {
        const orderIdStr = (order.id as any).toString('hex');
        const isCompleted = order.status === 'DELIVERED';
        const isCancelled = order.status === 'CANCELLED';

        for (const item of order.orderItems) {
            const sellerId = (item.product as any).sellerId || (item.product as any).seller_id;
            if (!sellerId) {
                console.log(`[WARN] No sellerId for product in Order ${orderIdStr}, item id ${item.id}`);
                continue;
            }
            const sellerIdStr = Buffer.from(sellerId).toString('hex');
            const catId = item.product.categoryId;
            const key = `${sellerIdStr}-${catId}`;

            console.log(`[DEBUG] Order ${orderIdStr}: Product ${item.product.name}, Seller ${sellerIdStr}, Rev ${Number(item.priceAtPurchase) * item.quantity}`);

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
    for (const [key, stats] of aggregationMap.entries()) {
        const [sellerIdHex, catIdStr] = key.split('-');
        const sellerId = Buffer.from(sellerIdHex, 'hex');
        const categoryId = parseInt(catIdStr);

        await (prisma as any).dailyPerformanceStats.upsert({
            where: {
                uq_daily_stats: {
                    date: startDate,
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
                date: startDate,
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
    console.log(`Stats updated for ${startDate.toDateString()}.`);
}

async function main() {
    console.log("Checking DB Connection...");
    try {
        await prisma.$connect();
        console.log("Connected Successfully.");

        // Aggregate last 30 days
        for (let i = 0; i < 30; i++) {
            await aggregateDate(subDays(new Date(), i));
        }

        console.log("Aggregation done!");
    } catch (e) {
        console.error("Aggregation failed!", e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
