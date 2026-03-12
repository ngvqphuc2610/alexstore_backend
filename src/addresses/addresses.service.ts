import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAddressDto, UpdateAddressDto } from './dto/address.dto';
import { bufferToUuid, uuidToBuffer } from '../common/helpers/uuid.helper';

@Injectable()
export class AddressesService {
    constructor(private prisma: PrismaService) {}

    async create(userIdStr: string, data: CreateAddressDto) {
        const userId = uuidToBuffer(userIdStr);

        // Check max limit (Rule 3)
        const currentCount = await this.prisma.address.count({
            where: { userId: userId as any, isDeleted: false }
        });
        if (currentCount >= 10) {
            throw new BadRequestException('You can only have up to 10 addresses');
        }

        // Automatic default if first address
        let isDefault = data.isDefault || false;
        if (currentCount === 0) {
            isDefault = true;
        }

        return this.prisma.$transaction(async (tx) => {
            // Unset previous defaults if we are setting this one as default (Rule 1)
            if (isDefault) {
                await tx.address.updateMany({
                    where: { userId, isDeleted: false },
                    data: { isDefault: false }
                });
            }

            const newAddress = await tx.address.create({
                data: {
                    id: uuidToBuffer(crypto.randomUUID()) as any,
                    userId,
                    fullName: data.fullName,
                    phoneNumber: data.phoneNumber || '',
                    province: data.province || '',
                    district: data.district || '',
                    ward: data.ward || '',
                    addressLine: data.addressLine,
                    isDefault
                }
            });

            return {
                ...newAddress,
                id: bufferToUuid(newAddress.id),
                userId: bufferToUuid(newAddress.userId)
            };
        });
    }

    async findAll(userIdStr: string, includeDeleted: boolean = false) {
        const userId = uuidToBuffer(userIdStr);
        const addresses = await this.prisma.address.findMany({
            where: {
                userId,
                ...(includeDeleted ? {} : { isDeleted: false })
            },
            orderBy: [
                { isDefault: 'desc' },
                { createdAt: 'desc' }
            ]
        });

        return addresses.map(addr => ({
            ...addr,
            id: bufferToUuid(addr.id),
            userId: bufferToUuid(addr.userId)
        }));
    }

    async update(userIdStr: string, idStr: string, data: UpdateAddressDto) {
        const userId = uuidToBuffer(userIdStr);
        const id = uuidToBuffer(idStr);

        const address = await this.prisma.address.findFirst({
            where: { id: id as any, userId: userId as any, isDeleted: false }
        });

        if (!address) {
            throw new NotFoundException('Address not found');
        }

        return this.prisma.$transaction(async (tx) => {
            if (data.isDefault) {
                await tx.address.updateMany({
                    where: { userId, isDeleted: false },
                    data: { isDefault: false }
                });
            }

            const updated = await tx.address.update({
                where: { id: id as any },
                data: {
                    fullName: data.fullName !== undefined ? data.fullName : undefined,
                    phoneNumber: data.phoneNumber !== undefined ? data.phoneNumber : undefined,
                    province: data.province !== undefined ? data.province : undefined,
                    district: data.district !== undefined ? data.district : undefined,
                    ward: data.ward !== undefined ? data.ward : undefined,
                    addressLine: data.addressLine !== undefined ? data.addressLine : undefined,
                    isDefault: data.isDefault !== undefined ? data.isDefault : undefined,
                }
            });

            return {
                ...updated,
                id: bufferToUuid(updated.id),
                userId: bufferToUuid(updated.userId)
            };
        });
    }

    async setDefault(userIdStr: string, idStr: string) {
        const userId = uuidToBuffer(userIdStr);
        const id = uuidToBuffer(idStr);

        const address = await this.prisma.address.findFirst({
            where: { id: id as any, userId: userId as any, isDeleted: false }
        });

        if (!address) {
            throw new NotFoundException('Address not found');
        }

        return this.prisma.$transaction(async (tx) => {
            await tx.address.updateMany({
                where: { userId, isDeleted: false },
                data: { isDefault: false }
            });

            const updated = await tx.address.update({
                where: { id: id as any },
                data: { isDefault: true }
            });

            return {
                ...updated,
                id: bufferToUuid(updated.id),
                userId: bufferToUuid(updated.userId)
            };
        });
    }

    async remove(userIdStr: string, idStr: string) {
        const userId = uuidToBuffer(userIdStr);
        const id = uuidToBuffer(idStr);

        const address = await this.prisma.address.findFirst({
            where: { id: id as any, userId: userId as any, isDeleted: false }
        });

        if (!address) {
            throw new NotFoundException('Address not found');
        }

        const totalActive = await this.prisma.address.count({
            where: { userId: userId as any, isDeleted: false }
        });

        if (address.isDefault && totalActive === 1) {
            throw new BadRequestException('Cannot delete the only default address. Please add another one first.');
        }

        return this.prisma.$transaction(async (tx) => {
            await tx.address.update({
                where: { id: id as any },
                data: { isDeleted: true, isDefault: false }
            });

            // Fallback default (Rule 2)
            if (address.isDefault && totalActive > 1) {
                const nextAddress = await tx.address.findFirst({
                    where: { userId, isDeleted: false },
                    orderBy: { createdAt: 'desc' }
                });

                if (nextAddress) {
                    await tx.address.update({
                        where: { id: nextAddress.id },
                        data: { isDefault: true }
                    });
                }
            }

            return { success: true };
        });
    }
}
