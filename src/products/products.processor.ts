import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { bufferToUuid } from '../common/helpers/uuid.helper';
import { ProductStatus } from '@prisma/client';

@Processor('products')
export class ProductsProcessor extends WorkerHost {
    private readonly logger = new Logger(ProductsProcessor.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly eventEmitter: EventEmitter2
    ) {
        super();
    }

    async process(job: Job) {
        if (job.name === 'check-low-stock') {
            this.logger.log('Running scheduled check for low stock products...');
            
            // Find products with stock < 5
            const lowStockProducts = await this.prisma.product.findMany({
                where: {
                    stockQuantity: { lt: 5 },
                    isDeleted: false,
                    status: ProductStatus.APPROVED
                },
                select: {
                    id: true,
                    name: true,
                    stockQuantity: true,
                    sellerId: true
                }
            });

            this.logger.log(`Found ${lowStockProducts.length} low stock products.`);

            for (const product of lowStockProducts) {
                // Emit an event for each low stock product to reuse existing listeners
                this.eventEmitter.emit('product.low_stock', {
                    productId: bufferToUuid(product.id),
                    productName: product.name,
                    sellerIdStr: bufferToUuid(product.sellerId),
                    stock: product.stockQuantity
                });
            }
        }
    }
}
