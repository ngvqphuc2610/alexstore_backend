import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

console.log('DATABASE_URL:', process.env.DATABASE_URL);

async function test() {
    try {
        const prisma = new PrismaClient({
            log: ['query', 'info', 'warn', 'error'],
        });
        console.log('PrismaClient created successfully');
        await prisma.$connect();
        console.log('PrismaClient connected successfully');
        await prisma.$disconnect();
    } catch (error) {
        console.error('Error initializing PrismaClient:', error);
    }
}

test();
