import { PrismaClient, SellerType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Seeding categories with role permissions...');

    try {
        // 1. Clear existing role mappings for fresh start
        await (prisma as any).categoryAllowedSellerType.deleteMany({});

        const categories = await prisma.category.findMany();

        if (categories.length === 0) {
            console.log('No categories found. Please run main seed first.');
            return;
        }

        for (const cat of categories) {
            const catName = cat.name.toLowerCase();
            const isStandardSafe = catName.includes('điện tử') ||
                catName.includes('phụ kiện') ||
                catName.includes('electronics') ||
                catName.includes('accessories');

            if (isStandardSafe) {
                // Standard can see these
                await (prisma as any).categoryAllowedSellerType.create({
                    data: {
                        categoryId: cat.id,
                        sellerType: SellerType.STANDARD
                    }
                });
            }

            // Mall and Pro can see everything
            await (prisma as any).categoryAllowedSellerType.create({
                data: {
                    categoryId: cat.id,
                    sellerType: SellerType.MALL
                }
            });
            await (prisma as any).categoryAllowedSellerType.create({
                data: {
                    categoryId: cat.id,
                    sellerType: SellerType.PRO
                }
            });

            console.log(`Updated permissions for category: ${cat.name}`);
        }

        console.log('Seeding completed successfully!');
    } catch (error) {
        console.error('Error during seeding:');
        console.dir(error, { depth: null });
        throw error;
    }
}

main()
    .catch((e) => {
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
