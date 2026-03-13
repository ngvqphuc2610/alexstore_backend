import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSupportRequestDto, AdminReplyDto } from './dto/support.dto';
import { bufferToUuid, uuidToBuffer } from '../common/helpers/uuid.helper';
import { SupportRequestStatus } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class SupportService {
    constructor(
        private prisma: PrismaService,
        private eventEmitter: EventEmitter2
    ) { }

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
        const serialized = this.serializeRequest(request);

        this.eventEmitter.emit('support.created', {
            requestId: serialized.id,
            title: serialized.title,
            userId: serialized.userId
        });

        return serialized;
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
        const serialized = this.serializeRequest(updated);

        this.eventEmitter.emit('support.replied', {
            requestId: serialized.id,
            userId: serialized.userId,
            status: serialized.status
        });

        return serialized;
    }
}
