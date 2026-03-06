import { Module } from '@nestjs/common';
import { AdminAnalyticsService } from './admin-analytics.service';
import { AdminAnalyticsController } from './admin-analytics.controller';
import { AnalyticsAggregationService } from './analytics-aggregation.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    providers: [AdminAnalyticsService, AnalyticsAggregationService],
    controllers: [AdminAnalyticsController],
})
export class AdminAnalyticsModule { }
// Triggering reload for analytics aggregation
