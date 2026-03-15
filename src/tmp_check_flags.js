
const mysql = require('mysql2/promise');

async function main() {
    const connection = await mysql.createConnection({
        host: '127.0.0.1',
        port: 3307,
        user: 'root',
        password: '123456',
        database: 'alexstore_db'
    });

    try {
        const [rows] = await connection.execute('SELECT u.username, u.is_deleted, u.status, sp.verification_status FROM users u JOIN seller_profiles sp ON u.id = sp.user_id WHERE sp.verification_status = "PENDING"');
        console.log(rows);
    } catch (err) {
        console.error(err);
    } finally {
        await connection.end();
    }
}

main();
