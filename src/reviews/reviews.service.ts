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

        // Verify buyer purchased the product
        const purchased = await this.prisma.orderItem.findFirst({
            where: {
                productId,
                order: {
                    buyerId,
                    status: { in: ['DELIVERED', 'PAID', 'SHIPPING'] },
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
}
