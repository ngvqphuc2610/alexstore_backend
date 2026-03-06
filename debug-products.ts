import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '.env') });

async function main() {
    const connection = await mysql.createConnection(process.env.DATABASE_URL!);

    console.log('--- 5 Products from database ---');
    const [rows]: any = await connection.query('SELECT name, HEX(seller_id) as seller_hex FROM products LIMIT 5');
    console.log(rows);

    await connection.end();
}

main().catch(console.error);
