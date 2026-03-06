import { Module } from '@nestjs/common';
import { AdminAnalyticsService } from './admin-analytics.service';
import { AdminAnalyticsController } from './admin-analytics.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    providers: [AdminAnalyticsService],
    controllers: [AdminAnalyticsController],
})
export class AdminAnalyticsModule { }
