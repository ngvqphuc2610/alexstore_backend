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

    async update(idStr: string, dto: UpdateUserDto) {
        const idBuf = uuidToBuffer(idStr);
        const user = await this.prisma.user.findFirst({
            where: { id: idBuf, isDeleted: false },
        });
        if (!user) throw new NotFoundException('User not found');

        const updated = await this.prisma.user.update({
            where: { id: idBuf },
            data: dto,
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
}
