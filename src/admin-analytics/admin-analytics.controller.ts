import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { AdminAnalyticsService } from './admin-analytics.service';
import { AnalyticsAggregationService } from './analytics-aggregation.service';

@ApiTags('Admin Analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin-analytics')
export class AdminAnalyticsController {
    constructor(
        private readonly analyticsService: AdminAnalyticsService,
        private readonly aggregationService: AnalyticsAggregationService,
    ) { }

    @Get('overview')
    @ApiOperation({ summary: 'Get overall system stats' })
    async getOverview() {
        return this.analyticsService.getOverview();
    }

    @Get('revenue')
    @ApiOperation({ summary: 'Get revenue trends' })
    async getRevenueAnalytics(
        @Query('range') range?: string,
        @Query('sellerId') sellerId?: string,
        @Query('categoryId') categoryId?: string,
        @Query('from') from?: string,
        @Query('to') to?: string,
    ) {
        return this.analyticsService.getRevenueAnalytics(range, sellerId, categoryId, from, to);
    }

    @Get('orders')
    @ApiOperation({ summary: 'Get order trends and distribution' })
    async getOrdersAnalytics(
        @Query('range') range?: string,
        @Query('sellerId') sellerId?: string,
        @Query('categoryId') categoryId?: string,
        @Query('from') from?: string,
        @Query('to') to?: string,
    ) {
        return this.analyticsService.getOrdersAnalytics(range, sellerId, categoryId, from, to);
    }

    @Get('sellers')
    @ApiOperation({ summary: 'Get seller analytics' })
    async getSellersAnalytics(
        @Query('range') range?: string,
        @Query('sellerId') sellerId?: string,
        @Query('categoryId') categoryId?: string,
        @Query('from') from?: string,
        @Query('to') to?: string,
        @Query('page') page: number = 1,
        @Query('limit') limit: number = 10,
    ) {
        return this.analyticsService.getSellersAnalytics(range, sellerId, categoryId, from, to, +page, +limit);
    }

    @Get('products')
    @ApiOperation({ summary: 'Get product analytics' })
    async getProductsAnalytics(
        @Query('range') range?: string,
        @Query('categoryId') categoryId?: string,
        @Query('from') from?: string,
        @Query('to') to?: string,
        @Query('page') page: number = 1,
        @Query('limit') limit: number = 10,
    ) {
        return this.analyticsService.getProductsAnalytics(range, categoryId, from, to, +page, +limit);
    }

    @Get('sellers-list')
    @ApiOperation({ summary: 'Get list of sellers for filters' })
    async getSellersList() {
        return this.analyticsService.getSellersList();
    }

    @Post('aggregate')
    @ApiOperation({ summary: 'Manually trigger analytics aggregation' })
    async manualAggregate(
        @Query('date') date?: string,
        @Query('days') days: number = 1
    ) {
        const targetDate = date ? new Date(date) : new Date();
        for (let i = 0; i < days; i++) {
            const d = new Date(targetDate);
            d.setDate(d.getDate() - i);
            await this.aggregationService.aggregateDate(d);
        }
        return { message: `Aggregation triggered for ${days} day(s)` };
    }
}
