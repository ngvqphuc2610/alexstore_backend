
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const pendingCount = await prisma.sellerProfile.count({
    where: {
      verificationStatus: 'PENDING'
    }
  });
  console.log('Total PENDING seller profiles:', pendingCount);

  const pendingUsersCount = await prisma.user.count({
    where: {
      isDeleted: false,
      sellerProfile: {
        verificationStatus: 'PENDING'
      }
    }
  });
  console.log('Total Users with PENDING seller profiles:', pendingUsersCount);
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
