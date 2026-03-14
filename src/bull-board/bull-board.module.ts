import { Module } from '@nestjs/common';
import { BullBoardModule } from '@bull-board/nestjs';
import { ExpressAdapter } from '@bull-board/express';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';

@Module({
  imports: [
    BullBoardModule.forRoot({
      route: '/admin/queues',
      adapter: ExpressAdapter,
    }),
    // Register all queues to be monitored
    BullBoardModule.forFeature({
      name: 'mail',
      adapter: BullMQAdapter,
    }),
    BullBoardModule.forFeature({
      name: 'products',
      adapter: BullMQAdapter,
    }),
    BullBoardModule.forFeature({
      name: 'orders',
      adapter: BullMQAdapter,
    }),
  ],
})
export class BullBoardConfigModule {}
