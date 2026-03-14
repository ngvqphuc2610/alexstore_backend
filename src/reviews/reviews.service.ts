import {
    Injectable,
    NotFoundException,
    BadRequestException,
    ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReviewDto } from './dto/review.dto';
import { uuidToBuffer, bufferToUuid } from '../common/helpers/uuid.helper';

@Injectable()
export class ReviewsService {
    constructor(private prisma: PrismaService) { }

    /**
     * Submit a review inside a Prisma transaction:
     * 1. Verify buyer purchased the product
     * 2. Insert review
     * 3. Recalculate avg_rating and review_count
     * 4. Update product (all in same transaction)
     */
    async submitReview(buyerIdStr: string, dto: CreateReviewDto) {
        const buyerId = uuidToBuffer(buyerIdStr);
        const productId = uuidToBuffer(dto.productId);

        // Verify buyer purchased the product and order is completed
        const purchased = await this.prisma.orderItem.findFirst({
            where: {
                productId,
                order: {
                    buyerId,
                    status: 'DELIVERED',
                    isDeleted: false,
                },
            },
        });

        if (!purchased) {
            throw new BadRequestException(
                'You can only review products you have purchased',
            );
        }

        // Check product exists
        const product = await this.prisma.product.findFirst({
            where: { id: productId, isDeleted: false },
        });
        if (!product) throw new NotFoundException('Product not found');

        const result = await this.prisma.$transaction(async (tx) => {
            // ─── Step 1: insert review ─────────────────────────────────────────
            const existing = await tx.review.findUnique({
                where: {
                    uq_review_user_product: { buyerId, productId },
                },
            });

            if (existing) {
                throw new ConflictException('You have already reviewed this product');
            }

            const review = await tx.review.create({
                data: {
                    productId,
                    buyerId,
                    rating: dto.rating,
                    comment: dto.comment,
                },
            });

            // ─── Step 2: recalculate stats ─────────────────────────────────────
            const stats = await tx.review.aggregate({
                where: { productId },
                _avg: { rating: true },
                _count: { id: true },
            });

            const avgRating = stats._avg.rating ?? 0;
            const reviewCount = stats._count.id;

            // ─── Step 3: update product ────────────────────────────────────────
            await tx.product.update({
                where: { id: productId },
                data: {
                    avgRating: Math.round(avgRating * 100) / 100,
                    reviewCount,
                },
            });

            return review;
        });

        return {
            id: Number(result.id),
            productId: dto.productId,
            buyerId: buyerIdStr,
            rating: result.rating,
            comment: result.comment,
            createdAt: result.createdAt,
        };
    }

    async findByProduct(productIdStr: string, page = 1, limit = 20) {
        const productId = uuidToBuffer(productIdStr);
        const skip = (page - 1) * limit;

        const [items, total] = await Promise.all([
            this.prisma.review.findMany({
                where: { productId },
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: { buyer: { select: { username: true } } },
            }),
            this.prisma.review.count({ where: { productId } }),
        ]);

        return {
            data: items.map((r) => ({
                id: Number(r.id),
                rating: r.rating,
                comment: r.comment,
                createdAt: r.createdAt,
                buyer: r.buyer.username,
            })),
            meta: { total, page, limit },
        };
    }

    /**
     * Admin: list ALL reviews with product name and buyer info.
     */
    async findAll(
        page = 1,
        limit = 20,
        search?: string,
        sortBy: string = 'newest',
    ) {
        const skip = (page - 1) * limit;

        const where: any = {};
        if (search) {
            where.OR = [
                { product: { name: { contains: search } } },
                { buyer: { username: { contains: search } } },
            ];
        }

        // Determine orderBy
        let orderBy: any = { createdAt: 'desc' };
        switch (sortBy) {
            case 'oldest':
                orderBy = { createdAt: 'asc' };
                break;
            case 'rating_high':
                orderBy = { rating: 'desc' };
                break;
            case 'rating_low':
                orderBy = { rating: 'asc' };
                break;
            default:
                orderBy = { createdAt: 'desc' };
        }

        const [items, total] = await Promise.all([
            this.prisma.review.findMany({
                where,
                skip,
                take: limit,
                orderBy,
                include: {
                    product: { select: { name: true } },
                    buyer: { select: { username: true } },
                },
            }),
            this.prisma.review.count({ where }),
        ]);

        // Calculate overall stats
        const stats = await this.prisma.review.aggregate({
            _avg: { rating: true },
            _count: { id: true },
        });

        const positiveCount = await this.prisma.review.count({
            where: { rating: { gte: 4 } },
        });

        return {
            data: items.map((r) => ({
                id: Number(r.id),
                productName: r.product.name,
                buyer: r.buyer.username,
                rating: r.rating,
                comment: r.comment,
                createdAt: r.createdAt,
            })),
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
            stats: {
                totalReviews: stats._count.id,
                avgRating: Math.round((stats._avg.rating ?? 0) * 10) / 10,
                positiveCount,
            },
        };
    }

    /**
     * Admin: delete a review and recalculate product stats.
     */
    async deleteReview(reviewId: number) {
        const review = await this.prisma.review.findUnique({
            where: { id: reviewId },
        });
        if (!review) throw new NotFoundException('Review not found');

        await this.prisma.$transaction(async (tx) => {
            // Delete the review
            await tx.review.delete({ where: { id: reviewId } });

            // Recalculate product stats
            const stats = await tx.review.aggregate({
                where: { productId: review.productId },
                _avg: { rating: true },
                _count: { id: true },
            });

            await tx.product.update({
                where: { id: review.productId },
                data: {
                    avgRating: Math.round((stats._avg.rating ?? 0) * 100) / 100,
                    reviewCount: stats._count.id,
                },
            });
        });

        return { message: 'Review deleted successfully' };
    }
}
