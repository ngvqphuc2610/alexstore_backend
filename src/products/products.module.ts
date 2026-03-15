import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { BullModule } from '@nestjs/bullmq';
import { ProductsScheduler } from './products.scheduler';
import { ProductsProcessor } from './products.processor';

@Module({
    imports: [
        BullModule.registerQueue({
            name: 'products',
        }),
    ],
    controllers: [ProductsController],
    providers: [ProductsService, ProductsScheduler, ProductsProcessor],
    exports: [ProductsService],
})
export class ProductsModule { }
