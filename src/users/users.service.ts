import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { RegisterSellerDto } from './dto/register-seller.dto';
import { UpdateSellerProfileDto } from './dto/update-seller-profile.dto';
import { bufferToUuid, uuidToBuffer, generateUuidV7 } from '../common/helpers/uuid.helper';
import * as bcrypt from 'bcrypt';
import { Role, UserStatus, SellerVerificationStatus } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class UsersService {
    constructor(
        private prisma: PrismaService,
        private eventEmitter: EventEmitter2
    ) { }

    async findAll(
        page: number = 1,
        limit: number = 20,
        role?: string,
        status?: string,
        keyword?: string,
    ) {
        const skip = (page - 1) * limit;

        const where: any = {};

        // Filter by role
        if (role && role !== 'all') {
            where.role = role as Role;
        }

        // Filter by status
        if (status && status !== 'all') {
            where.status = status as UserStatus;
        } else {
            // By default, exclude DELETED users
            where.status = { not: UserStatus.DELETED };
        }

        // Filter by keyword (username or email)
        if (keyword) {
            where.OR = [
                { username: { contains: keyword } },
                { email: { contains: keyword } },
            ];
        }

        const [total, users] = await Promise.all([
            this.prisma.user.count({ where }),
            this.prisma.user.findMany({
                where,
                include: {
                    buyerProfile: true,
                    sellerProfile: true,
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
        ]);

        return {
            data: users.map(user => {
                const { passwordHash, ...safeUser } = user;
                return {
                    ...safeUser,
                    id: bufferToUuid(user.id),
                    profile: user.role === Role.BUYER ? user.buyerProfile : user.sellerProfile,
                };
            }),
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    async findById(idStr: string) {
        const idBuf = uuidToBuffer(idStr);
        const user = await this.prisma.user.findFirst({
            where: { id: idBuf, isDeleted: false },
            include: {
                buyerProfile: true,
                sellerProfile: true,
            },
        });

        if (!user) throw new NotFoundException('User not found');

        const { passwordHash, ...safeUser } = user;
        return {
            ...safeUser,
            id: bufferToUuid(user.id),
            // Simplify response based on role
            profile: user.role === 'BUYER' ? user.buyerProfile : user.sellerProfile,
        };
    }
    async create(dto: CreateUserDto) {
        // Check uniqueness
        const exists = await this.prisma.user.findFirst({
            where: {
                OR: [{ email: dto.email }, { username: dto.username }],
            },
        });
        if (exists) {
            throw new ConflictException('Email or username already taken');
        }
        const passwordHash = await bcrypt.hash(dto.password, 12);
        const id = generateUuidV7();
        const role = dto.role ?? Role.BUYER;
        const user = await this.prisma.user.create({
            data: {
                id,
                username: dto.username,
                email: dto.email,
                passwordHash,
                role,
                status: UserStatus.ACTIVE,
                ...(role === Role.BUYER
                    ? { buyerProfile: { create: {} } }
                    : role === Role.SELLER
                        ? {
                            sellerProfile: {
                                create: {
                                    shopName: dto.shopName || `${dto.username}'s Shop`,
                                },
                            },
                        }
                        : {}),
            },
            include: {
                buyerProfile: true,
                sellerProfile: true,
            },
        });
        const { passwordHash: _, ...safeUser } = user;
        const serialized = {
            ...safeUser,
            id: bufferToUuid(user.id),
            profile: role === Role.BUYER ? user.buyerProfile : user.sellerProfile,
        };

        this.eventEmitter.emit('user.registered', {
            userId: serialized.id,
            username: serialized.username,
            role: serialized.role
        });

        return serialized;
    }

    async update(idStr: string, dto: UpdateUserDto) {
        const idBuf = uuidToBuffer(idStr);
        const user = await this.prisma.user.findFirst({
            where: { id: idBuf, isDeleted: false },
        });
        if (!user) throw new NotFoundException('User not found');

        const { address, phoneNumber, ...userData } = dto;
        const updateData: any = { ...userData };
        if (address !== undefined) {
            updateData.address = address;
        }
        if (phoneNumber !== undefined) {
            updateData.phoneNumber = phoneNumber;
        }

        const updated = await this.prisma.user.update({
            where: { id: idBuf },
            data: updateData,
            include: {
                buyerProfile: true,
                sellerProfile: true,
            },
        });

        const { passwordHash, ...safeUpdated } = updated;
        return {
            ...safeUpdated,
            id: bufferToUuid(updated.id),
            profile: updated.role === 'BUYER' ? updated.buyerProfile : updated.sellerProfile,
        };
    }

    async softDelete(idStr: string) {
        const idBuf = uuidToBuffer(idStr);
        const user = await this.prisma.user.findFirst({
            where: { id: idBuf, isDeleted: false },
        });
        if (!user) throw new NotFoundException('User not found');

        await this.prisma.user.update({
            where: { id: idBuf },
            data: { isDeleted: true, status: UserStatus.DELETED },
        });

        return { message: 'Account deactivated successfully' };
    }

    async updateSellerProfile(userId: string, dto: UpdateSellerProfileDto) {
        const idBuf = uuidToBuffer(userId);
        const user = await this.prisma.user.findFirst({
            where: { id: idBuf, isDeleted: false },
            include: { sellerProfile: true },
        });

        if (!user) throw new NotFoundException('User not found');
        if (user.role !== Role.SELLER || !user.sellerProfile) {
            throw new BadRequestException('User is not a seller');
        }

        const updatedProfile = await this.prisma.sellerProfile.update({
            where: { userId: idBuf },
            data: {
                shopName: dto.shopName,
                taxCode: dto.taxCode,
                pickupAddress: dto.pickupAddress,
                description: dto.description,
            },
        });

        return {
            message: 'Seller profile updated successfully',
            data: updatedProfile,
        };
    }
    // ─── Email Support ───────────────────────────────────────────────────────────

    async getUserForEmail(userIdStr: string) {
        try {
            const user = await this.prisma.user.findFirst({
                where: { id: uuidToBuffer(userIdStr), isDeleted: false },
                include: { notificationSettings: true }
            });
            return user;
        } catch {
            return null;
        }
    }

    // ─── Ban / Unban ────────────────────────────────────────────────────────────

    async banUser(idStr: string) {
        const idBuf = uuidToBuffer(idStr);
        const user = await this.prisma.user.findFirst({
            where: { id: idBuf, isDeleted: false },
        });
        if (!user) throw new NotFoundException('User not found');
        if (user.status === UserStatus.BANNED) {
            throw new BadRequestException('User is already banned');
        }
        if (user.role === Role.ADMIN) {
            throw new BadRequestException('Cannot ban an admin user');
        }

        await this.prisma.user.update({
            where: { id: idBuf },
            data: { status: UserStatus.BANNED },
        });

        return { message: 'User has been banned' };
    }

    async unbanUser(idStr: string) {
        const idBuf = uuidToBuffer(idStr);
        const user = await this.prisma.user.findFirst({
            where: { id: idBuf },
        });
        if (!user) throw new NotFoundException('User not found');
        if (user.status !== UserStatus.BANNED) {
            throw new BadRequestException('User is not banned');
        }

        await this.prisma.user.update({
            where: { id: idBuf },
            data: { status: UserStatus.ACTIVE },
        });

        return { message: 'User has been unbanned' };
    }

    // ─── Seller Verification ────────────────────────────────────────────────────

    async registerSeller(userId: string, dto: RegisterSellerDto) {
        const idBuf = uuidToBuffer(userId);
        const user = await this.prisma.user.findFirst({
            where: { id: idBuf, isDeleted: false },
            include: { sellerProfile: true },
        });
        if (!user) throw new NotFoundException('User not found');

        // Already a seller
        if (user.role === Role.SELLER) {
            throw new BadRequestException('Bạn đã là người bán rồi');
        }

        // Already has a pending/rejected profile
        if (user.sellerProfile) {
            if (user.sellerProfile.verificationStatus === SellerVerificationStatus.PENDING) {
                throw new BadRequestException('Hồ sơ của bạn đang chờ duyệt. Vui lòng chờ quản trị viên xét duyệt.');
            }
            if (user.sellerProfile.verificationStatus === SellerVerificationStatus.REJECTED) {
                // Allow re-application: update existing profile
                await this.prisma.sellerProfile.update({
                    where: { userId: idBuf },
                    data: {
                        shopName: dto.shopName,
                        taxCode: dto.taxCode ?? null,
                        pickupAddress: dto.pickupAddress ?? null,
                        verificationStatus: SellerVerificationStatus.PENDING,
                    },
                });
                return { message: 'Hồ sơ đã được gửi lại. Vui lòng chờ duyệt.' };
            }
            if (user.sellerProfile.verificationStatus === SellerVerificationStatus.APPROVED) {
                throw new BadRequestException('Bạn đã được duyệt là người bán');
            }
        }

        // Create new seller profile
        await this.prisma.sellerProfile.create({
            data: {
                userId: idBuf,
                shopName: dto.shopName,
                taxCode: dto.taxCode ?? null,
                pickupAddress: dto.pickupAddress ?? null,
                verificationStatus: SellerVerificationStatus.PENDING,
            },
        });

        const serialized = {
            id: userId,
            shopName: dto.shopName,
            taxCode: dto.taxCode,
            pickupAddress: dto.pickupAddress,
        };

        this.eventEmitter.emit('seller.requested', {
            userId: serialized.id,
            shopName: serialized.shopName,
        });

        return { message: 'Hồ sơ đăng ký người bán đã được gửi. Vui lòng chờ duyệt.' };
    }

    async approveSeller(idStr: string) {
        const idBuf = uuidToBuffer(idStr);
        const user = await this.prisma.user.findFirst({
            where: { id: idBuf, isDeleted: false },
            include: { sellerProfile: true },
        });
        if (!user) throw new NotFoundException('User not found');
        if (!user.sellerProfile) throw new NotFoundException('Seller profile not found');
        if (user.sellerProfile.verificationStatus === SellerVerificationStatus.APPROVED) {
            throw new BadRequestException('Seller is already approved');
        }

        // Transaction: approve profile AND change role to SELLER
        await this.prisma.$transaction([
            this.prisma.sellerProfile.update({
                where: { userId: idBuf },
                data: { verificationStatus: SellerVerificationStatus.APPROVED },
            }),
            this.prisma.user.update({
                where: { id: idBuf },
                data: { role: Role.SELLER },
            }),
        ]);

        this.eventEmitter.emit('seller.approved', {
            userId: idStr,
            shopName: user.sellerProfile.shopName,
            username: user.username,
        });

        return { message: 'Seller has been approved' };
    }

    async rejectSeller(idStr: string) {
        const idBuf = uuidToBuffer(idStr);
        const user = await this.prisma.user.findFirst({
            where: { id: idBuf, isDeleted: false },
            include: { sellerProfile: true },
        });
        if (!user) throw new NotFoundException('User not found');
        if (!user.sellerProfile) throw new NotFoundException('Seller profile not found');
        if (user.sellerProfile.verificationStatus === SellerVerificationStatus.REJECTED) {
            throw new BadRequestException('Seller is already rejected');
        }

        // Reject: update profile status, keep role as BUYER
        await this.prisma.sellerProfile.update({
            where: { userId: idBuf },
            data: { verificationStatus: SellerVerificationStatus.REJECTED },
        });

        this.eventEmitter.emit('seller.rejected', {
            userId: idStr,
            shopName: user.sellerProfile.shopName,
            username: user.username,
        });

        return { message: 'Seller has been rejected' };
    }

    async findPendingSellers(page = 1, limit = 20) {
        const skip = (page - 1) * limit;

        // DEBUG COUNTS
        const [allProfiles, pendingOnly, filtered] = await Promise.all([
            this.prisma.sellerProfile.count(),
            this.prisma.sellerProfile.count({ where: { verificationStatus: SellerVerificationStatus.PENDING } }),
            this.prisma.sellerProfile.count({ 
                where: { 
                    verificationStatus: SellerVerificationStatus.PENDING,
                    user: { isDeleted: false }
                } 
            }),
        ]);

        // DEBUG COUNTS TO FILE (Use absolute path to be sure)
        const fs = require('fs');
        const path = require('path');
        const logFile = path.resolve(process.cwd(), 'debug_db.log');
        const logMsg = `[${new Date().toISOString()}] findPendingSellers Counts: all=${allProfiles}, pending=${pendingOnly}, filtered=${filtered}\n`;
        fs.appendFileSync(logFile, logMsg);

        const where = {
            verificationStatus: SellerVerificationStatus.PENDING,
            user: {
                isDeleted: false,
            },
        };

        const [total, profiles] = await Promise.all([
            this.prisma.sellerProfile.count({ where }),
            this.prisma.sellerProfile.findMany({
                where,
                include: { user: true },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
        ]);

        return {
            data: profiles.map(profile => {
                const { passwordHash, ...safeUser } = profile.user;
                return {
                    ...safeUser,
                    id: bufferToUuid(profile.user.id),
                    sellerProfile: profile,
                };
            }),
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        };
    }

    async findAllAdmins(): Promise<string[]> {
        const admins = await this.prisma.user.findMany({
            where: { role: Role.ADMIN, isDeleted: false },
            select: { id: true },
        });
        return admins.map(admin => bufferToUuid(admin.id));
    }

    // ─── Public Seller Profile ──────────────────────────────────────────────────

    async getSellerPublicProfile(idStr: string) {
        const idBuf = uuidToBuffer(idStr);
        const user = await this.prisma.user.findFirst({
            where: {
                id: idBuf,
                role: Role.SELLER,
                isDeleted: false,
                status: UserStatus.ACTIVE,
            },
            include: {
                sellerProfile: true,
            },
        });

        if (!user || !user.sellerProfile) {
            throw new NotFoundException('Seller not found');
        }

        if (user.sellerProfile.verificationStatus !== SellerVerificationStatus.APPROVED) {
            throw new NotFoundException('Seller not found');
        }

        // Count total approved products
        const totalProducts = await this.prisma.product.count({
            where: {
                sellerId: idBuf,
                status: 'APPROVED',
                isDeleted: false,
            },
        });

        // Count total reviews and average rating across all products
        const reviewStats = await this.prisma.review.aggregate({
            where: {
                product: {
                    sellerId: idBuf,
                    isDeleted: false,
                },
            },
            _count: { _all: true },
            _avg: { rating: true },
        });

        const totalReviews = reviewStats._count._all;
        const averageRating = reviewStats._avg.rating || 0;

        // Fetch unique categories that have active products from this seller
        const categoriesData = await this.prisma.product.findMany({
            where: {
                sellerId: idBuf,
                status: 'APPROVED',
                isDeleted: false,
            },
            select: {
                category: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
            distinct: ['categoryId'],
        });

        const shopCategories = categoriesData.map(item => item.category);
        
        // Count total followers
        const followerCount = await this.prisma.follow.count({
            where: { sellerId: idBuf },
        });

        return {
            id: bufferToUuid(user.id),
            username: user.username,
            shopName: user.sellerProfile.shopName,
            sellerType: user.sellerProfile.sellerType,
            shopRating: averageRating,
            pickupAddress: user.sellerProfile.pickupAddress,
            createdAt: user.sellerProfile.createdAt,
            stats: {
                totalProducts,
                totalReviews,
                rating: averageRating,
                joinedAt: user.sellerProfile.createdAt,
                followerCount,
            },
            shopCategories,
        };
    }
}
