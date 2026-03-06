import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '.env') });

async function main() {
    const connection = await mysql.createConnection(process.env.DATABASE_URL!);

    console.log('--- 5 Records from daily_performance_stats ---');
    const [statsRows]: any = await connection.query('SELECT HEX(seller_id) as sid_hex FROM daily_performance_stats LIMIT 5');
    console.log(statsRows);

    console.log('\n--- Sellers from users table ---');
    const [userRows]: any = await connection.query("SELECT username, HEX(id) as id_hex FROM users WHERE role = 'SELLER'");
    console.log(userRows);

    await connection.end();
}

main().catch(console.error);
