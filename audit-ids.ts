import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '.env') });

async function main() {
    const connection = await mysql.createConnection(process.env.DATABASE_URL!);

    console.log('--- Unique seller_id from products ---');
    const [rows]: any = await connection.query('SELECT DISTINCT HEX(seller_id) as seller_hex FROM products');
    console.log(rows);

    console.log('\n--- All records from daily_performance_stats ---');
    const [statsRows]: any = await connection.query('SELECT date, HEX(seller_id) as sid_hex, category_id, revenue FROM daily_performance_stats');
    console.log(statsRows);

    await connection.end();
}

main().catch(console.error);
