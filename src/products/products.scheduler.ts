import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class ProductsScheduler implements OnModuleInit {
    private readonly logger = new Logger(ProductsScheduler.name);

    constructor(
        @InjectQueue('products') private readonly productsQueue: Queue
    ) {}

    async onModuleInit() {
        this.logger.log('Registering Low Stock repeatable job...');
        await this.productsQueue.add(
            'check-low-stock',
            {},
            {
                repeat: {
                    pattern: '0 8 * * *', // Run every day at 8:00 AM
                },
                removeOnComplete: true,
                removeOnFail: true,
            }
        );
    }
}
