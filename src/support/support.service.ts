import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSupportRequestDto, AdminReplyDto } from './dto/support.dto';
import { bufferToUuid, uuidToBuffer } from '../common/helpers/uuid.helper';
import { SupportRequestStatus } from '@prisma/client';

@Injectable()
export class SupportService {
    constructor(private prisma: PrismaService) { }

    private serializeRequest(req: any) {
        return {
            ...req,
            userId: bufferToUuid(req.userId),
        };
    }

    async create(userId: string, dto: CreateSupportRequestDto) {
        const request = await this.prisma.supportRequest.create({
            data: {
                userId: uuidToBuffer(userId),
                type: dto.type,
                title: dto.title,
                description: dto.description,
                status: SupportRequestStatus.PENDING,
            },
        });
        return this.serializeRequest(request);
    }

    async findAllForUser(userId: string) {
        const requests = await this.prisma.supportRequest.findMany({
            where: { userId: uuidToBuffer(userId) },
            orderBy: { createdAt: 'desc' },
        });
        return requests.map(req => this.serializeRequest(req));
    }

    async findAllForAdmin() {
        const requests = await this.prisma.supportRequest.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                user: {
                    select: {
                        username: true,
                        email: true,
                    },
                },
            },
        });
        return requests.map(req => this.serializeRequest(req));
    }

    async findOne(id: number) {
        const request = await this.prisma.supportRequest.findUnique({
            where: { id },
            include: {
                user: {
                    select: {
                        username: true,
                        email: true,
                    },
                },
            },
        });
        if (!request) throw new NotFoundException('Support request not found');
        return this.serializeRequest(request);
    }

    async reply(id: number, dto: AdminReplyDto) {
        const request = await this.findOne(id);

        const updated = await this.prisma.supportRequest.update({
            where: { id },
            data: {
                adminReply: dto.adminReply,
                status: dto.status,
            },
        });
        return this.serializeRequest(updated);
    }
}
