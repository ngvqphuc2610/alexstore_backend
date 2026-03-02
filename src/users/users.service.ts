import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { bufferToUuid, uuidToBuffer } from '../common/helpers/uuid.helper';

@Injectable()
export class UsersService {
    constructor(private prisma: PrismaService) { }

    async findById(idStr: string) {
        const idBuf = uuidToBuffer(idStr);
        const user = await this.prisma.user.findFirst({
            where: { id: idBuf, isDeleted: false },
            select: {
                id: true,
                username: true,
                email: true,
                role: true,
                isSellerVerified: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        if (!user) throw new NotFoundException('User not found');

        return { ...user, id: bufferToUuid(user.id) };
    }

    async update(idStr: string, dto: UpdateUserDto) {
        const idBuf = uuidToBuffer(idStr);
        const user = await this.prisma.user.findFirst({
            where: { id: idBuf, isDeleted: false },
        });
        if (!user) throw new NotFoundException('User not found');

        const updated = await this.prisma.user.update({
            where: { id: idBuf },
            data: dto,
            select: {
                id: true,
                username: true,
                email: true,
                role: true,
                isSellerVerified: true,
                updatedAt: true,
            },
        });

        return { ...updated, id: bufferToUuid(updated.id) };
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
}
