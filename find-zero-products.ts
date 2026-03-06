import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '.env') });

async function main() {
    const connection = await mysql.createConnection(process.env.DATABASE_URL!);

    console.log('--- Products with zero seller_id ---');
    const [rows]: any = await connection.query("SELECT id, name, HEX(seller_id) as seller_hex FROM products WHERE seller_id = UNHEX('00000000000000000000000000000000')");
    console.log(rows);

    console.log('\n--- Count of products per seller_id ---');
    const [counts]: any = await connection.query("SELECT HEX(seller_id) as seller_hex, COUNT(*) as count FROM products GROUP BY seller_id");
    console.log(counts);

    await connection.end();
}

main().catch(console.error);
