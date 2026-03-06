import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '.env') });

async function main() {
    const url = process.env.DATABASE_URL || '';
    console.log("Connecting to:", url);

    try {
        const connection = await mysql.createConnection(url);
        const [rows] = await connection.execute('SHOW TABLES');
        console.log("Tables found:", JSON.stringify(rows, null, 2));
        await connection.end();
    } catch (e) {
        console.error("Connection failed", e);
    }
}

main();
