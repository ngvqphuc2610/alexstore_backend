import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { uuidToBuffer, bufferToUuid } from '../common/helpers/uuid.helper';
import { OrderStatus } from '@prisma/client';

@Processor('orders')
export class OrdersProcessor extends WorkerHost {
    private readonly logger = new Logger(OrdersProcessor.name);

    constructor(private readonly prisma: PrismaService) {
        super();
    }

    async process(job: Job) {
        if (job.name === 'auto-cancel-order') {
            const { orderId, orderCode } = job.data;
            this.logger.log(`[Auto-Cancel] Checking order ${orderCode} (${orderId})...`);

            const id = uuidToBuffer(orderId);
            const order = await this.prisma.order.findUnique({ where: { id } });

            if (!order) {
                this.logger.warn(`[Auto-Cancel] Order ${orderCode} not found, skipping.`);
                return;
            }

            // Only cancel if still PENDING
            if (order.status !== OrderStatus.PENDING) {
                this.logger.log(`[Auto-Cancel] Order ${orderCode} is "${order.status}", no action needed.`);
                return;
            }

            // Cancel the order and restore stock
            await this.prisma.$transaction(async (tx) => {
                const items = await tx.orderItem.findMany({ where: { orderId: id } });
                for (const item of items) {
                    await tx.product.update({
                        where: { id: item.productId },
                        data: { stockQuantity: { increment: item.quantity } },
                    });
                }
                await tx.order.update({
                    where: { id },
                    data: { status: OrderStatus.CANCELLED },
                });
            });

            this.logger.log(`[Auto-Cancel] Order ${orderCode} has been cancelled and stock restored.`);
        }
    }
}
