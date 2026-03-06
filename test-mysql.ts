import * as mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';

dotenv.config();

async function testConnection() {
    const url = process.env.DATABASE_URL;
    console.log('Testing DATABASE_URL:', url);

    try {
        // Try connecting with the URL
        const connection = await mysql.createConnection(url!);
        console.log('Successfully connected to database using URL');

        const [rows]: [any[], any] = await connection.query('SELECT COUNT(*) as count FROM products');
        console.log('Product count:', rows[0].count);

        await connection.end();
    } catch (error: any) {
        console.error('Failed to connect using URL:', error.message);

        // Try connecting with 127.0.0.1 instead of localhost if it was localhost
        if (url?.includes('localhost')) {
            const fallbackUrl = url.replace('localhost', '127.0.0.1');
            console.log('Attempting fallback to 127.0.0.1:', fallbackUrl);
            try {
                const connection = await mysql.createConnection(fallbackUrl);
                console.log('Successfully connected using 127.0.0.1');
                await connection.end();
                console.log('SUGGESTION: Replace "localhost" with "127.0.0.1" in DATABASE_URL');
            } catch (fallbackError: any) {
                console.error('Failed to connect using 127.0.0.1:', fallbackError.message);
            }
        }
    }
}

testConnection();
