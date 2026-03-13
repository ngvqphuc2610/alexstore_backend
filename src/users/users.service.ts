import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { bufferToUuid, uuidToBuffer, generateUuidV7 } from '../common/helpers/uuid.helper';
import * as bcrypt from 'bcrypt';
import { Role } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class UsersService {
    constructor(
        private prisma: PrismaService,
        private eventEmitter: EventEmitter2
    ) { }
    async findAll(page: number = 1, limit: number = 20) {
        const skip = (page - 1) * limit;
        const [total, users] = await Promise.all([
            this.prisma.user.count({ where: { isDeleted: false } }),
            this.prisma.user.findMany({
                where: { isDeleted: false },
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
            data: { isDeleted: true },
        });

        return { message: 'Account deactivated successfully' };
    }

    async findAllAdmins(): Promise<string[]> {
        const admins = await this.prisma.user.findMany({
            where: { role: Role.ADMIN, isDeleted: false },
            select: { id: true },
        });
        return admins.map(admin => bufferToUuid(admin.id));
    }
}
