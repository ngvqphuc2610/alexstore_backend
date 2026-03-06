import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- Daily Performance Stats Sellers ---');
    const stats = await (prisma as any).dailyPerformanceStats.findMany({
        take: 5,
        select: { sellerId: true }
    });

    for (const s of stats) {
        const sidHex = Buffer.from(s.sellerId).toString('hex');
        console.log(`Stat sellerId (hex): ${sidHex}`);

        const user = await prisma.user.findUnique({
            where: { id: s.sellerId },
            select: { username: true, id: true }
        });

        if (user) {
            console.log(`Found User: ${user.username} (ID hex: ${Buffer.from(user.id).toString('hex')})`);
        } else {
            console.log('User NOT found for this sellerId!');
        }
    }

    console.log('\n--- All Sellers in Users Table ---');
    const sellers = await prisma.user.findMany({
        where: { role: 'SELLER' },
        select: { id: true, username: true }
    });
    for (const seller of sellers) {
        console.log(`Seller: ${seller.username}, ID (hex): ${Buffer.from(seller.id).toString('hex')}`);
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
