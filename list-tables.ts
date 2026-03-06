import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    try {
        const tables: any[] = await prisma.$queryRaw`SHOW TABLES`;
        console.log("Tables in database:", tables);
    } catch (e) {
        console.error("Failed to list tables", e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
