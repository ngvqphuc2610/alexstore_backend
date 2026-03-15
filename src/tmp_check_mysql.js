
const mysql = require('mysql2/promise');
require('dotenv').config();

async function main() {
    const connection = await mysql.createConnection({
        host: '127.0.0.1',
        port: 3307,
        user: 'root',
        password: '123456',
        database: 'alexstore_db'
    });

    try {
        const [rows] = await connection.execute('SELECT COUNT(*) as pending_count FROM seller_profiles WHERE verification_status = "PENDING"');
        console.log('Results from mysql2:');
        console.log(rows[0]);

        const [users] = await connection.execute(`
            SELECT u.username, u.email, sp.shop_name, sp.verification_status 
            FROM users u 
            JOIN seller_profiles sp ON u.id = sp.user_id 
            WHERE sp.verification_status = "PENDING"
        `);
        console.log('Pending users:');
        console.log(users);
    } catch (err) {
        console.error(err);
    } finally {
        await connection.end();
    }
}

main();
