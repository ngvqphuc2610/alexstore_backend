import { Injectable, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { uuidToBuffer, bufferToUuid, generateUuidV7 } from '../common/helpers/uuid.helper';

@Injectable()
export class FollowsService {
    constructor(private prisma: PrismaService) {}

    async follow(buyerIdStr: string, sellerIdStr: string) {
        if (buyerIdStr === sellerIdStr) {
            throw new BadRequestException('You cannot follow yourself');
        }

        const buyerId = uuidToBuffer(buyerIdStr);
        const sellerId = uuidToBuffer(sellerIdStr);

        // Verify seller exists
        const seller = await this.prisma.user.findFirst({
            where: { id: sellerId, role: 'SELLER', isDeleted: false }
        });
        if (!seller) throw new NotFoundException('Seller not found');

        try {
            return await this.prisma.follow.create({
                data: {
                    id: generateUuidV7(),
                    buyerId,
                    sellerId,
                },
            });
        } catch (error) {
            if (error.code === 'P2002') {
                throw new ConflictException('You are already following this seller');
            }
            throw error;
        }
    }

    async unfollow(buyerIdStr: string, sellerIdStr: string) {
        const buyerId = uuidToBuffer(buyerIdStr);
        const sellerId = uuidToBuffer(sellerIdStr);

        const follow = await this.prisma.follow.findUnique({
            where: {
                uq_follow_buyer_seller: {
                    buyerId,
                    sellerId,
                },
            },
        });

        if (!follow) throw new NotFoundException('Follow record not found');

        return this.prisma.follow.delete({
            where: { id: follow.id },
        });
    }

    async getFollowing(buyerIdStr: string) {
        const buyerId = uuidToBuffer(buyerIdStr);
        const follows = await this.prisma.follow.findMany({
            where: { buyerId },
            include: {
                seller: {
                    select: {
                        id: true,
                        username: true,
                        sellerProfile: {
                            select: {
                                shopName: true,
                                sellerType: true,
                                shopRating: true,
                            },
                        },
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        const results = await Promise.all(follows.map(async (f) => {
            const reviewStats = await this.prisma.review.aggregate({
                where: {
                    product: {
                        sellerId: f.seller.id,
                        isDeleted: false,
                    },
                },
                _avg: { rating: true },
            });
            const avgRating = reviewStats._avg.rating || 0;

            return {
                id: bufferToUuid(f.id),
                createdAt: f.createdAt,
                seller: {
                    id: bufferToUuid(f.seller.id),
                    username: f.seller.username,
                    shopName: f.seller.sellerProfile?.shopName,
                    sellerType: f.seller.sellerProfile?.sellerType,
                    shopRating: Number(avgRating),
                },
            };
        }));

        return results;
    }

    async getFollowers(sellerIdStr: string) {
        const sellerId = uuidToBuffer(sellerIdStr);
        const followers = await this.prisma.follow.findMany({
            where: { sellerId },
            include: {
                buyer: {
                    select: {
                        id: true,
                        username: true,
                        email: true,
                        createdAt: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        return followers.map(f => ({
            id: bufferToUuid(f.id),
            createdAt: f.createdAt,
            buyer: {
                id: bufferToUuid(f.buyer.id),
                username: f.buyer.username,
                email: f.buyer.email,
                joinedAt: f.buyer.createdAt,
            },
        }));
    }

    async getStatus(buyerIdStr: string, sellerIdStr: string) {
        const buyerId = uuidToBuffer(buyerIdStr);
        const sellerId = uuidToBuffer(sellerIdStr);

        const follow = await this.prisma.follow.findUnique({
            where: {
                uq_follow_buyer_seller: {
                    buyerId,
                    sellerId,
                },
            },
        });

        return { isFollowing: !!follow };
    }

    async getFollowerCount(sellerIdStr: string) {
        const sellerId = uuidToBuffer(sellerIdStr);
        return this.prisma.follow.count({
            where: { sellerId },
        });
    }

    async getFollowingCount(buyerIdStr: string) {
        const buyerId = uuidToBuffer(buyerIdStr);
        return this.prisma.follow.count({
            where: { buyerId },
        });
    }
}
