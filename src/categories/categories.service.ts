import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
    constructor(private prisma: PrismaService) { }

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
        const where: any = {};

        if (sellerType) {
            where.allowedSellerTypes = {
                some: { sellerType: sellerType }
            };
        }

        return (this.prisma.category as any).findMany({
            where,
            include: {
                allowedSellerTypes: true,
                _count: {
                    select: { products: true }
                }
            },
            orderBy: { name: 'asc' },
        });
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
        return (this.prisma.category as any).create({
            data: {
                ...rest,
                allowedSellerTypes: allowedSellerTypes ? {
                    create: allowedSellerTypes.map(type => ({ sellerType: type }))
                } : undefined
            },
            include: { allowedSellerTypes: true }
        });
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

        return (this.prisma.category as any).update({
            where: { id },
            data: {
                ...rest,
                allowedSellerTypes: allowedSellerTypes ? {
                    create: allowedSellerTypes.map(type => ({ sellerType: type }))
                } : undefined
            },
            include: { allowedSellerTypes: true }
        });
    }

    async remove(id: number) {
        await this.findOne(id);
        await this.prisma.category.delete({ where: { id } });
        return { message: 'Category deleted' };
    }
}
