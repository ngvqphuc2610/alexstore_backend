import * as mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';

dotenv.config();

async function checkStatuses() {
    const connection = await mysql.createConnection(process.env.DATABASE_URL!);
    const [rows]: [any[], any] = await connection.query(
        'SELECT status, COUNT(*) as count FROM products GROUP BY status'
    );
    console.log('Product statuses:', rows);
    await connection.end();
}

checkStatuses();
