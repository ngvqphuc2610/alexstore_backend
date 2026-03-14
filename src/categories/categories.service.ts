import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

const CATEGORIES_CACHE_KEY = 'cache:categories:all';
const CATEGORIES_CACHE_TTL = 60 * 60; // 1 hour

@Injectable()
export class CategoriesService {
    constructor(
        private prisma: PrismaService,
        private redisService: RedisService,
    ) { }

    async findAllForUser(userId: string, role: string) {
        if (role !== 'SELLER') return this.findAll();

        const userIdBuffer = Buffer.from(userId.replace(/-/g, ''), 'hex');

        const sellerProfile = await this.prisma.sellerProfile.findUnique({
            where: { userId: userIdBuffer }
        });

        if (!sellerProfile) return this.findAll();

        return this.findAll(sellerProfile.sellerType);
    }

    async findAll(sellerType?: string) {
        // Only cache the full list (no sellerType filter)
        if (!sellerType) {
            const cached = await this.redisService.getJSON(CATEGORIES_CACHE_KEY);
            if (cached) return cached;
        }

        const where: any = {};

        if (sellerType) {
            where.allowedSellerTypes = {
                some: { sellerType: sellerType }
            };
        }

        const categories = await (this.prisma.category as any).findMany({
            where,
            include: {
                allowedSellerTypes: true,
                _count: {
                    select: { products: true }
                }
            },
            orderBy: { name: 'asc' },
        });

        // Cache the full list only
        if (!sellerType) {
            await this.redisService.setJSON(CATEGORIES_CACHE_KEY, categories, CATEGORIES_CACHE_TTL);
        }

        return categories;
    }

    async findOne(id: number) {
        const cat = await this.prisma.category.findUnique({
            where: { id },
            include: { children: true },
        });
        if (!cat) throw new NotFoundException('Category not found');
        return cat;
    }

    async create(dto: CreateCategoryDto) {
        const { allowedSellerTypes, ...rest } = dto;
        const result = await (this.prisma.category as any).create({
            data: {
                ...rest,
                allowedSellerTypes: allowedSellerTypes ? {
                    create: allowedSellerTypes.map(type => ({ sellerType: type }))
                } : undefined
            },
            include: { allowedSellerTypes: true }
        });

        // Invalidate cache when categories change
        await this.redisService.del(CATEGORIES_CACHE_KEY);
        return result;
    }

    async update(id: number, dto: UpdateCategoryDto) {
        const { allowedSellerTypes, ...rest } = dto;
        await this.findOne(id);

        // Update allowedSellerTypes if provided
        if (allowedSellerTypes) {
            await (this.prisma as any).categoryAllowedSellerType.deleteMany({
                where: { categoryId: id }
            });
        }

        const result = await (this.prisma.category as any).update({
            where: { id },
            data: {
                ...rest,
                allowedSellerTypes: allowedSellerTypes ? {
                    create: allowedSellerTypes.map(type => ({ sellerType: type }))
                } : undefined
            },
            include: { allowedSellerTypes: true }
        });

        // Invalidate cache when categories change
        await this.redisService.del(CATEGORIES_CACHE_KEY);
        return result;
    }

    async remove(id: number) {
        await this.findOne(id);
        await this.prisma.category.delete({ where: { id } });

        // Invalidate cache when categories change
        await this.redisService.del(CATEGORIES_CACHE_KEY);
        return { message: 'Category deleted' };
    }
}
