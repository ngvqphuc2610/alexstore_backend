import {
    Injectable,
    NotFoundException,
    ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
    CreateProductDto,
    UpdateProductDto,
    UpdateProductStatusDto,
} from './dto/product.dto';
import {
    generateUuidV7,
    bufferToUuid,
    uuidToBuffer,
} from '../common/helpers/uuid.helper';
import { ProductStatus, Role } from '@prisma/client';

@Injectable()
export class ProductsService {
    constructor(private prisma: PrismaService) { }

    private serializeProduct(p: any) {
        return {
            ...p,
            id: bufferToUuid(p.id),
            sellerId: bufferToUuid(p.sellerId),
            price: Number(p.price),
            avgRating: Number(p.avgRating),
        };
    }

    async findAll(query: {
        categoryId?: number;
        status?: ProductStatus;
        sellerId?: string;
        page?: number;
        limit?: number;
    }) {
        const page = query.page ?? 1;
        const limit = query.limit ?? 20;
        const skip = (page - 1) * limit;

        const where: any = { isDeleted: false };
        if (query.categoryId) where.categoryId = query.categoryId;
        if (query.status) where.status = query.status;
        else where.status = ProductStatus.APPROVED; // public default
        if (query.sellerId) where.sellerId = uuidToBuffer(query.sellerId);

        const [items, total] = await Promise.all([
            this.prisma.product.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: {
                    images: { where: { isPrimary: true }, take: 1 },
                    category: true,
                },
            }),
            this.prisma.product.count({ where }),
        ]);

        return {
            data: items.map((p) => this.serializeProduct(p)),
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        };
    }

    async findOne(idStr: string) {
        const id = uuidToBuffer(idStr);
        const product = await this.prisma.product.findFirst({
            where: { id, isDeleted: false },
            include: { images: true, category: true, reviews: { take: 10 } },
        });
        if (!product) throw new NotFoundException('Product not found');
        return this.serializeProduct(product);
    }

    async create(dto: CreateProductDto, sellerIdStr: string) {
        const id = generateUuidV7();
        const sellerId = uuidToBuffer(sellerIdStr);

        const product = await this.prisma.product.create({
            data: {
                id,
                sellerId,
                categoryId: dto.categoryId,
                name: dto.name,
                description: dto.description,
                price: dto.price,
                stockQuantity: dto.stockQuantity,
            },
        });

        return this.serializeProduct(product);
    }

    async update(idStr: string, dto: UpdateProductDto, userId: string, userRole: Role) {
        const id = uuidToBuffer(idStr);
        const product = await this.prisma.product.findFirst({
            where: { id, isDeleted: false },
        });
        if (!product) throw new NotFoundException('Product not found');

        // SELLER can only edit their own products; ADMIN can edit any
        if (
            userRole === Role.SELLER &&
            bufferToUuid(product.sellerId) !== userId
        ) {
            throw new ForbiddenException('Cannot update another seller\'s product');
        }

        const updated = await this.prisma.product.update({
            where: { id },
            data: {
                ...(dto.categoryId && { categoryId: dto.categoryId }),
                ...(dto.name && { name: dto.name }),
                ...(dto.description !== undefined && { description: dto.description }),
                ...(dto.price !== undefined && { price: dto.price }),
                ...(dto.stockQuantity !== undefined && {
                    stockQuantity: dto.stockQuantity,
                }),
            },
        });

        return this.serializeProduct(updated);
    }

    async updateStatus(idStr: string, dto: UpdateProductStatusDto) {
        const id = uuidToBuffer(idStr);
        const product = await this.prisma.product.findFirst({
            where: { id, isDeleted: false },
        });
        if (!product) throw new NotFoundException('Product not found');

        const updated = await this.prisma.product.update({
            where: { id },
            data: { status: dto.status },
        });

        return this.serializeProduct(updated);
    }

    async softDelete(idStr: string, userId: string, userRole: Role) {
        const id = uuidToBuffer(idStr);
        const product = await this.prisma.product.findFirst({
            where: { id, isDeleted: false },
        });
        if (!product) throw new NotFoundException('Product not found');

        if (
            userRole === Role.SELLER &&
            bufferToUuid(product.sellerId) !== userId
        ) {
            throw new ForbiddenException('Cannot delete another seller\'s product');
        }

        await this.prisma.product.update({
            where: { id },
            data: { isDeleted: true },
        });

        return { message: 'Product deleted' };
    }
}
