import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '.env') });

async function main() {
    const connection = await mysql.createConnection(process.env.DATABASE_URL!);

    console.log('--- Cleaning Stale Stats ---');
    await connection.query('DELETE FROM daily_performance_stats');
    console.log('Truncated daily_performance_stats.');

    console.log('--- Fetching Orders and Items ---');
    const [orders]: any = await connection.query(`
        SELECT 
            oi.id as item_id,
            oi.order_id,
            oi.product_id,
            oi.quantity,
            oi.price_at_purchase,
            o.created_at,
            o.status,
            p.category_id,
            p.seller_id
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        JOIN products p ON oi.product_id = p.id
        WHERE o.is_deleted = 0 AND o.status != 'CANCELLED'
    `);

    console.log(`Found ${orders.length} items to aggregate.`);

    const agg = new Map<string, {
        revenue: number,
        orders: Set<string>,
        completed: Set<string>,
        units: number
    }>();

    for (const item of orders) {
        const date = item.created_at.toISOString().split('T')[0];
        const sellerHex = item.seller_id.toString('hex');
        const catId = item.category_id;
        const key = `${date}|${sellerHex}|${catId}`;

        const data = agg.get(key) || {
            revenue: 0,
            orders: new Set(),
            completed: new Set(),
            units: 0
        };

        const orderIdHex = item.order_id.toString('hex');
        data.revenue += Number(item.price_at_purchase) * item.quantity;
        data.orders.add(orderIdHex);
        if (item.status === 'DELIVERED') {
            data.completed.add(orderIdHex);
        }
        data.units += item.quantity;
        agg.set(key, data);
    }

    console.log(`Aggregated into ${agg.size} daily stats rows.`);

    for (const [key, data] of agg.entries()) {
        const [date, sellerHex, catId] = key.split('|');
        const sellerId = Buffer.from(sellerHex, 'hex');

        console.log(`Inserting stat for ${date}, Seller ${sellerHex}, Rev ${data.revenue}`);

        await connection.query(`
            INSERT INTO daily_performance_stats 
            (date, seller_id, category_id, revenue, orders_count, completed_orders_count, cancelled_orders_count, units_sold)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE 
                revenue = VALUES(revenue),
                orders_count = VALUES(orders_count),
                completed_orders_count = VALUES(completed_orders_count),
                units_sold = VALUES(units_sold)
        `, [
            date,
            sellerId,
            parseInt(catId),
            data.revenue,
            data.orders.size,
            data.completed.size,
            0, // Simplified cancelled
            data.units
        ]);
    }

    console.log('--- Aggregation Complete ---');
    await connection.end();
}

main().catch(console.error);
